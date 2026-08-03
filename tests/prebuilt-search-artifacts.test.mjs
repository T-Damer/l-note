import assert from 'node:assert/strict';
import test from 'node:test';

import {
  PREBUILT_SEARCH_ARTIFACT_VERSION,
  PREBUILT_SQLITE_ARTIFACT_KIND,
  selectPrebuiltSearchArtifact,
  validatePrebuiltSearchArtifacts,
} from '../src/helpers/prebuilt-search-artifacts.js';
import { createInstalledPackRecord } from '../src/services/installed-pack-record.js';

const fingerprint = 'lnote-corpus-v1:demo.pack:1.0.0:1:0:0:0::';
const descriptor = Object.freeze({
  id: 'search.demo.pack.1.0.0',
  kind: PREBUILT_SQLITE_ARTIFACT_KIND,
  formatVersion: PREBUILT_SEARCH_ARTIFACT_VERSION,
  runtime: '@subframe7536/sqlite-wasm@1.3.1',
  url: './demo.search.sqlite',
  sha256: 'a'.repeat(64),
  bytes: 4096,
  corpusFingerprint: fingerprint,
  recordCount: 1,
});
const pack = Object.freeze({
  id: 'demo.pack',
  version: '1.0.0',
  searchArtifacts: [descriptor],
});

function storedFile(overrides = {}) {
  return {
    id: descriptor.id,
    sha256: descriptor.sha256,
    corpusFingerprint: descriptor.corpusFingerprint,
    bytes: descriptor.bytes,
    blob: new Blob(['sqlite']),
    ...overrides,
  };
}

test('validates portable SQLite artifact descriptors', () => {
  assert.deepEqual(validatePrebuiltSearchArtifacts(pack), []);
  assert.match(
    validatePrebuiltSearchArtifacts({ searchArtifacts: [{ ...descriptor, sha256: 'bad' }] })[0],
    /sha256/u,
  );
  assert.match(
    validatePrebuiltSearchArtifacts({ searchArtifacts: [{ ...descriptor, recordCount: 0 }] })[0],
    /recordCount/u,
  );
});

test('selects an artifact only for one exact pack corpus without notes', () => {
  const record = {
    id: pack.id,
    enabled: true,
    pack,
    searchArtifactFiles: [storedFile()],
  };
  const selected = selectPrebuiltSearchArtifact({
    packRecords: [record],
    notes: [],
    corpusFingerprint: fingerprint,
  });
  assert.equal(selected.id, descriptor.id);
  assert.ok(selected.blob instanceof Blob);

  assert.equal(selectPrebuiltSearchArtifact({
    packRecords: [record],
    notes: [{ id: 'note' }],
    corpusFingerprint: fingerprint,
  }), null);
  assert.equal(selectPrebuiltSearchArtifact({
    packRecords: [record, { ...record, id: 'other', pack: { ...pack, id: 'other' } }],
    notes: [],
    corpusFingerprint: fingerprint,
  }), null);
  assert.equal(selectPrebuiltSearchArtifact({
    packRecords: [record],
    notes: [],
    corpusFingerprint: 'different',
  }), null);
});

test('installed records preserve only files that still match pack descriptors', () => {
  const firstFile = storedFile();
  const previous = {
    id: pack.id,
    enabled: false,
    sourceUrl: 'https://example.test/demo.pack.json',
    pack,
    searchArtifactFiles: [firstFile],
  };
  const reused = createInstalledPackRecord({ pack, previous });
  assert.equal(reused.enabled, false);
  assert.equal(reused.searchArtifactFiles[0], firstFile);

  const changedPack = {
    ...pack,
    version: '2.0.0',
    searchArtifacts: [{ ...descriptor, sha256: 'b'.repeat(64) }],
  };
  const replaced = createInstalledPackRecord({ pack: changedPack, previous });
  assert.deepEqual(replaced.searchArtifactFiles, []);
});
