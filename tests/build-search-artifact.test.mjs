import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { DatabaseSync } from 'node:sqlite';

import { validatePack } from '../src/packs.js';
import { buildPrebuiltSearchArtifact } from '../tools/build-search-artifact.mjs';

const root = path.resolve(import.meta.dirname, '..');

test('builds a valid portable FTS5 database and updated pack copy', async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'l-note-search-artifact-'));
  const databasePath = path.join(directory, 'guide.search.sqlite');
  const packOutputPath = path.join(directory, 'guide.with-search.pack.json');
  try {
    const result = await buildPrebuiltSearchArtifact({
      inputPath: path.join(root, 'packs', 'lnote-guide.pack.json'),
      databasePath,
      packOutputPath,
      artifactUrl: './guide.search.sqlite',
      builtAt: '2026-08-03T00:00:00.000Z',
    });
    assert.equal(result.artifact.kind, 'sqlite-fts5');
    assert.equal(result.artifact.formatVersion, 1);
    assert.match(result.artifact.sha256, /^[a-f0-9]{64}$/u);
    assert.ok(result.artifact.bytes > 0);
    assert.ok(result.artifact.recordCount > 0);

    const outputPack = JSON.parse(await readFile(packOutputPath, 'utf8'));
    assert.equal(validatePack(outputPack).valid, true);
    assert.equal(outputPack.searchArtifacts[0].sha256, result.artifact.sha256);

    const database = new DatabaseSync(databasePath, { readOnly: true });
    try {
      const quick = database.prepare('PRAGMA quick_check;').get();
      assert.equal(String(Object.values(quick)[0]).toLowerCase(), 'ok');
      const metadata = Object.fromEntries(
        database.prepare('SELECT key, value FROM search_meta').all()
          .map((row) => [row.key, row.value]),
      );
      assert.equal(metadata.artifactKind, 'sqlite-fts5');
      assert.equal(metadata.fingerprint, result.artifact.corpusFingerprint);
      assert.equal(Number(metadata.recordCount), result.artifact.recordCount);
      const count = database.prepare('SELECT count(*) AS count FROM records_fts').get();
      assert.equal(Number(count.count), result.artifact.recordCount);
    } finally {
      database.close();
    }
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
