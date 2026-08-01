import assert from 'node:assert/strict';
import test from 'node:test';

import { ASK_WORKFLOW_RESULT, createAskWorkflow } from '../src/services/ask-workflow.js';

function createHarness({ available = true, verificationResult = null } = {}) {
  let ready = false;
  let snapshot = { evidence: null, modeId: null };
  const calls = [];
  const profile = { modelId: 'model-1', label: 'Model 1' };
  const mode = { id: 'compact', label: 'Экономный', sourceLimit: 3 };
  const modelPort = {
    available,
    async load({ modelId, onProgress }) {
      calls.push(['load', modelId]);
      onProgress?.({ progress: 0.5 });
      ready = true;
      return { modelId, loadMs: 12, cachedBeforeLoad: false };
    },
    async answer(query, evidence, options) {
      calls.push(['answer', query, options.modeId]);
      return {
        modelId: profile.modelId,
        modeId: options.modeId,
        text: `${evidence.sources[0].text} [S1]`,
        grounded: true,
        validCitations: ['S1'],
        invalidCitations: [],
      };
    },
  };
  const evidenceVerifier = verificationResult
    ? {
      verify(answer, evidence) {
        calls.push(['verify', answer.text, evidence.query]);
        return verificationResult;
      },
    }
    : null;
  const workflow = createAskWorkflow({
    modelPort,
    evidenceVerifier,
    getSearchPort: () => ({
      search(query, options) {
        calls.push(['search', query, options.limit]);
        return [{ id: 'result-1', title: 'Result' }];
      },
    }),
    getKnowledgeState: () => ({ claims: new Map() }),
    getSelectedProfile: () => profile,
    getSelectedMode: () => mode,
    isModelReady: () => ready,
    getEvidenceSnapshot: () => snapshot,
    setEvidenceSnapshot: (next) => { snapshot = next; },
    collectEvidence: (query) => ({
      schemaVersion: 1,
      query,
      sources: [{ id: 'S1', text: 'evidence' }],
    }),
    requestPersistence: async () => ({ supported: true, granted: true }),
  });
  return { calls, mode, profile, snapshot: () => snapshot, workflow };
}

test('loads a selected model independently from question collection', async () => {
  const harness = createHarness();
  const plan = harness.workflow.plan('');
  assert.equal(plan.action, 'load');
  const progress = [];
  const result = await harness.workflow.execute(plan, {
    onProgress: (value) => progress.push(value),
  });
  assert.equal(result.kind, ASK_WORKFLOW_RESULT.LOADED);
  assert.equal(result.loaded.modelId, harness.profile.modelId);
  assert.deepEqual(progress, [{ progress: 0.5 }]);
  assert.deepEqual(harness.calls, [['load', 'model-1']]);
});

test('collects matching evidence before the first answer and reuses it afterwards', async () => {
  const harness = createHarness();
  await harness.workflow.execute(harness.workflow.plan(''));

  const evidenceEvents = [];
  const firstPlan = harness.workflow.plan('вопрос');
  assert.equal(firstPlan.action, 'collect-and-answer');
  const first = await harness.workflow.execute(firstPlan, {
    onEvidence: (evidence) => evidenceEvents.push(evidence),
  });
  assert.equal(first.kind, ASK_WORKFLOW_RESULT.ANSWERED);
  assert.equal(first.collected, true);
  assert.equal(harness.snapshot().evidence.query, 'вопрос');
  assert.equal(evidenceEvents.length, 1);

  const secondPlan = harness.workflow.plan('вопрос');
  assert.equal(secondPlan.action, 'answer');
  const second = await harness.workflow.execute(secondPlan);
  assert.equal(second.collected, false);
  assert.equal(harness.calls.filter(([name]) => name === 'search').length, 1);
  assert.equal(harness.calls.filter(([name]) => name === 'answer').length, 2);
});

test('marks a cited answer ungrounded when statement support verification fails', async () => {
  const verification = {
    accepted: false,
    supported: false,
    invalidCitations: [],
    unsupportedStatements: ['evidence [S1]'],
    diagnostics: { verifier: 'test' },
  };
  const harness = createHarness({ verificationResult: verification });
  await harness.workflow.execute(harness.workflow.plan(''));
  const result = await harness.workflow.execute(harness.workflow.plan('вопрос'));
  assert.equal(result.answer.grounded, false);
  assert.deepEqual(result.answer.unsupportedStatements, ['evidence [S1]']);
  assert.equal(result.answer.supportVerification, verification);
  assert.equal(harness.calls.filter(([name]) => name === 'verify').length, 1);
});

test('keeps an answer grounded only when citation and support checks both pass', async () => {
  const harness = createHarness({
    verificationResult: {
      accepted: true,
      supported: true,
      invalidCitations: [],
      unsupportedStatements: [],
    },
  });
  await harness.workflow.execute(harness.workflow.plan(''));
  const result = await harness.workflow.execute(harness.workflow.plan('вопрос'));
  assert.equal(result.answer.grounded, true);
});

test('reports unavailable runtimes without touching retrieval or inference', async () => {
  const harness = createHarness({ available: false });
  const plan = harness.workflow.plan('вопрос');
  assert.equal(plan.kind, ASK_WORKFLOW_RESULT.UNAVAILABLE);
  assert.equal((await harness.workflow.execute(plan)).kind, ASK_WORKFLOW_RESULT.UNAVAILABLE);
  assert.deepEqual(harness.calls, []);
});

test('requires a question after a loaded model when no matching evidence exists', async () => {
  const harness = createHarness();
  await harness.workflow.execute(harness.workflow.plan(''));
  const plan = harness.workflow.plan('');
  assert.equal(plan.action, 'needs-question');
  assert.equal((await harness.workflow.execute(plan)).kind, ASK_WORKFLOW_RESULT.NEEDS_QUESTION);
});
