import { basename, join, resolve } from 'node:path';
import { rm } from 'node:fs/promises';
import { DatabaseSync } from 'node:sqlite';

import {
  DEFAULT_MAX_CELL_CHARS,
  DEFAULT_MAX_DATABASE_ROWS,
  DEFAULT_MAX_SECTION_CHARS,
  assertEmptyOutputDirectory,
  jsonSafe,
  quoteIdentifier,
  writeJson,
} from './sqlite-adapter-common.mjs';
import { writeSqliteDocument } from './sqlite-document-writer.mjs';
import { createSqliteObjectImport } from './sqlite-object-import.mjs';
import { readSqliteStageSources } from './sqlite-stage-provenance.mjs';

const INTERNAL_PREFIX = 'lnote_';

function openReadOnly(filename) {
  return new DatabaseSync(resolve(filename), {
    readOnly: true,
    allowExtension: false,
    enableDoubleQuotedStringLiterals: false,
    readBigInts: true,
    timeout: 5_000,
  });
}

function databaseObjects(database) {
  return database.prepare(`
    SELECT name, type, sql
    FROM sqlite_schema
    WHERE type IN ('table', 'view')
      AND name NOT LIKE 'sqlite_%'
    ORDER BY type, name
  `).all();
}

function objectColumns(database, name) {
  return database.prepare(`PRAGMA table_xinfo(${quoteIdentifier(name)})`).all()
    .map((column) => ({
      name: column.name,
      type: column.type || '',
      notNull: Boolean(column.notnull),
      defaultValue: jsonSafe(column.dflt_value),
      primaryKeyOrder: Number(column.pk || 0),
      hidden: Number(column.hidden || 0),
    }));
}

export function inspectSqliteDatabase(filename) {
  const database = openReadOnly(filename);
  try {
    return databaseObjects(database).map((object) => ({
      name: object.name,
      type: object.type,
      columns: objectColumns(database, object.name),
    }));
  } finally {
    database.close();
  }
}

function mappingFor(mapping, name) {
  const tables = mapping?.tables;
  if (!tables) return {};
  if (Array.isArray(tables)) return tables.find((item) => item?.table === name) ?? {};
  return tables[name] ?? {};
}

function selectedObjects(objects, tables, mapping) {
  const requested = new Set((tables ?? []).filter(Boolean));
  const mappedNames = Array.isArray(mapping?.tables)
    ? mapping.tables.map((item) => item?.table).filter(Boolean)
    : Object.keys(mapping?.tables ?? {});
  if (!requested.size && mappedNames.length) mappedNames.forEach((name) => requested.add(name));
  const available = new Map(objects.map((object) => [object.name, object]));
  for (const name of requested) {
    if (!available.has(name)) throw new Error(`SQLite object not found: ${name}`);
  }
  return objects.filter((object) => (
    requested.size ? requested.has(object.name) : !object.name.startsWith(INTERNAL_PREFIX)
  ));
}

function importOptions(inputPath, database, values) {
  return {
    maxRowsPerTable: Math.max(1, Number(values.maxRowsPerTable) || DEFAULT_MAX_DATABASE_ROWS),
    maxCellChars: Math.max(100, Number(values.maxCellChars) || DEFAULT_MAX_CELL_CHARS),
    maxSectionChars: Math.max(500, Number(values.maxSectionChars) || DEFAULT_MAX_SECTION_CHARS),
    databaseFile: basename(resolve(inputPath)),
    generatedAt: values.generatedAt,
    stageSources: readSqliteStageSources(database),
  };
}

async function writeAuthoringMetadata(outputRoot, metadata) {
  await Promise.all([
    writeJson(join(outputRoot, 'manifest.json'), {
      schemaVersion: 1,
      id: metadata.id,
      version: metadata.version,
      title: metadata.title,
      description: metadata.description,
      language: metadata.language,
      publishedAt: metadata.generatedAt,
      license: 'user-supplied',
      tags: ['user-pack', 'prepared-database', 'sqlite'],
    }),
    writeJson(join(outputRoot, 'entities.json'), []),
    writeJson(join(outputRoot, 'claims.json'), []),
    writeJson(join(outputRoot, 'relations.json'), []),
  ]);
}

export async function prepareSqliteDirectory({
  inputPath,
  outputPath,
  id,
  version = '1.0.0',
  title = id,
  description = 'Пакет, подготовленный из SQLite',
  language = 'ru',
  tables = [],
  mapping = {},
  maxRowsPerTable = DEFAULT_MAX_DATABASE_ROWS,
  maxCellChars = DEFAULT_MAX_CELL_CHARS,
  maxSectionChars = DEFAULT_MAX_SECTION_CHARS,
  generatedAt = new Date().toISOString(),
  onProgress = () => {},
} = {}) {
  if (!inputPath || !outputPath || !id) throw new TypeError('inputPath, outputPath and id are required.');
  const outputRoot = await assertEmptyOutputDirectory(outputPath);
  let database;
  const warnings = [];
  try {
    database = openReadOnly(inputPath);
    const objects = databaseObjects(database).map((object) => ({
      ...object,
      columns: objectColumns(database, object.name),
    }));
    const selected = selectedObjects(objects, tables, mapping);
    if (!selected.length) throw new Error('No SQLite tables or views selected for import.');
    const options = importOptions(inputPath, database, {
      maxRowsPerTable,
      maxCellChars,
      maxSectionChars,
      generatedAt,
    });
    await writeAuthoringMetadata(outputRoot, {
      id,
      version,
      title,
      description,
      language,
      generatedAt,
    });

    let documents = 0;
    let sections = 0;
    for (const [index, object] of selected.entries()) {
      onProgress({ stage: 'object', index, total: selected.length, table: object.name });
      const operation = createSqliteObjectImport(
        database,
        object,
        mappingFor(mapping, object.name),
        options,
        warnings,
        onProgress,
      );
      const result = await writeSqliteDocument(outputRoot, operation);
      documents += 1;
      sections += result.sections;
      onProgress({
        stage: 'written',
        index,
        total: selected.length,
        table: object.name,
        rows: result.rows,
        sections: result.sections,
      });
    }
    onProgress({ stage: 'done', total: selected.length });
    return {
      outputPath: outputRoot,
      objects: selected.length,
      documents,
      sections,
      warnings: [...new Set(warnings)],
    };
  } catch (error) {
    await rm(outputRoot, { recursive: true, force: true });
    throw error;
  } finally {
    database?.close();
  }
}
