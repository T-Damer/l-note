import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { DatabaseSync } from 'node:sqlite';

import { prepareSqliteDirectory } from '../tools/lib/sqlite-source-import.mjs';

function createDatabase(filename) {
  const database = new DatabaseSync(filename);
  try {
    database.exec(`
      CREATE TABLE first_table(id INTEGER PRIMARY KEY, body TEXT);
      CREATE TABLE second_table(id INTEGER PRIMARY KEY, body TEXT);
      INSERT INTO first_table VALUES (1, 'first disk-backed document');
      INSERT INTO second_table VALUES (2, 'second disk-backed document');
    `);
  } finally {
    database.close();
  }
}

async function temporaryDirectory() {
  return mkdtemp(path.join(os.tmpdir(), 'lnote-sqlite-disk-'));
}

test('writes each prepared SQLite document before importing the next object', async () => {
  const directory = await temporaryDirectory();
  try {
    const input = path.join(directory, 'source.sqlite');
    const output = path.join(directory, 'prepared');
    const firstDocument = path.join(output, 'documents', 'doc.first-table.json');
    const secondDocument = path.join(output, 'documents', 'doc.second-table.json');
    createDatabase(input);
    const events = [];

    const result = await prepareSqliteDirectory({
      inputPath: input,
      outputPath: output,
      id: 'acceptance.sqlite-disk',
      tables: ['first_table', 'second_table'],
      onProgress(event) {
        events.push(event);
        if (event.stage === 'object' && event.index === 1) {
          assert.equal(existsSync(firstDocument), true);
          assert.equal(existsSync(secondDocument), false);
        }
      },
    });

    assert.equal(result.documents, 2);
    assert.equal(result.sections, 2);
    assert.equal(existsSync(secondDocument), true);
    assert.deepEqual(
      events.filter((event) => event.stage === 'written').map((event) => event.table),
      ['first_table', 'second_table'],
    );
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('removes partial authoring output after import and open failures', async () => {
  const directory = await temporaryDirectory();
  try {
    const input = path.join(directory, 'source.sqlite');
    const output = path.join(directory, 'prepared');
    createDatabase(input);

    await assert.rejects(prepareSqliteDirectory({
      inputPath: input,
      outputPath: output,
      id: 'acceptance.sqlite-cleanup',
      tables: ['first_table'],
      mapping: {
        tables: {
          first_table: { textColumns: ['missing_column'] },
        },
      },
    }), /unknown text column missing_column/u);
    assert.equal(existsSync(output), false);

    const missingOutput = path.join(directory, 'missing-output');
    await assert.rejects(prepareSqliteDirectory({
      inputPath: path.join(directory, 'missing.sqlite'),
      outputPath: missingOutput,
      id: 'acceptance.sqlite-open-cleanup',
    }));
    assert.equal(existsSync(missingOutput), false);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
