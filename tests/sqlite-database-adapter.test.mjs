import assert from 'node:assert/strict';
import { readFile, rm, writeFile, mkdtemp } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { DatabaseSync } from 'node:sqlite';

import { buildPack } from '../tools/build-pack.mjs';
import { argumentsFrom, runDatabaseCommand } from '../tools/database-pack.mjs';
import {
  exportPackToSqlite,
  restorePackFromSqlite,
} from '../tools/lib/sqlite-pack-export.mjs';
import {
  inspectSqliteDatabase,
  prepareSqliteDirectory,
} from '../tools/lib/sqlite-source-import.mjs';

const guidePack = JSON.parse(await readFile(
  new URL('../packs/lnote-guide.pack.json', import.meta.url),
  'utf8',
));

async function temporaryDirectory() {
  return mkdtemp(path.join(os.tmpdir(), 'lnote-sqlite-adapter-'));
}

function createSourceDatabase(filename) {
  const database = new DatabaseSync(filename);
  database.exec(`
    CREATE TABLE articles(
      id INTEGER PRIMARY KEY,
      title TEXT NOT NULL,
      body TEXT NOT NULL,
      category TEXT,
      attachment BLOB
    );
    CREATE VIEW published_articles AS
      SELECT id, title, body, category FROM articles;
  `);
  const insert = database.prepare('INSERT INTO articles VALUES (?, ?, ?, ?, ?)');
  insert.run(2, 'Вторая статья', 'Основной текст второй статьи.', 'архив', null);
  insert.run(1, 'Первая статья', 'Основной текст первой статьи.', 'справка', new Uint8Array([1, 2, 3]));
  database.close();
}

test('inspects user SQLite tables and views without internal objects', async () => {
  const directory = await temporaryDirectory();
  try {
    const filename = path.join(directory, 'source.sqlite');
    createSourceDatabase(filename);
    const objects = inspectSqliteDatabase(filename);
    assert.deepEqual(objects.map((object) => [object.type, object.name]), [
      ['table', 'articles'],
      ['view', 'published_articles'],
    ]);
    assert.deepEqual(
      objects[0].columns.filter((column) => column.primaryKeyOrder).map((column) => column.name),
      ['id'],
    );
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('prepares selected SQLite rows in deterministic identity order', async () => {
  const directory = await temporaryDirectory();
  try {
    const filename = path.join(directory, 'source.sqlite');
    const output = path.join(directory, 'prepared');
    createSourceDatabase(filename);
    const result = await prepareSqliteDirectory({
      inputPath: filename,
      outputPath: output,
      id: 'example.sqlite',
      title: 'SQLite example',
      tables: ['articles'],
      mapping: {
        tables: {
          articles: {
            documentTitle: 'Статьи',
            idColumns: ['id'],
            titleColumn: 'title',
            textColumns: ['title', 'body', 'attachment'],
            tagColumns: ['category'],
          },
        },
      },
      generatedAt: '2026-08-03T00:00:00.000Z',
    });
    assert.equal(result.documents, 1);
    assert.equal(result.sections, 2);
    const pack = await buildPack(output);
    assert.equal(pack.id, 'example.sqlite');
    assert.equal(pack.documents[0].title, 'Статьи');
    assert.equal(pack.documents[0].sections[0].title, 'Первая статья');
    assert.equal(pack.documents[0].sections[1].title, 'Вторая статья');
    assert.match(pack.documents[0].sections[0].text, /attachment: <BLOB 3 bytes sha256:/u);
    assert.deepEqual(pack.documents[0].sections[0].provenance.identity, { id: '1' });
    assert.deepEqual(pack.documents[0].sections[0].provenance.orderColumns, ['id']);
    assert.ok(pack.documents[0].sections[0].tags.includes('справка'));
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('bounds table imports and records a visible warning', async () => {
  const directory = await temporaryDirectory();
  try {
    const filename = path.join(directory, 'source.sqlite');
    const output = path.join(directory, 'prepared');
    createSourceDatabase(filename);
    const result = await prepareSqliteDirectory({
      inputPath: filename,
      outputPath: output,
      id: 'example.bounded',
      tables: ['articles'],
      maxRowsPerTable: 1,
    });
    assert.equal(result.sections, 1);
    assert.match(result.warnings[0], /ограничен 1 строками/u);
    const pack = await buildPack(output);
    assert.match(pack.documents[0].extractionWarnings[0], /ограничен 1 строками/u);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('exports a relational SQLite database with FTS and restores the exact pack', async () => {
  const directory = await temporaryDirectory();
  try {
    const filename = path.join(directory, 'guide.sqlite');
    const result = await exportPackToSqlite({
      pack: guidePack,
      outputPath: filename,
      exportedAt: '2026-08-03T00:00:00.000Z',
    });
    assert.ok(result.bytes > 0);
    const database = new DatabaseSync(filename, { readOnly: true });
    try {
      const tables = database.prepare(`
        SELECT name FROM sqlite_schema
        WHERE name LIKE 'lnote_%'
        ORDER BY name
      `).all().map((row) => row.name);
      assert.ok(tables.includes('lnote_documents'));
      assert.ok(tables.includes('lnote_sections_fts'));
      assert.equal(database.prepare('PRAGMA user_version').get().user_version, 1);
      const matches = database.prepare(`
        SELECT document_id, section_id
        FROM lnote_sections_fts
        WHERE lnote_sections_fts MATCH ?
      `).all('SQLite');
      assert.ok(matches.some((row) => row.document_id === 'guide.search.disk'));
    } finally {
      database.close();
    }
    assert.deepEqual(restorePackFromSqlite(filename), guidePack);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('preserves an explicitly empty statementRelations array', async () => {
  const directory = await temporaryDirectory();
  try {
    const filename = path.join(directory, 'empty-relations.sqlite');
    const pack = structuredClone(guidePack);
    pack.statementRelations = [];
    await exportPackToSqlite({ pack, outputPath: filename });
    const restored = restorePackFromSqlite(filename);
    assert.ok(Object.hasOwn(restored, 'statementRelations'));
    assert.deepEqual(restored, pack);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('CLI parses repeated table options and runs export/restore', async () => {
  assert.deepEqual(
    argumentsFrom(['import', '--input', 'a.db', '--table', 'a', '--table', 'b']),
    { command: 'import', input: 'a.db', table: ['a', 'b'], force: false },
  );
  const directory = await temporaryDirectory();
  try {
    const packFile = path.join(directory, 'guide.json');
    const databaseFile = path.join(directory, 'guide.sqlite');
    const restoredFile = path.join(directory, 'restored.json');
    await writeFile(packFile, JSON.stringify(guidePack));
    const exported = await runDatabaseCommand({
      command: 'export',
      table: [],
      input: packFile,
      output: databaseFile,
    }, { generatedAt: '2026-08-03T00:00:00.000Z' });
    assert.match(exported.message, /Exported/u);
    const restored = await runDatabaseCommand({
      command: 'restore',
      table: [],
      input: databaseFile,
      output: restoredFile,
    });
    assert.match(restored.message, /Restored/u);
    assert.deepEqual(JSON.parse(await readFile(restoredFile, 'utf8')), guidePack);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
