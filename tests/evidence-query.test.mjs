import assert from 'node:assert/strict';
import test from 'node:test';

import {
  collectQuestionEvidence,
  evidenceMatchesRequest,
} from '../src/services/evidence-query.js';

const mode = { id: 'compact', sourceLimit: 4 };

test('collects bounded evidence through the SearchPort and collector boundary', async () => {
  const calls = [];
  const searchPort = {
    search(query, options) {
      calls.push(['search', query, options]);
      return [{ id: 'result-1' }];
    },
  };
  const result = await collectQuestionEvidence({
    query: '  бронхиолит  ',
    mode,
    searchPort,
    knowledgeState: { id: 'knowledge' },
    collectEvidence(query, results, knowledgeState, options) {
      calls.push(['collect', query, results, knowledgeState, options]);
      return { query, sources: [], relatedNotes: [], conflicts: [] };
    },
  });

  assert.deepEqual(calls[0], [
    'search',
    'бронхиолит',
    { limit: 18, personalPriority: true },
  ]);
  assert.equal(result.evidence.query, 'бронхиолит');
  assert.equal(result.modeId, 'compact');
});

test('awaits an asynchronous disk-backed SearchPort', async () => {
  const result = await collectQuestionEvidence({
    query: 'fuzzy serch',
    mode,
    searchPort: {
      async search() {
        return [{ id: 'disk-result' }];
      },
    },
    knowledgeState: {},
    collectEvidence: (query, results) => ({ query, sources: results }),
  });
  assert.equal(result.results[0].id, 'disk-result');
  assert.equal(result.evidence.sources[0].id, 'disk-result');
});

test('matches evidence only for the same normalized question and mode', () => {
  const evidence = { query: 'бронхиолит' };
  assert.equal(evidenceMatchesRequest(evidence, ' БРОНХИОЛИТ ', 'compact', 'compact'), true);
  assert.equal(evidenceMatchesRequest(evidence, 'пневмония', 'compact', 'compact'), false);
  assert.equal(evidenceMatchesRequest(evidence, 'бронхиолит', 'compact', 'detailed'), false);
});

test('rejects incomplete orchestration dependencies', async () => {
  await assert.rejects(collectQuestionEvidence({ query: '', mode }), /non-empty query/u);
  await assert.rejects(collectQuestionEvidence({ query: 'test', mode: {} }), /answer-mode/u);
  await assert.rejects(collectQuestionEvidence({ query: 'test', mode, searchPort: {} }), /SearchPort/u);
});
