import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { createAdaptiveSearchPort } from '../src/adapters/adaptive-search.js';
import { knowledgeCorpusFingerprint } from '../src/core/runtime.js';
import {
  PREBUILT_SEARCH_ARTIFACT_VERSION,
  PREBUILT_SQLITE_ARTIFACT_KIND,
  selectPrebuiltSearchArtifact,
} from '../src/helpers/prebuilt-search-artifacts.js';
import { SQLITE_FTS_RUNTIME_VERSION } from '../src/helpers/sqlite-fts.js';
import { validatePack } from '../src/packs.js';
import { createInstalledPackRecord } from '../src/services/installed-pack-record.js';
import { createPackageTransferHandler } from '../src/services/package-transfer.js';
import { buildPrebuiltSearchArtifact } from '../tools/build-search-artifact.mjs';

function samplePack() {
  return {
    schemaVersion: 1,
    id: 'test.search-pack',
    version: '1.0.0',
    title: 'Search pack',
    description: 'A test pack for prebuilt search.',
    language: 'en',
    documents: [{
      id: 'guide',
      title: 'Guide',
      sections: [{
        id: 'intro',
        title: 'Introduction',
        text: 'Prebuilt search avoids rebuilding a large index on a weak device.',
        entityIds: [],
      }],
    }],
    entities: [],
    claims: [],
    relations: [],
  };
}

function descriptor(pack, bytes = 8) {
  return {
    id: 'search.test-search-pack.1.0.0',
    kind: PREBUILT_SQLITE_ARTIFACT_KIND,
    formatVersion: PREBUILT_SEARCH_ARTIFACT_VERSION,
    runtime: SQLITE_FTS_RUNTIME_VERSION,
    url: './search.sqlite',
    sha256: 'a'.repeat(64),
    bytes,
    corpusFingerprint: knowledgeCorpusFingerprint([pack], []),
    recordCount: 1,
  };
}

function sha256(buffer) {
  return createHash('sha256').update(Buffer.from(buffer)).digest('hex');
}

test('validates and selects only a verified exact-corpus artifact', () => {
  const pack = samplePack();
  const artifact = descriptor(pack);
  pack.searchArtifacts = [artifact];
  assert.deepEqual(validatePack(pack), { valid: true, errors: [] });

  const blob = new Blob([new Uint8Array(artifact.bytes)]);
  const record = {
    enabled: true,
    pack,
    searchArtifactFiles: [{
      id: artifact.id,
      sha256: artifact.sha256,
      corpusFingerprint: artifact.corpusFingerprint,
      blob,
    }],
  };
  assert.equal(selectPrebuiltSearchArtifact({
    packRecords: [record],
    notes: [],
    corpusFingerprint: artifact.corpusFingerprint,
  })?.blob, blob);
  assert.equal(selectPrebuiltSearchArtifact({
    packRecords: [record],
    notes: [{ id: 'note' }],
    corpusFingerprint: artifact.corpusFingerprint,
  }), null);
  assert.equal(selectPrebuiltSearchArtifact({
    packRecords: [record],
    notes: [],
    corpusFingerprint: 'different',
  }), null);
});

test('passes an available artifact only to the SQLite backend', async () => {
  const calls = [];
  const artifact = { id: 'ready', blob: new Blob(['db']) };
  const port = createAdaptiveSearchPort([{
    id: 'section:1',
    kind: 'section',
    title: 'Title',
    documentTitle: 'Document',
    body: 'Body',
  }], [], {
    forceDisk: true,
    corpusFingerprint: 'pack@1',
    prebuiltSearchArtifact: artifact,
    sqliteFactory: () => ({
      kind: 'sqlite',
      available: true,
      async build(records, options) {
        calls.push({ records, options });
        return { recordCount: records.length, storage: 'sqlite', backend: 'sqlite' };
      },
      async search() { return []; },
      async suggest() { return []; },
      async stats() { return { recordCount: 1 }; },
      async close() {},
    }),
  });
  await port.ready;
  assert.equal(calls[0].options.artifact, artifact);
  assert.equal(calls[0].options.fingerprint, 'pack@1');
  await port.close();
});

test('keeps only downloaded files that still match the installed manifest', () => {
  const pack = samplePack();
  const artifact = descriptor(pack);
  pack.searchArtifacts = [artifact];
  const retained = { ...artifact, blob: new Blob([new Uint8Array(artifact.bytes)]) };
  const stale = { ...retained, id: 'stale' };
  const record = createInstalledPackRecord({
    pack,
    previous: { enabled: false, searchArtifactFiles: [retained, stale] },
  });
  assert.equal(record.enabled, false);
  assert.deepEqual(record.searchArtifactFiles, [retained]);
});

test('downloads and verifies optional artifacts in the package transfer task', async () => {
  const pack = samplePack();
  const database = new TextEncoder().encode('sqlite database');
  const artifact = {
    ...descriptor(pack, database.byteLength),
    sha256: sha256(database),
    url: './search.sqlite',
  };
  pack.searchArtifacts = [artifact];
  const packBuffer = new TextEncoder().encode(JSON.stringify(pack));
  let installed = null;
  const handler = createPackageTransferHandler({
    async fetchImpl(url) {
      if (url === 'https://example.test/pack.json') return new Response(packBuffer);
      if (url === 'https://example.test/search.sqlite') return new Response(database);
      throw new Error(`Unexpected URL: ${url}`);
    },
    sha256Hex: async (buffer) => sha256(buffer),
    async installPack(value, source) {
      installed = { value, source };
    },
  });
  const result = await handler({
    metadata: { entry: { id: pack.id, url: 'https://example.test/pack.json' } },
  }, {
    signal: new AbortController().signal,
    report() {},
  });
  assert.equal(result.searchArtifactBytes, database.byteLength);
  assert.equal(installed.value.id, pack.id);
  assert.equal(installed.source.searchArtifactFiles.length, 1);
  assert.equal(installed.source.searchArtifactFiles[0].blob.size, database.byteLength);
});

test('builds a portable SQLite/FTS artifact and an updated pack', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'lnote-search-artifact-'));
  try {
    const input = path.join(directory, 'input.pack.json');
    const database = path.join(directory, 'search.sqlite');
    const output = path.join(directory, 'output.pack.json');
    await writeFile(input, JSON.stringify(samplePack()));
    const result = await buildPrebuiltSearchArtifact({
      inputPath: input,
      databasePath: database,
      packOutputPath: output,
      artifactUrl: './search.sqlite',
      builtAt: '2026-08-03T00:00:00.000Z',
    });
    const header = (await readFile(database)).subarray(0, 16).toString('utf8');
    const builtPack = JSON.parse(await readFile(output, 'utf8'));
    assert.equal(header, 'SQLite format 3\u0000');
    assert.equal(result.artifact.corpusFingerprint, knowledgeCorpusFingerprint([samplePack()], []));
    assert.deepEqual(validatePack(builtPack), { valid: true, errors: [] });
    assert.equal(builtPack.searchArtifacts[0].sha256, result.artifact.sha256);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
