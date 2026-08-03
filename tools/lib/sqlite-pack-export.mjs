import { mkdir, readFile, rm, stat } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

import { validatePack } from '../../src/packs.js';
import {
  SQLITE_ADAPTER_SCHEMA_VERSION,
  stringifyJson,
} from './sqlite-adapter-common.mjs';

const SCHEMA_SQL = `
  PRAGMA journal_mode=DELETE;
  PRAGMA synchronous=NORMAL;
  PRAGMA foreign_keys=ON;
  CREATE TABLE lnote_metadata(
    schema_version INTEGER PRIMARY KEY,
    exported_at TEXT NOT NULL,
    pack_id TEXT NOT NULL,
    manifest_json TEXT NOT NULL
  ) STRICT;
  CREATE TABLE lnote_documents(
    document_order INTEGER PRIMARY KEY,
    document_id TEXT NOT NULL UNIQUE,
    title TEXT NOT NULL,
    summary TEXT,
    authority TEXT,
    effective_from TEXT,
    source_json TEXT,
    tags_json TEXT NOT NULL,
    payload_json TEXT NOT NULL
  ) STRICT;
  CREATE TABLE lnote_sections(
    document_id TEXT NOT NULL,
    section_order INTEGER NOT NULL,
    section_id TEXT NOT NULL,
    title TEXT NOT NULL,
    text TEXT NOT NULL,
    entity_ids_json TEXT NOT NULL,
    tags_json TEXT NOT NULL,
    asset_anchor_json TEXT,
    provenance_json TEXT,
    payload_json TEXT NOT NULL,
    PRIMARY KEY(document_id, section_id),
    FOREIGN KEY(document_id) REFERENCES lnote_documents(document_id) ON DELETE CASCADE
  ) STRICT;
  CREATE TABLE lnote_entities(
    entity_order INTEGER PRIMARY KEY,
    entity_id TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    type TEXT,
    aliases_json TEXT NOT NULL,
    description TEXT,
    payload_json TEXT NOT NULL
  ) STRICT;
  CREATE TABLE lnote_claims(
    claim_order INTEGER PRIMARY KEY,
    claim_id TEXT NOT NULL UNIQUE,
    text TEXT NOT NULL,
    subject_id TEXT,
    object_id TEXT,
    authority TEXT,
    source_document_id TEXT,
    source_section_id TEXT,
    source_quote TEXT,
    payload_json TEXT NOT NULL
  ) STRICT;
  CREATE TABLE lnote_relations(
    relation_order INTEGER PRIMARY KEY,
    source_id TEXT,
    predicate TEXT,
    target_id TEXT,
    payload_json TEXT NOT NULL
  ) STRICT;
  CREATE TABLE lnote_statement_relations(
    relation_order INTEGER PRIMARY KEY,
    relation_id TEXT NOT NULL UNIQUE,
    source_claim_id TEXT NOT NULL,
    target_claim_id TEXT NOT NULL,
    type TEXT NOT NULL,
    status TEXT,
    reason TEXT,
    payload_json TEXT NOT NULL
  ) STRICT;
  CREATE VIRTUAL TABLE lnote_sections_fts USING fts5(
    document_id UNINDEXED,
    section_id UNINDEXED,
    title,
    text,
    tokenize = 'unicode61 remove_diacritics 2',
    prefix = '2 3 4 5'
  );
`;

function assertPack(pack, label = 'Pack') {
  const validation = validatePack(pack);
  if (!validation.valid) throw new Error(`${label} validation failed:\n- ${validation.errors.join('\n- ')}`);
  return pack;
}

function manifestFor(pack) {
  const manifest = { ...pack };
  for (const field of ['documents', 'entities', 'claims', 'relations', 'statementRelations']) {
    delete manifest[field];
  }
  return manifest;
}

function without(object, fields) {
  const output = { ...object };
  for (const field of fields) delete output[field];
  return output;
}

