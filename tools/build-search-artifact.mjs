#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { basename, dirname, resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

import { knowledgeCorpusFingerprint } from '../src/core/runtime.js';
import {
  PREBUILT_SEARCH_ARTIFACT_VERSION,
  PREBUILT_SQLITE_ARTIFACT_KIND,
} from '../src/helpers/prebuilt-search-artifacts.js';
import {
  SQLITE_FTS_RUNTIME_VERSION,
  sqliteFtsRecordValues,
} from '../src/helpers/sqlite-fts.js';
import { flattenKnowledge, validatePack } from '../src/packs.js';

const INSERT_SQL = `
  INSERT INTO records_fts(
    id, payload, title, document_title, body, aliases, entity_names, tags
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
`;
const SCHEMA_SQL = `
  PRAGMA journal_mode=DELETE;
  PRAGMA synchronous=NORMAL;
  PRAGMA temp_store=MEMORY;
  CREATE VIRTUAL TABLE records_fts USING fts5(
    id UNINDEXED,
    payload UNINDEXED,
    title,
    document_title,
    body,
    aliases,
    entity_names,
    tags,
    tokenize = 'unicode61 remove_diacritics 2',
    prefix = '2 3 4 5'
  );
  CREATE VIRTUAL TABLE records_vocab USING fts5vocab(records_fts, 'row');
  CREATE TABLE search_meta(
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );
`;

function argumentsFrom(argv) {
  const output = {};
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === '--help' || token === '-h') {
      output.help = true;
      continue;
    }
    const key = token.startsWith('--')
      ? token.slice(2).replace(/-([a-z])/gu, (_, letter) => letter.toUpperCase())
      : output.input ? null : 'input';
    if (!key) throw new Error(`Unexpected argument: ${token}`);
    if (key === 'input' && !token.startsWith('--')) {
      output.input = token;
      continue;
    }
    const value = argv[index + 1];
    if (!value || value.startsWith('--')) throw new Error(`Missing value for ${token}`);
    output[key] = value;
    index += 1;
  }
  return output;
}

function usage() {
  return `L-Note prebuilt SQLite/FTS artifact builder

Usage:
  node tools/build-search-artifact.mjs \\
    --input ./dist/large.pack.json \\
    --database ./dist/large.search.sqlite \\
    --pack-output ./dist/large.with-search.pack.json \\
    --url ./large.search.sqlite

The output pack references the database by URL and checksum. The original pack is not modified.`;
}

function safeId(pack) {
  return `search.${pack.id}.${pack.version}`.replace(/[^a-z0-9._-]+/giu, '-');
}

function writeMetadata(database, values) {
  const statement = database.prepare(
    'INSERT OR REPLACE INTO search_meta(key, value) VALUES (?, ?)',
  );
  for (const [key, value] of Object.entries(values)) statement.run(key, String(value));
}

function buildDatabase(filename, records, metadata) {
  const database = new DatabaseSync(filename);
  try {
    const fts = database.prepare("SELECT sqlite_compileoption_used('ENABLE_FTS5') AS enabled").get();
    if (!Number(fts?.enabled)) throw new Error('The installed Node.js SQLite build does not include FTS5.');
    database.exec(SCHEMA_SQL);
    const insert = database.prepare(INSERT_SQL);
    database.exec('BEGIN;');
    try {
      for (const record of records) insert.run(...sqliteFtsRecordValues(record));
      writeMetadata(database, metadata);
      database.exec('COMMIT;');
    } catch (error) {
      database.exec('ROLLBACK;');
      throw error;
    }
    database.exec("INSERT INTO records_fts(records_fts) VALUES('optimize');");
    database.exec('VACUUM;');
    const quick = database.prepare('PRAGMA quick_check;').get();
    if (String(Object.values(quick ?? {})[0] ?? '').toLowerCase() !== 'ok') {
      throw new Error('Built SQLite artifact failed quick_check.');
    }
  } finally {
    database.close();
  }
}

export async function buildPrebuiltSearchArtifact({
  inputPath,
  databasePath,
  packOutputPath,
  artifactUrl,
  builtAt = new Date().toISOString(),
} = {}) {
  if (!inputPath || !databasePath || !packOutputPath) {
    throw new TypeError('inputPath, databasePath and packOutputPath are required.');
  }
  const input = resolve(inputPath);
  const databaseFile = resolve(databasePath);
  const packOutput = resolve(packOutputPath);
  const pack = JSON.parse(await readFile(input, 'utf8'));
  const validation = validatePack(pack);
  if (!validation.valid) throw new Error(`Input pack is invalid: ${validation.errors.join('; ')}`);
  const records = flattenKnowledge([pack], []);
  if (!records.length) throw new Error('Input pack contains no searchable records.');
  const corpusFingerprint = knowledgeCorpusFingerprint([pack], []);

  await mkdir(dirname(databaseFile), { recursive: true });
  await rm(databaseFile, { force: true });
  buildDatabase(databaseFile, records, {
    artifactFormatVersion: PREBUILT_SEARCH_ARTIFACT_VERSION,
    artifactKind: PREBUILT_SQLITE_ARTIFACT_KIND,
    artifactRuntime: SQLITE_FTS_RUNTIME_VERSION,
    fingerprint: corpusFingerprint,
    recordCount: records.length,
    builtAt,
    packId: pack.id,
    packVersion: pack.version,
  });

  const databaseBuffer = await readFile(databaseFile);
  const artifact = {
    id: safeId(pack),
    kind: PREBUILT_SQLITE_ARTIFACT_KIND,
    formatVersion: PREBUILT_SEARCH_ARTIFACT_VERSION,
    runtime: SQLITE_FTS_RUNTIME_VERSION,
    url: artifactUrl ?? `./${basename(databaseFile)}`,
    sha256: createHash('sha256').update(databaseBuffer).digest('hex'),
    bytes: databaseBuffer.byteLength,
    corpusFingerprint,
    recordCount: records.length,
  };
  const nextPack = {
    ...pack,
    searchArtifacts: [
      ...(pack.searchArtifacts ?? []).filter((item) => item.id !== artifact.id),
      artifact,
    ].sort((left, right) => left.id.localeCompare(right.id)),
  };
  const nextValidation = validatePack(nextPack);
  if (!nextValidation.valid) {
    throw new Error(`Pack with search artifact is invalid: ${nextValidation.errors.join('; ')}`);
  }
  await mkdir(dirname(packOutput), { recursive: true });
  await writeFile(packOutput, `${JSON.stringify(nextPack, null, 2)}\n`);
  const fileInfo = await stat(databaseFile);
  return {
    artifact,
    pack: nextPack,
    databasePath: databaseFile,
    packOutputPath: packOutput,
    bytes: fileInfo.size,
  };
}

async function main() {
  const args = argumentsFrom(process.argv.slice(2));
  if (args.help) {
    console.log(usage());
    return;
  }
  if (!args.input || !args.database || !args.packOutput) {
    throw new Error(`${usage()}\n\n--input, --database and --pack-output are required.`);
  }
  const result = await buildPrebuiltSearchArtifact({
    inputPath: args.input,
    databasePath: args.database,
    packOutputPath: args.packOutput,
    artifactUrl: args.url,
  });
  console.log(`Built ${result.databasePath}`);
  console.log(`Updated pack: ${result.packOutputPath}`);
  console.log(`${result.artifact.recordCount} records, ${result.bytes} bytes`);
  console.log(`SHA-256 ${result.artifact.sha256}`);
}

const isEntrypoint = process.argv[1] && import.meta.url === new URL(`file://${resolve(process.argv[1])}`).href;
if (isEntrypoint) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
