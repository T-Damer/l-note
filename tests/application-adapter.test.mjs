import assert from 'node:assert/strict';
import test from 'node:test';

import {
  KNOWLEDGE_APPLICATION_ADAPTER_VERSION,
  composeKnowledgeApplicationRuntime,
  defineKnowledgeApplicationAdapter,
} from '../src/core/application-adapter.js';
import {
  MINIMED_ADAPTER_CONTRACT_VERSION,
  defineMiniMedAdapter,
  inspectMiniMedAdapter,
} from '../src/integrations/minimed-adapter.js';

function storagePort() {
  return {
    async getAll() { return []; },
    async getOne() { return undefined; },
    async putOne(_store, value) { return value; },
    async deleteOne() {},
    async clearStore() {},
    async getSetting(_key, fallback) { return fallback; },
    async setSetting(_key, value) { return value; },
    mode() { return 'memory'; },
  };
}

function searchFactory(records) {
  return {
    kind: 'test-search',
    count: records.length,
    search() { return []; },
    suggest() { return []; },
  };
}

const queryPlanner = {
  id: 'minimed.query-plan.test',
  appliesToPack(pack) { return pack.id.startsWith('minimed.'); },
  expandQuery() { return ['medical expansion']; },
};

const evidenceVerifier = {
  id: 'minimed.evidence.test',
  verify() { return { accepted: true, supported: true }; },
};

const medicalPolicy = {
  benchmarkSuiteId: 'minimed.search-and-safety.test.v1',
  analyzeQuery(query) { return { query }; },
  rankResults({ results }) { return results; },
  verifyClinicalAnswer() { return { accepted: true }; },
  verifyDose() { return { accepted: true }; },
  shouldAbstain() { return false; },
};

const pack = {
  schemaVersion: 1,
  id: 'minimed.test.ru',
  version: '1.0.0',
  title: 'MiniMed test',
  description: 'Compatibility fixture',
  language: 'ru',
  documents: [],
  entities: [],
  claims: [],
  relations: [],
};

test('knowledge application adapter bundles generic runtime ports', () => {
  const adapter = defineKnowledgeApplicationAdapter({
    id: 'generic-test',
    storagePort: storagePort(),
    searchFactory,
    domainQueryPlanners: [queryPlanner],
    evidenceVerifierPort: evidenceVerifier,
  });

  assert.equal(adapter.adapterVersion, KNOWLEDGE_APPLICATION_ADAPTER_VERSION);
  const runtime = composeKnowledgeApplicationRuntime({
    adapter,
    packRecords: [{ id: pack.id, enabled: true, installedAt: '2026-07-31T00:00:00Z', pack }],
    notes: [],
  });
  assert.equal(runtime.search.kind, 'test-search');
  assert.equal(runtime.capabilities.evidenceVerification, true);
  assert.deepEqual(runtime.capabilities.domainQueryPlannerIds, ['minimed.query-plan.test']);
});

test('MiniMed compatibility requires its own medical planner, verifier and policy', () => {
  const core = defineKnowledgeApplicationAdapter({
    id: 'lnote-for-minimed',
    storagePort: storagePort(),
    searchFactory,
    domainQueryPlanners: [queryPlanner],
    evidenceVerifierPort: evidenceVerifier,
  });
  const adapter = defineMiniMedAdapter({ core, medicalPolicy });

  assert.equal(adapter.contractVersion, MINIMED_ADAPTER_CONTRACT_VERSION);
  assert.equal(adapter.core.id, 'lnote-for-minimed');
  assert.equal(adapter.medicalPolicy.benchmarkSuiteId, medicalPolicy.benchmarkSuiteId);
  assert.deepEqual(inspectMiniMedAdapter({ core, medicalPolicy }), {
    compatible: true,
    contractVersion: MINIMED_ADAPTER_CONTRACT_VERSION,
    coreAdapterVersion: KNOWLEDGE_APPLICATION_ADAPTER_VERSION,
    benchmarkSuiteId: medicalPolicy.benchmarkSuiteId,
    missing: [],
  });
});

test('MiniMed adapter refuses a generic core without clinical evidence verification', () => {
  const core = defineKnowledgeApplicationAdapter({
    id: 'unsafe-minimed-core',
    storagePort: storagePort(),
    searchFactory,
    domainQueryPlanners: [queryPlanner],
  });

  assert.throws(
    () => defineMiniMedAdapter({ core, medicalPolicy }),
    /requires an EvidenceVerifierPort/u,
  );
});

test('MiniMed adapter refuses an incomplete medical policy', () => {
  const core = defineKnowledgeApplicationAdapter({
    id: 'incomplete-minimed-core',
    storagePort: storagePort(),
    searchFactory,
    domainQueryPlanners: [queryPlanner],
    evidenceVerifierPort: evidenceVerifier,
  });

  assert.throws(
    () => defineMiniMedAdapter({ core, medicalPolicy: { ...medicalPolicy, verifyDose: undefined } }),
    /missing verifyDose/u,
  );
});
