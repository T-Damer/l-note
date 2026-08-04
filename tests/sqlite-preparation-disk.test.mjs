import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { DatabaseSync } from 'node:sqlite';

import { slugify } from '../tools/lib/pack-builder.mjs';
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

function createLargeDatabase(filename, rows = 1200) {
  const database = new DatabaseSync(filename);
  try {
    database.exec('CREATE TABLE large_table(id INTEGER PRIMARY KEY, body TEXT); BEGIN;');
    const insert = database.prepare('INSERT INTO large_table VALUES (?, ?)');
    for (let index = 1; index <= rows; index += 1) {
      insert.run(index, `streamed row ${String(index).padStart(4, '0')}`);
    }
    database.exec('COMMIT;');
  } finally {
    database.close();
  }
}

function documentFile(output, documentId) {
  return path.join(output, 'documents', `${slugify(documentId)}.json`);
}

function partialDocumentFile(output, documentId) {
  const finalPath = documentFile(output, documentId);
  return path.join(path.dirname(finalPath), `.${path.basename(finalPath)}.partial`);
}

async function temporaryDirectory() {
  return mkdtemp(path.join(os.tmpdir(), 'lnote-sqlite-disk-'));
}

test('writes each prepared SQLite document before importing the next object', async () => {
  const directory = await temporaryDirectory();
  try {
    const input = path.join(directory, 'source.sqlite');
    const output = path.join(directory, 'prepared');
    const firstDocument = documentFile(output, 'doc.first-table');
    const secondDocument = documentFile(output, 'doc.second-table');
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

test('streams one large table into an atomically published document', async () => {
  const directory = await temporaryDirectory();
  try {
    const input = path.join(directory, 'large.sqlite');
    const output = path.join(directory, 'prepared');
    const finalPath = documentFile(output, 'doc.large-table');
    const partialPath = partialDocumentFile(output, 'doc.large-table');
    createLargeDatabase(input);
    let observedMidStream = false;

    const result = await prepareSqliteDirectory({
      inputPath: input,
      outputPath: output,
      id: 'acceptance.sqlite-stream',
      tables: ['large_table'],
      onProgress(event) {
        if (event.stage === 'rows' && event.rows === 500) {
          observedMidStream = true;
          assert.equal(existsSync(finalPath), false);
          assert.equal(existsSync(partialPath), true);
        }
      },
    });

    assert.equal(observedMidStream, true);
    assert.equal(result.sections, 1200);
    assert.equal(existsSync(finalPath), true);
    assert.equal(existsSync(partialPath), false);
    const document = JSON.parse(await readFile(finalPath, 'utf8'));
    assert.equal(document.sections.length, 1200);
    assert.equal(document.sections[0].provenance.rowNumber, 1);
    assert.equal(document.sections.at(-1).provenance.rowNumber, 1200);
    assert.match(document.sections.at(-1).text, /streamed row 1200/u);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('finalizes truncation metadata after the streamed section array', async () => {
  const directory = await temporaryDirectory();
  try {
    const input = path.join(directory, 'limited.sqlite');
    const output = path.join(directory, 'prepared');
    const finalPath = documentFile(output, 'doc.large-table');
    createLargeDatabase(input, 5);

    const result = await prepareSqliteDirectory({
      inputPath: input,
      outputPath: output,
      id: 'acceptance.sqlite-stream-limit',
      tables: ['large_table'],
      maxRowsPerTable: 3,
    });

    assert.equal(result.sections, 3);
    assert.match(result.warnings.join('\n'), /ограничен 3 строками/u);
    const document = JSON.parse(await readFile(finalPath, 'utf8'));
    assert.equal(document.sections.length, 3);
    assert.deepEqual(document.extractionWarnings, ['Импорт ограничен 3 строками.']);
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
