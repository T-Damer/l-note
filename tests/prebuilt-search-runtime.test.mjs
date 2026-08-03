import assert from 'node:assert/strict';
import test from 'node:test';

import {
  composeKnowledgeRuntime,
  knowledgeCorpusFingerprint,
} from '../src/core/runtime.js';

function pack() {
  const value = {
    schemaVersion: 1,
    id: 'runtime.pack',
    version: '1.0.0',
    title: 'Runtime pack',
    description: 'Fixture',
    language: 'ru',
    documents: [{
      id: 'doc',
      title: 'Document',
      sections: [{ id: 'section', title: 'Section', text: 'Searchable text.', entityIds: [] }],
    }],
    entities: [],
    claims: [],
    relations: [],
  };
  const fingerprint = knowledgeCorpusFingerprint([value], []);
  value.searchArtifacts = [{
    id: 'search.runtime.pack.1.0.0',
    kind: 'sqlite-fts5',
    formatVersion: 1,
    runtime: '@subframe7536/sqlite-wasm@1.3.1',
    url: './runtime.sqlite',
    sha256: 'a'.repeat(64),
    bytes: 4096,
    corpusFingerprint: fingerprint,
    recordCount: 1,
  }];
  return value;
}

test('passes an exact stored artifact to the search factory', () => {
  const knowledgePack = pack();
  const blob = new Blob(['database']);
  let options;
  const runtime = composeKnowledgeRuntime({
    packRecords: [{
      id: knowledgePack.id,
      enabled: true,
      pack: knowledgePack,
      searchArtifactFiles: [{
        id: knowledgePack.searchArtifacts[0].id,
        sha256: knowledgePack.searchArtifacts[0].sha256,
        corpusFingerprint: knowledgePack.searchArtifacts[0].corpusFingerprint,
        blob,
      }],
    }],
    notes: [],
    searchFactory(records, _entities, input) {
      options = input;
      return {
        kind: 'test',
        count: records.length,
        retainsRecords: false,
        search: () => [],
        suggest: () => [],
      };
    },
  });
  assert.equal(options.prebuiltSearchArtifact.blob, blob);
  assert.equal(runtime.capabilities.prebuiltSearchArtifact, true);
  assert.equal(runtime.records.length, 0);
});

test('does not use a pack artifact when personal notes change the corpus', () => {
  const knowledgePack = pack();
  let options;
  const runtime = composeKnowledgeRuntime({
    packRecords: [{
      id: knowledgePack.id,
      enabled: true,
      pack: knowledgePack,
      searchArtifactFiles: [{
        id: knowledgePack.searchArtifacts[0].id,
        sha256: knowledgePack.searchArtifacts[0].sha256,
        corpusFingerprint: knowledgePack.searchArtifacts[0].corpusFingerprint,
        blob: new Blob(['database']),
      }],
    }],
    notes: [{
      id: 'note',
      title: 'Note',
      body: 'Personal text',
      relation: 'observation',
      createdAt: '2026-08-03T00:00:00.000Z',
      updatedAt: '2026-08-03T00:00:00.000Z',
    }],
    searchFactory(records, _entities, input) {
      options = input;
      return {
        kind: 'test',
        count: records.length,
        retainsRecords: true,
        search: () => [],
        suggest: () => [],
      };
    },
  });
  assert.equal(options.prebuiltSearchArtifact, null);
  assert.equal(runtime.capabilities.prebuiltSearchArtifact, false);
});