function insertDocuments(database, pack) {
  const insertDocument = database.prepare(`
    INSERT INTO lnote_documents VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const insertSection = database.prepare(`
    INSERT INTO lnote_sections VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const insertFts = database.prepare(`
    INSERT INTO lnote_sections_fts(document_id, section_id, title, text)
    VALUES (?, ?, ?, ?)
  `);
  for (const [documentOrder, document] of pack.documents.entries()) {
    insertDocument.run(
      documentOrder,
      document.id,
      document.title,
      document.summary ?? null,
      document.authority ?? null,
      document.effectiveFrom ?? null,
      document.source ? stringifyJson(document.source) : null,
      stringifyJson(document.tags ?? []),
      stringifyJson(without(document, ['sections'])),
    );
    for (const [sectionOrder, section] of document.sections.entries()) {
      insertSection.run(
        document.id,
        sectionOrder,
        section.id,
        section.title,
        section.text,
        stringifyJson(section.entityIds ?? []),
        stringifyJson(section.tags ?? []),
        section.assetAnchor ? stringifyJson(section.assetAnchor) : null,
        section.provenance ? stringifyJson(section.provenance) : null,
        stringifyJson(section),
      );
      insertFts.run(document.id, section.id, section.title, section.text);
    }
  }
}

function insertEntities(database, pack) {
  const statement = database.prepare(`INSERT INTO lnote_entities VALUES (?, ?, ?, ?, ?, ?, ?)`);
  for (const [index, entity] of pack.entities.entries()) {
    statement.run(
      index,
      entity.id,
      entity.name,
      entity.type ?? null,
      stringifyJson(entity.aliases ?? []),
      entity.description ?? null,
      stringifyJson(entity),
    );
  }
}

function insertClaims(database, pack) {
  const statement = database.prepare(`INSERT INTO lnote_claims VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
  for (const [index, claim] of pack.claims.entries()) {
    statement.run(
      index,
      claim.id,
      claim.text,
      claim.subjectId ?? null,
      claim.objectId ?? null,
      claim.authority ?? null,
      claim.source?.documentId ?? null,
      claim.source?.sectionId ?? null,
      claim.source?.quote ?? null,
      stringifyJson(claim),
    );
  }
}

function insertRelations(database, pack) {
  const statement = database.prepare(`INSERT INTO lnote_relations VALUES (?, ?, ?, ?, ?)`);
  for (const [index, relation] of pack.relations.entries()) {
    statement.run(
      index,
      relation.sourceId ?? null,
      relation.predicate ?? relation.type ?? null,
      relation.targetId ?? null,
      stringifyJson(relation),
    );
  }
}

function insertStatementRelations(database, pack) {
  const statement = database.prepare(`INSERT INTO lnote_statement_relations VALUES (?, ?, ?, ?, ?, ?, ?, ?)`);
  for (const [index, relation] of (pack.statementRelations ?? []).entries()) {
    statement.run(
      index,
      relation.id,
      relation.sourceClaimId,
      relation.targetClaimId,
      relation.type,
      relation.status ?? null,
      relation.reason ?? null,
      stringifyJson(relation),
    );
  }
}

export async function exportPackToSqlite({
  pack,
  outputPath,
  exportedAt = new Date().toISOString(),
} = {}) {
  assertPack(pack);
  if (!outputPath) throw new TypeError('outputPath is required.');
  const output = resolve(outputPath);
  await mkdir(dirname(output), { recursive: true });
  await rm(output, { force: true });
  const database = new DatabaseSync(output, {
    allowExtension: false,
    enableDoubleQuotedStringLiterals: false,
    timeout: 5_000,
  });
  try {
    database.exec(SCHEMA_SQL);
    database.exec('BEGIN IMMEDIATE;');
    try {
      database.prepare('INSERT INTO lnote_metadata VALUES (?, ?, ?, ?)').run(
        SQLITE_ADAPTER_SCHEMA_VERSION,
        exportedAt,
        pack.id,
        stringifyJson(manifestFor(pack)),
      );
      insertDocuments(database, pack);
      insertEntities(database, pack);
      insertClaims(database, pack);
      insertRelations(database, pack);
      insertStatementRelations(database, pack);
      database.exec('COMMIT;');
    } catch (error) {
      database.exec('ROLLBACK;');
      throw error;
    }
    database.exec("INSERT INTO lnote_sections_fts(lnote_sections_fts) VALUES('optimize');");
  } finally {
    database.close();
  }
  return {
    outputPath: output,
    bytes: (await stat(output)).size,
    documents: pack.documents.length,
    sections: pack.documents.reduce((sum, document) => sum + document.sections.length, 0),
  };
}

function parsePayloadRows(database, table) {
  return database.prepare(`SELECT payload_json FROM ${table} ORDER BY rowid`).all()
    .map((row) => JSON.parse(row.payload_json));
}

function hasExportSchema(database) {
  return Boolean(database.prepare(`
    SELECT 1 AS found
    FROM sqlite_schema
    WHERE type = 'table' AND name = 'lnote_metadata'
  `).get()?.found);
}

export function restorePackFromSqlite(inputPath) {
  const database = new DatabaseSync(resolve(inputPath), {
    readOnly: true,
    allowExtension: false,
    enableDoubleQuotedStringLiterals: false,
    timeout: 5_000,
  });
  try {
    if (!hasExportSchema(database)) throw new Error('SQLite file is not an L-Note relational export.');
    const metadata = database.prepare('SELECT * FROM lnote_metadata LIMIT 1').get();
    if (Number(metadata?.schema_version) !== SQLITE_ADAPTER_SCHEMA_VERSION) {
      throw new Error(`Unsupported L-Note SQLite schema version: ${metadata?.schema_version}`);
    }
    const manifest = JSON.parse(metadata.manifest_json);
    const sectionRows = database.prepare(`
      SELECT document_id, payload_json
      FROM lnote_sections
      ORDER BY document_id, section_order
    `).all();
    const sectionsByDocument = new Map();
    for (const row of sectionRows) {
      const values = sectionsByDocument.get(row.document_id) ?? [];
      values.push(JSON.parse(row.payload_json));
      sectionsByDocument.set(row.document_id, values);
    }
    const documents = database.prepare(`
      SELECT document_id, payload_json
      FROM lnote_documents
      ORDER BY document_order
    `).all().map((row) => ({
      ...JSON.parse(row.payload_json),
      sections: sectionsByDocument.get(row.document_id) ?? [],
    }));
    const pack = {
      ...manifest,
      documents,
      entities: parsePayloadRows(database, 'lnote_entities'),
      claims: parsePayloadRows(database, 'lnote_claims'),
      relations: parsePayloadRows(database, 'lnote_relations'),
    };
    const statementRelations = parsePayloadRows(database, 'lnote_statement_relations');
    if (statementRelations.length) pack.statementRelations = statementRelations;
    return assertPack(pack, 'Restored pack');
  } finally {
    database.close();
  }
}

export async function restorePackFile({ inputPath, outputPath } = {}) {
  if (!inputPath || !outputPath) throw new TypeError('inputPath and outputPath are required.');
  const pack = restorePackFromSqlite(inputPath);
  await mkdir(dirname(resolve(outputPath)), { recursive: true });
  await import('node:fs/promises').then(({ writeFile }) => (
    writeFile(resolve(outputPath), `${JSON.stringify(pack, null, 2)}\n`)
  ));
  return { outputPath: resolve(outputPath), pack };
}

export async function exportPackFile({ inputPath, outputPath, exportedAt } = {}) {
  if (!inputPath || !outputPath) throw new TypeError('inputPath and outputPath are required.');
  const pack = JSON.parse(await readFile(resolve(inputPath), 'utf8'));
  return exportPackToSqlite({ pack, outputPath, exportedAt });
}
