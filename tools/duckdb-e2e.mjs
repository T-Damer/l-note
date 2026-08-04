import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { DatabaseSync } from 'node:sqlite';
import os from 'node:os';
import path from 'node:path';
import MiniSearch from 'minisearch';

import { buildPack } from './build-pack.mjs';
import {
  DUCKDB_BRIDGE_CONFIG_KIND,
  DUCKDB_BRIDGE_SCHEMA_VERSION,
} from './lib/duckdb-bridge-config.mjs';
import {
  inspectDuckDbExecutable,
  runDuckDb,
  stageDuckDbSources,
} from './lib/duckdb-bridge.mjs';
import { prepareSqliteDirectory } from './lib/sqlite-source-import.mjs';
import { flattenKnowledge, validatePack } from '../src/packs.js';
import { createSearchEngine } from '../src/search.js';

function sqlLiteral(value) {
  return `'${String(value).replaceAll("'", "''")}'`;
}

function plainRows(rows) {
  return rows.map((row) => Object.fromEntries(Object.entries(row)));
}

function createSqliteSource(filename) {
  const database = new DatabaseSync(filename);
  try {
    database.exec('CREATE TABLE notes(id INTEGER PRIMARY KEY, title TEXT, body TEXT);');
    database.prepare('INSERT INTO notes VALUES (?, ?, ?)').run(
      30,
      'SQLite note',
      'Source text from the real SQLite scanner.',
    );
  } finally {
    database.close();
  }
}

function stageConfig() {
  return {
    schemaVersion: DUCKDB_BRIDGE_SCHEMA_VERSION,
    kind: DUCKDB_BRIDGE_CONFIG_KIND,
    sources: [
      {
        type: 'csv',
        path: './articles.csv',
        table: 'csv_articles',
        options: { header: true, all_varchar: true },
      },
      {
        type: 'parquet',
        path: './metrics.parquet',
        table: 'parquet_metrics',
      },
      {
        type: 'sqlite',
        path: './source.sqlite',
        alias: 'source_sqlite',
        tables: [{ source: 'notes', target: 'source_notes' }],
      },
    ],
  };
}

function mapping() {
  return {
    tables: {
      csv_articles: {
        idColumns: ['id'],
        titleColumn: 'title',
        textColumns: ['title', 'body'],
      },
      parquet_metrics: {
        idColumns: ['id'],
        titleColumn: 'title',
        textColumns: ['title', 'body', 'value'],
      },
      source_notes: {
        idColumns: ['id'],
        titleColumn: 'title',
        textColumns: ['title', 'body'],
      },
    },
  };
}

function inspectStage(filename) {
  const database = new DatabaseSync(filename, { readOnly: true });
  try {
    const sourceTypes = plainRows(database.prepare(`
      SELECT target_table, source_type
      FROM lnote_stage_sources
      ORDER BY target_table
    `).all());
    assert.deepEqual(sourceTypes, [
      { target_table: 'csv_articles', source_type: 'csv' },
      { target_table: 'parquet_metrics', source_type: 'parquet' },
      { target_table: 'source_notes', source_type: 'sqlite' },
    ]);
    assert.deepEqual(plainRows(database.prepare('SELECT * FROM csv_articles').all()), [{
      id: '10',
      title: 'CSV article',
      body: 'Source text from the real CSV reader.',
    }]);
    assert.deepEqual(plainRows(database.prepare('SELECT * FROM parquet_metrics').all()), [{
      id: 20,
      title: 'Parquet metric',
      body: 'Source text from the real Parquet reader.',
      value: 42.5,
    }]);
    assert.deepEqual(plainRows(database.prepare('SELECT * FROM source_notes').all()), [{
      id: 30,
      title: 'SQLite note',
      body: 'Source text from the real SQLite scanner.',
    }]);
  } finally {
    database.close();
  }
}

function searchPack(pack) {
  const previous = globalThis.MiniSearch;
  globalThis.MiniSearch = MiniSearch;
  try {
    const records = flattenKnowledge([pack], []);
    const search = createSearchEngine(records, pack.entities);
    for (const [query, expectedDocument] of [
      ['real CSV reader', 'doc.csv_articles'],
      ['real Parquet reader', 'doc.parquet_metrics'],
      ['real SQLite scanner', 'doc.source_notes'],
    ]) {
      const results = search.search(query, { limit: 3 });
      assert.equal(results[0]?.documentId, expectedDocument, `${query}: ${JSON.stringify(results)}`);
    }
  } finally {
    if (previous === undefined) delete globalThis.MiniSearch;
    else globalThis.MiniSearch = previous;
  }
}

async function main() {
  const executable = process.env.DUCKDB_BIN;
  if (!executable) throw new Error('DUCKDB_BIN must point to the pinned DuckDB CLI.');
  const directory = await mkdtemp(path.join(os.tmpdir(), 'lnote-duckdb-e2e-'));
  try {
    const csv = path.join(directory, 'articles.csv');
    const parquet = path.join(directory, 'metrics.parquet');
    const sqlite = path.join(directory, 'source.sqlite');
    const configPath = path.join(directory, 'stage.json');
    const stagePath = path.join(directory, 'stage.sqlite');
    const preparedPath = path.join(directory, 'prepared');
    await writeFile(csv, [
      'id,title,body',
      '10,CSV article,Source text from the real CSV reader.',
      '',
    ].join('\n'));
    createSqliteSource(sqlite);
    await runDuckDb({
      executable,
      cwd: directory,
      sql: `COPY (
        SELECT 20 AS id,
          'Parquet metric' AS title,
          'Source text from the real Parquet reader.' AS body,
          42.5 AS value
      ) TO ${sqlLiteral(parquet)} (FORMAT PARQUET);`,
    });
    await writeFile(configPath, `${JSON.stringify(stageConfig(), null, 2)}\n`);

    const executableInfo = await inspectDuckDbExecutable(executable);
    assert.match(executableInfo.output, /v?1\.4\.5/u);
    const stagedAt = '2026-08-04T15:30:00.000Z';
    const staged = await stageDuckDbSources({
      configPath,
      outputPath: stagePath,
      executable,
      stagedAt,
    });
    assert.deepEqual(staged.targets, ['csv_articles', 'parquet_metrics', 'source_notes']);
    assert.deepEqual(staged.objects.map((object) => object.name), staged.targets);
    assert.ok(staged.bytes > 0);
    inspectStage(stagePath);

    await prepareSqliteDirectory({
      inputPath: stagePath,
      outputPath: preparedPath,
      id: 'acceptance.duckdb-real',
      title: 'Real DuckDB bridge acceptance',
      tables: staged.targets,
      mapping: mapping(),
      generatedAt: stagedAt,
    });
    const pack = await buildPack(preparedPath);
    const validation = validatePack(pack);
    assert.equal(validation.valid, true, validation.errors.join('\n'));
    assert.equal(pack.documents.length, 3);
    assert.deepEqual(
      pack.documents.map((document) => document.source.staging.sourceType).sort(),
      ['csv', 'parquet', 'sqlite'],
    );
    assert.ok(pack.documents.every((document) => document.tags.includes('duckdb-stage')));
    searchPack(pack);
    console.log(`DuckDB ${executableInfo.output}: staged, imported and searched 3 real source types.`);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack ?? error.message : String(error));
  process.exitCode = 1;
});
