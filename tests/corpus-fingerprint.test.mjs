import assert from 'node:assert/strict';
import test from 'node:test';

import { knowledgeCorpusFingerprint } from '../src/core/runtime.js';

function pack(text = 'Original source text.') {
  return {
    schemaVersion: 1,
    id: 'fingerprint.test',
    version: '1.0.0',
    title: 'Fingerprint test',
    description: 'Fixture',
    language: 'en',
    documents: [{
      id: 'document',
      title: 'Document',
      sections: [{ id: 'section', title: 'Section', text }],
    }],
    entities: [],
    claims: [],
    relations: [],
  };
}

test('corpus fingerprint changes with source content', () => {
  assert.notEqual(
    knowledgeCorpusFingerprint([pack('First text')], []),
    knowledgeCorpusFingerprint([pack('Second text')], []),
  );
});

test('corpus fingerprint excludes its derived search artifact manifest', () => {
  const sourcePack = pack();
  const first = knowledgeCorpusFingerprint([sourcePack], []);
  sourcePack.searchArtifacts = [{
    id: 'search.fingerprint.test',
    kind: 'sqlite-fts5',
    formatVersion: 1,
    runtime: 'runtime',
    url: './search.sqlite',
    sha256: 'a'.repeat(64),
    bytes: 10,
    corpusFingerprint: first,
    recordCount: 1,
  }];
  assert.equal(knowledgeCorpusFingerprint([sourcePack], []), first);
});
