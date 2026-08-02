import assert from 'node:assert/strict';
import test from 'node:test';

import {
  KNOWLEDGE_PACK_SCHEMA_VERSION,
  createEvidenceEnvelope,
  validateKnowledgePackContract,
  validateSearchResultContract,
} from '../src/core/contracts.js';
import {
  activeDomainQueryExpanders,
  defineDomainQueryPlannerPort,
  defineLocalModelPort,
  defineSearchPort,
} from '../src/core/ports.js';
import { composeKnowledgeRuntime } from '../src/core/runtime.js';
import {
  createIndexedDbStoragePort,
  createMiniSearchPort,
  createWebLlmPort,
} from '../src/adapters/runtime-adapters.js';

const pack = {
  schemaVersion: KNOWLEDGE_PACK_SCHEMA_VERSION,
  id: 'example.pack',
  version: '1.0.0',
  title: 'Example',
  description: 'Example knowledge pack',
  language: 'en',
  documents: [
    {
      id: 'doc.example',
      title: 'Offline operation',
      sections: [
        {
          id: 'section.offline',
          title: 'Offline',
          text: 'The installed pack remains searchable without a server.',
          entityIds: ['concept.offline'],
        },
      ],
    },
  ],
  entities: [{ id: 'concept.offline', name: 'Offline operation', aliases: ['offline'] }],
  claims: [],
  relations: [],
};

test('versioned pack contract accepts the public shape', () => {
  assert.deepEqual(validateKnowledgePackContract(pack), { valid: true, errors: [] });
  assert.equal(validateKnowledgePackContract({ ...pack, schemaVersion: 99 }).valid, false);
});

test('search result contract constrains displayed relevance', () => {
  assert.equal(validateSearchResultContract({ id: 'a', kind: 'section', title: 'A', body: 'B', relevance: 78 }).valid, true);
  assert.equal(validateSearchResultContract({ id: 'a', kind: 'section', title: 'A', body: 'B', relevance: 140 }).valid, false);
});

test('evidence envelope is versioned and rejects an empty query', () => {
  assert.equal(createEvidenceEnvelope({ query: 'offline search' }).contractVersion, '0.1.0');
  assert.throws(() => createEvidenceEnvelope({ query: '  ' }), /non-empty/u);
});

test('port definitions fail fast on incomplete adapters', () => {
  assert.throws(() => defineSearchPort({ search() {} }), /suggest/u);
  assert.throws(
    () => defineLocalModelPort({ async load() {}, async answer() {} }),
    /unload/u,
  );
});

test('domain planners activate only for matching packs', () => {
  const planner = defineDomainQueryPlannerPort({
    id: 'example.domain.v1',
    appliesToPack(candidate) {
      return candidate.id.startsWith('example.');
    },
    expandQuery(query) {
      return query === 'local' ? ['offline operation'] : [];
    },
  });
  assert.deepEqual(activeDomainQueryExpanders([planner], [pack])[0]('local'), ['offline operation']);
  assert.deepEqual(activeDomainQueryExpanders([planner], [{ ...pack, id: 'other.pack' }]), []);
});

test('headless runtime composes packs, notes and a search adapter', () => {
  const runtime = composeKnowledgeRuntime({
    packRecords: [{ id: pack.id, enabled: true, installedAt: '2026-07-30T00:00:00Z', pack }],
    notes: [],
    searchFactory: createMiniSearchPort,
    domainQueryPlanners: [],
  });
  assert.equal(runtime.enabledPacks.length, 1);
  assert.equal(runtime.knowledge.documents.size, 1);
  assert.equal(runtime.search.search('offline')[0]?.documentId, 'doc.example');
  assert.equal(runtime.capabilities.search, true);
});

test('browser adapters expose the shared ports in a Node memory fallback', async () => {
  const storage = createIndexedDbStoragePort();
  await storage.clearStore('settings');
  await storage.setSetting('core-test', 'ok');
  assert.equal(await storage.getSetting('core-test', null), 'ok');
  assert.equal(storage.mode(), 'memory');

  const model = createWebLlmPort();
  assert.equal(typeof model.load, 'function');
  assert.equal(typeof model.answer, 'function');
  assert.equal(typeof model.unload, 'function');
  assert.equal(defineLocalModelPort(model), model);
});
