import { basename, join, resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

import { slugify } from './pack-builder.mjs';
import {
  DEFAULT_MAX_CELL_CHARS,
  DEFAULT_MAX_DATABASE_ROWS,
  DEFAULT_MAX_SECTION_CHARS,
  assertEmptyOutputDirectory,
  formatCell,
  jsonSafe,
  quoteIdentifier,
  rowStableId,
  splitSection,
  writeJson,
} from './sqlite-adapter-common.mjs';

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

function visibleColumns(columns) {
  return columns.filter((column) => column.hidden !== 1);
}

function assertColumnsExist(table, columns, requested, label) {
  const available = new Set(columns.map((column) => column.name));
  for (const name of requested ?? []) {
    if (!available.has(name)) throw new Error(`${table}: unknown ${label} column ${name}`);
  }
}

function tablePlan(object, mapping) {
  const columns = visibleColumns(object.columns);
  const columnNames = columns.map((column) => column.name);
  const primaryKeyColumns = columns
    .filter((column) => column.primaryKeyOrder > 0)
    .sort((left, right) => left.primaryKeyOrder - right.primaryKeyOrder)
    .map((column) => column.name);
  const idColumns = mapping.idColumns ?? primaryKeyColumns;
  const orderColumns = mapping.orderColumns ?? idColumns;
  const textColumns = mapping.textColumns ?? columnNames;
  const tagColumns = mapping.tagColumns ?? [];
  const titleColumn = mapping.titleColumn ?? null;
  assertColumnsExist(object.name, columns, idColumns, 'identity');
  assertColumnsExist(object.name, columns, orderColumns, 'order');
  assertColumnsExist(object.name, columns, textColumns, 'text');
  assertColumnsExist(object.name, columns, tagColumns, 'tag');
  if (titleColumn) assertColumnsExist(object.name, columns, [titleColumn], 'title');
  return {
    columns,
    idColumns,
    orderColumns,
    textColumns,
    tagColumns,
    titleColumn,
    documentTitle: mapping.documentTitle ?? object.name,
    documentSummary: mapping.documentSummary ?? `Импортировано из SQLite ${object.type} ${object.name}`,
  };
}

function rowIdentity(row, idColumns) {
  return Object.fromEntries(idColumns.map((column) => [column, jsonSafe(row[column])]));
}

function rowTitle(plan, row, identity, rowNumber) {
  const explicit = plan.titleColumn ? formatCell(row[plan.titleColumn]).text.trim() : '';
  if (explicit && explicit !== '(null)') return explicit.slice(0, 180);
  const identityText = Object.values(identity).filter((value) => value !== null).join(' · ');
  return `${plan.documentTitle} · ${identityText || `строка ${rowNumber}`}`;
}

function rowText(plan, row, options, warnings, table, rowNumber) {
  const blocks = [];
  for (const column of plan.textColumns) {
    const formatted = formatCell(row[column], { maxChars: options.maxCellChars });
    if (formatted.truncated) warnings.push(`${table}, строка ${rowNumber}, ${column}: значение обрезано.`);
    const separator = formatted.text.includes('\n') ? ':\n' : ': ';
    blocks.push(`${column}${separator}${formatted.text}`);
  }
  return blocks.join('\n\n') || '(пустая строка)';
}

function rowTags(plan, row, object) {
  const tags = ['sqlite', object.type, object.name];
  for (const column of plan.tagColumns) {
    const value = row[column];
    if (value === null || value instanceof Uint8Array) continue;
    tags.push(...String(value).split(/[,;|]/gu).map((item) => item.trim()).filter(Boolean));
  }
  return [...new Set(tags)];
}

function selectSql(object, plan, warnings) {
  if (plan.orderColumns.length) {
    return `SELECT * FROM ${quoteIdentifier(object.name)} ORDER BY ${plan.orderColumns.map(quoteIdentifier).join(', ')}`;
  }
  if (object.type === 'table') return `SELECT * FROM ${quoteIdentifier(object.name)} ORDER BY rowid`;
  warnings.push(`${object.name}: порядок строк view не определён; задайте orderColumns в mapping.`);
  return `SELECT * FROM ${quoteIdentifier(object.name)}`;
}

function uniqueRowId(object, identity, rowNumber, usedIds, warnings) {
  let id = rowStableId(object.name, identity, rowNumber);
  if (usedIds.has(id)) {
    warnings.push(`${object.name}, строка ${rowNumber}: identity не уникален; ID дополнен номером строки.`);
    id = rowStableId(object.name, { ...identity, __rowNumber: rowNumber }, rowNumber);
  }
  usedIds.add(id);
  return id;
}

function importObject(database, object, mapping, options, warnings, onProgress) {
  const plan = tablePlan(object, mapping);
  const sections = [];
  const usedIds = new Set();
  const statement = database.prepare(selectSql(object, plan, warnings));
  let rowNumber = 0;
  let truncated = false;
  for (const row of statement.iterate()) {
    rowNumber += 1;
    if (rowNumber > options.maxRowsPerTable) {
      truncated = true;
      break;
    }
    const identity = rowIdentity(row, plan.idColumns);
    const id = uniqueRowId(object, identity, rowNumber, usedIds, warnings);
    const title = rowTitle(plan, row, identity, rowNumber);
    const metadata = {
      provenance: {
        kind: 'sqlite-row',
        table: object.name,
        objectType: object.type,
        rowNumber,
        identity,
        columns: plan.textColumns,
        orderColumns: plan.orderColumns,
      },
    };
    const rowSections = splitSection({
      id,
      title,
      text: rowText(plan, row, options, warnings, object.name, rowNumber),
      maxChars: options.maxSectionChars,
      metadata,
    });
    for (const section of rowSections) section.tags = rowTags(plan, row, object);
    sections.push(...rowSections);
    if (rowNumber % 500 === 0) onProgress({ stage: 'rows', table: object.name, rows: rowNumber });
  }
  if (truncated) warnings.push(`${object.name}: импорт ограничен ${options.maxRowsPerTable} строками.`);
  if (!sections.length) {
    sections.push({
      id: 'empty',
      title: 'Нет строк',
      text: `${object.name} не содержит строк.`,
      entityIds: [],
      tags: ['sqlite', object.type, object.name],
      provenance: { kind: 'sqlite-empty', table: object.name, objectType: object.type },
    });
  }
  return {
    id: `doc.${slugify(object.name)}`,
    title: plan.documentTitle,
    summary: plan.documentSummary,
    authority: 'reference',
    effectiveFrom: null,
    source: {
      title: object.name,
      databaseFile: options.databaseFile,
      databaseType: 'sqlite',
      objectType: object.type,
      adapter: 'node:sqlite',
      preparedAt: options.generatedAt,
      columns: plan.columns,
      orderColumns: plan.orderColumns,
    },
    tags: ['sqlite', object.type, object.name],
    sections,
    ...(truncated ? { extractionWarnings: [`Импорт ограничен ${options.maxRowsPerTable} строками.`] } : {}),
  };
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
  const database = openReadOnly(inputPath);
  const warnings = [];
  try {
    const objects = databaseObjects(database).map((object) => ({
      ...object,
      columns: objectColumns(database, object.name),
    }));
    const selected = selectedObjects(objects, tables, mapping);
    if (!selected.length) throw new Error('No SQLite tables or views selected for import.');
    const options = {
      maxRowsPerTable: Math.max(1, Number(maxRowsPerTable) || DEFAULT_MAX_DATABASE_ROWS),
      maxCellChars: Math.max(100, Number(maxCellChars) || DEFAULT_MAX_CELL_CHARS),
      maxSectionChars: Math.max(500, Number(maxSectionChars) || DEFAULT_MAX_SECTION_CHARS),
      databaseFile: basename(resolve(inputPath)),
      generatedAt,
    };
    const documents = [];
    for (const [index, object] of selected.entries()) {
      onProgress({ stage: 'object', index, total: selected.length, table: object.name });
      documents.push(importObject(
        database,
        object,
        mappingFor(mapping, object.name),
        options,
        warnings,
        onProgress,
      ));
    }
    await Promise.all([
      writeJson(join(outputRoot, 'manifest.json'), {
        schemaVersion: 1,
        id,
        version,
        title,
        description,
        language,
        publishedAt: generatedAt,
        license: 'user-supplied',
        tags: ['user-pack', 'prepared-database', 'sqlite'],
      }),
      writeJson(join(outputRoot, 'entities.json'), []),
      writeJson(join(outputRoot, 'claims.json'), []),
      writeJson(join(outputRoot, 'relations.json'), []),
      ...documents.map((document) => writeJson(
        join(outputRoot, 'documents', `${slugify(document.id)}.json`),
        document,
      )),
    ]);
    onProgress({ stage: 'done', total: selected.length });
    return {
      outputPath: outputRoot,
      objects: selected.length,
      documents: documents.length,
      sections: documents.reduce((sum, document) => sum + document.sections.length, 0),
      warnings: [...new Set(warnings)],
    };
  } finally {
    database.close();
  }
}
