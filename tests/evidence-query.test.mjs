import assert from 'node:assert/strict';
import test from 'node:test';

import {
  collectQuestionEvidence,
  evidenceMatchesRequest,
} from '../src/services/evidence-query.js';

const mode = { id: 'compact', sourceLimit: 4 };

test('collects bounded evidence through the SearchPort and collector boundary', () => {
  const calls = [];
  const searchPort = {
    search(query, options) {
      calls.push(['search', query, options]);
      return [{ id: 'result-1' }];
    },
  };
  const result = collectQuestionEvidence({
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

test('matches evidence only for the same normalized question and mode', () => {
  const evidence = { query: 'бронхиолит' };
  assert.equal(evidenceMatchesRequest(evidence, ' бронхиолит ', 'compact', 'compact'), true);
  assert.equal(evidenceMatchesRequest(evidence, 'пневмония', 'compact', 'compact'), false);
  assert.equal(evidenceMatchesRequest(evidence, 'бронхиолит', 'compact', 'detailed'), false);
});

test('rejects incomplete orchestration dependencies', () => {
  assert.throws(() => collectQuestionEvidence({ query: '', mode }), /non-empty query/u);
  assert.throws(() => collectQuestionEvidence({ query: 'test', mode: {} }), /answer-mode/u);
  assert.throws(() => collectQuestionEvidence({ query: 'test', mode, searchPort: {} }), /SearchPort/u);
});
