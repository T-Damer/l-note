import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { DatabaseSync } from 'node:sqlite';

import { buildPack } from '../tools/build-pack.mjs';
import { argumentsFrom, runDatabaseCommand } from '../tools/database-pack.mjs';
import {
  DUCKDB_BRIDGE_CONFIG_KIND,
  DUCKDB_BRIDGE_SCHEMA_VERSION,
} from '../tools/lib/duckdb-bridge-config.mjs';
import { stageDuckDbSources } from '../tools/lib/duckdb-bridge.mjs';
import { buildDuckDbStageSql } from '../tools/lib/duckdb-bridge-sql.mjs';
import { prepareSqliteDirectory } from '../tools/lib/sqlite-source-import.mjs';

async function temporaryDirectory() {
  return mkdtemp(path.join(os.tmpdir(), 'lnote-duckdb-bridge-'));
}

function baseConfig(sources) {
  return {
    schemaVersion: DUCKDB_BRIDGE_SCHEMA_VERSION,
    kind: DUCKDB_BRIDGE_CONFIG_KIND,
    sources,
  };
}

test('builds locked-down DuckDB SQL for local files', async () => {
  const directory = await temporaryDirectory();
  try {
    await writeFile(path.join(directory, 'articles.csv'), 'id,title\n1,First\n');
    const output = path.join(directory, 'stage.sqlite');
    const plan = buildDuckDbStageSql(baseConfig([{
      type: 'csv',
      path: './articles.csv',
      table: 'articles',
      options: { header: true, all_varchar: true },
    }]), {
      outputPath: output,
      configDirectory: directory,
      stagedAt: '2026-08-03T00:00:00.000Z',
    });

    assert.deepEqual(plan.targets, ['articles']);
    assert.match(plan.sql, /allow_unsigned_extensions = false/u);
    assert.match(plan.sql, /allow_community_extensions = false/u);
    assert.match(plan.sql, /autoinstall_known_extensions = false/u);
    assert.match(plan.sql, /ATTACH '.+stage\.sqlite' AS lnote_stage \(TYPE sqlite\)/u);
    assert.match(plan.sql, /read_csv\('.+articles\.csv', header = true, all_varchar = true\)/u);
    assert.match(plan.sql, /CREATE TABLE lnote_stage\."articles"/u);
    assert.match(plan.sql, /lnote_stage_sources/u);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('uses temporary environment-backed secrets and read-only remote attachments', () => {
  const environment = {
    PG_HOST: 'db.internal',
    PG_PORT: '5432',
    PG_DATABASE: 'knowledge',
    PG_USER: 'reader',
    PG_PASSWORD: 'private-password',
  };
  const plan = buildDuckDbStageSql(baseConfig([{
    type: 'postgres',
    alias: 'source_db',
    secretEnv: {
      host: 'PG_HOST',
      port: 'PG_PORT',
      database: 'PG_DATABASE',
      user: 'PG_USER',
      password: 'PG_PASSWORD',
    },
    tables: [{ source: 'public.articles', target: 'articles' }],
  }]), {
    outputPath: '/tmp/stage.sqlite',
    environment,
  });

  assert.match(plan.sql, /CREATE TEMPORARY SECRET/u);
  assert.match(plan.sql, /TYPE postgres/u);
  assert.match(plan.sql, /ATTACH '' AS "source_db" \(TYPE postgres, READ_ONLY, SECRET/u);
  assert.match(plan.sql, /"source_db"\."public"\."articles"/u);
  assert.doesNotMatch(plan.sql, /PG_PASSWORD/u);
  assert.doesNotMatch(plan.sql, /"password":"private-password"/u);
  assert.deepEqual(plan.redactions, ['private-password']);
});

test('rejects raw SQL, inline credentials and duplicate targets', () => {
  assert.throws(() => buildDuckDbStageSql(baseConfig([{
    type: 'csv',
    path: './data.csv',
    table: 'data',
    sql: 'DROP TABLE anything',
  }]), { outputPath: '/tmp/stage.sqlite' }), /sql is forbidden/u);

  assert.throws(() => buildDuckDbStageSql(baseConfig([{
    type: 'postgres',
    password: 'secret',
    secretEnv: {},
    tables: [{ source: 'public.data' }],
  }]), { outputPath: '/tmp/stage.sqlite' }), /password is forbidden/u);

  assert.throws(() => buildDuckDbStageSql(baseConfig([
    { type: 'csv', path: './a.csv', table: 'same' },
    { type: 'json', path: './b.json', table: 'same' },
  ]), { outputPath: '/tmp/stage.sqlite' }), /Duplicate DuckDB target table/u);
});

function createFakeStageDatabase(filename, stagedAt) {
  const database = new DatabaseSync(filename);
  database.exec(`
    CREATE TABLE lnote_stage_metadata(schema_version INTEGER, kind TEXT, staged_at TEXT);
    CREATE TABLE lnote_stage_sources(
      target_table TEXT PRIMARY KEY,
      source_type TEXT,
      source_locator TEXT,
      source_config_json TEXT,
      staged_at TEXT
    );
    CREATE TABLE articles(id INTEGER PRIMARY KEY, title TEXT, body TEXT);
  `);
  database.prepare('INSERT INTO lnote_stage_metadata VALUES (?, ?, ?)').run(
    DUCKDB_BRIDGE_SCHEMA_VERSION,
    DUCKDB_BRIDGE_CONFIG_KIND,
    stagedAt,
  );
  database.prepare('INSERT INTO lnote_stage_sources VALUES (?, ?, ?, ?, ?)').run(
    'articles',
    'csv',
    '/data/articles.csv',
    JSON.stringify({ type: 'csv', path: './articles.csv', options: { header: true } }),
    stagedAt,
  );
  database.prepare('INSERT INTO articles VALUES (?, ?, ?)').run(
    1,
    'First article',
    'Source text from staged CSV.',
  );
  database.close();
}

test('verifies a staged SQLite file and preserves its provenance through import', async () => {
  const directory = await temporaryDirectory();
  try {
    const csv = path.join(directory, 'articles.csv');
    const configPath = path.join(directory, 'stage.json');
    const stagePath = path.join(directory, 'stage.sqlite');
    const preparedPath = path.join(directory, 'prepared');
    const stagedAt = '2026-08-03T18:00:00.000Z';
    await writeFile(csv, 'id,title,body\n1,First article,Source text from staged CSV.\n');
    await writeFile(configPath, JSON.stringify(baseConfig([{
      type: 'csv',
      path: './articles.csv',
      table: 'articles',
      options: { header: true },
    }])));

    const staged = await stageDuckDbSources({
      configPath,
      outputPath: stagePath,
      stagedAt,
      runner: async ({ sql, redactions }) => {
        assert.match(sql, /read_csv/u);
        assert.deepEqual(redactions, []);
        createFakeStageDatabase(stagePath, stagedAt);
        return { stdout: '', stderr: '' };
      },
    });
    assert.deepEqual(staged.targets, ['articles']);
    assert.deepEqual(staged.objects.map((object) => object.name), ['articles']);

    await prepareSqliteDirectory({
      inputPath: stagePath,
      outputPath: preparedPath,
      id: 'example.duckdb-stage',
      tables: ['articles'],
      mapping: {
        tables: {
          articles: {
            idColumns: ['id'],
            titleColumn: 'title',
            textColumns: ['title', 'body'],
          },
        },
      },
      generatedAt: stagedAt,
    });
    const pack = await buildPack(preparedPath);
    const source = pack.documents[0].source;
    assert.equal(source.staging.adapter, 'duckdb-stage');
    assert.equal(source.staging.sourceType, 'csv');
    assert.equal(source.staging.sourceLocator, '/data/articles.csv');
    assert.equal(source.staging.stagedAt, stagedAt);
    assert.equal(source.staging.sourceConfig.path, './articles.csv');
    assert.ok(pack.documents[0].tags.includes('duckdb-stage'));
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('removes partial staging output after runner failure', async () => {
  const directory = await temporaryDirectory();
  try {
    const csv = path.join(directory, 'articles.csv');
    const output = path.join(directory, 'partial.sqlite');
    await writeFile(csv, 'id\n1\n');
    await assert.rejects(stageDuckDbSources({
      config: baseConfig([{ type: 'csv', path: csv, table: 'articles' }]),
      outputPath: output,
      runner: async () => {
        await writeFile(output, 'partial');
        throw new Error('forced failure');
      },
    }), /forced failure/u);
    await assert.rejects(readFile(output), /ENOENT/u);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('CLI parses force and delegates staging without bundling DuckDB', async () => {
  assert.deepEqual(
    argumentsFrom(['stage', '--config', 'stage.json', '--output', 'stage.sqlite', '--force']),
    {
      command: 'stage',
      table: [],
      force: true,
      config: 'stage.json',
      output: 'stage.sqlite',
    },
  );
  const calls = [];
  const result = await runDatabaseCommand({
    command: 'stage',
    table: [],
    force: true,
    config: 'stage.json',
    output: 'stage.sqlite',
    duckdbBin: '/opt/duckdb',
  }, {
    generatedAt: '2026-08-03T18:00:00.000Z',
    environment: { TOKEN: 'hidden' },
    async stageDuckDbSources(options) {
      calls.push(options);
      return {
        outputPath: '/tmp/stage.sqlite',
        bytes: 100,
        targets: ['articles'],
        objects: [],
      };
    },
  });
  assert.equal(calls[0].executable, '/opt/duckdb');
  assert.equal(calls[0].force, true);
  assert.match(result.message, /Next: npm run database:pack -- import/u);
});
