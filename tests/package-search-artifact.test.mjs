import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';

import { createPackageTransferHandler } from '../src/services/package-transfer.js';

function digest(buffer) {
  return createHash('sha256').update(Buffer.from(buffer)).digest('hex');
}

function fixture(artifactSha) {
  return {
    schemaVersion: 1,
    id: 'example.large',
    version: '1.0.0',
    title: 'Large pack',
    description: 'Fixture',
    language: 'ru',
    documents: [],
    entities: [],
    claims: [],
    relations: [],
    searchArtifacts: [{
      id: 'search.example.large.1.0.0',
      kind: 'sqlite-fts5',
      formatVersion: 1,
      runtime: '@subframe7536/sqlite-wasm@1.3.1',
      url: './large.search.sqlite',
      sha256: artifactSha,
      bytes: 6,
      corpusFingerprint: 'fingerprint',
      recordCount: 1,
    }],
  };
}

function responseFor(buffer, type = 'application/octet-stream') {
  return new Response(buffer, {
    status: 200,
    headers: {
      'content-type': type,
      'content-length': String(buffer.byteLength),
    },
  });
}

test('downloads and stores a matching optional SQLite search file', async () => {
  const artifact = new TextEncoder().encode('sqlite').buffer;
  const pack = fixture(digest(artifact));
  const packBuffer = new TextEncoder().encode(JSON.stringify(pack)).buffer;
  let installed;
  const fetchImpl = async (url) => {
    if (String(url).endsWith('large.search.sqlite')) return responseFor(artifact);
    return responseFor(packBuffer, 'application/json');
  };
  const handler = createPackageTransferHandler({
    fetchImpl,
    sha256Hex: async (buffer) => digest(buffer),
    installPack: async (value, source) => {
      installed = { value, source };
    },
  });
  const result = await handler({
    metadata: { entry: { id: pack.id, url: 'https://example.test/packs/large.pack.json' } },
  }, {
    signal: new AbortController().signal,
    report() {},
  });

  assert.equal(installed.value.id, pack.id);
  assert.equal(installed.source.searchArtifactFiles.length, 1);
  assert.equal(installed.source.searchArtifactFiles[0].id, pack.searchArtifacts[0].id);
  assert.ok(installed.source.searchArtifactFiles[0].blob instanceof Blob);
  assert.equal(result.searchArtifactBytes, artifact.byteLength);
  assert.deepEqual(result.warnings, []);
});

test('installs the pack when an optional search file fails validation', async () => {
  const artifact = new TextEncoder().encode('sqlite').buffer;
  const pack = fixture('b'.repeat(64));
  const packBuffer = new TextEncoder().encode(JSON.stringify(pack)).buffer;
  let installedSource;
  const handler = createPackageTransferHandler({
    fetchImpl: async (url) => (
      String(url).endsWith('large.search.sqlite')
        ? responseFor(artifact)
        : responseFor(packBuffer, 'application/json')
    ),
    sha256Hex: async (buffer) => digest(buffer),
    installPack: async (_value, source) => {
      installedSource = source;
    },
  });
  const originalWarn = console.warn;
  console.warn = () => {};
  try {
    const result = await handler({
      metadata: { entry: { id: pack.id, url: 'https://example.test/packs/large.pack.json' } },
    }, {
      signal: new AbortController().signal,
      report() {},
    });
    assert.deepEqual(installedSource.searchArtifactFiles, []);
    assert.equal(result.searchArtifactBytes, 0);
    assert.equal(result.warnings.length, 1);
  } finally {
    console.warn = originalWarn;
  }
});
