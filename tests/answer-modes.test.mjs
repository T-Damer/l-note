import assert from 'node:assert/strict';
import test from 'node:test';

import {
  ANSWER_MODE_PROFILES,
  DEFAULT_ANSWER_MODE_ID,
  answerModeProfile,
  buildEvidencePrompt,
  clipText,
} from '../src/services/answer-modes.js';

test('defines compact and detailed answer modes', () => {
  assert.deepEqual(ANSWER_MODE_PROFILES.map((mode) => mode.id), ['compact', 'detailed']);
  assert.equal(DEFAULT_ANSWER_MODE_ID, 'compact');
  assert.ok(answerModeProfile('detailed').sourceLimit > answerModeProfile('compact').sourceLimit);
  assert.ok(answerModeProfile('detailed').maxOutputTokens > answerModeProfile('compact').maxOutputTokens);
});

test('clips evidence by deterministic character budgets without a tokenizer', () => {
  const longBody = 'данные '.repeat(1000);
  const evidence = {
    sources: Array.from({ length: 10 }, (_, index) => ({
      id: `S${index + 1}`,
      result: { documentTitle: `Документ ${index + 1}`, title: 'Раздел', body: longBody },
      document: { title: `Документ ${index + 1}` },
    })),
    relatedNotes: [],
  };
  const compact = buildEvidencePrompt(evidence, 'compact');
  const detailed = buildEvidencePrompt(evidence, 'detailed');

  assert.equal(compact.includedSourceIds.length, 4);
  assert.ok(detailed.includedSourceIds.length > compact.includedSourceIds.length);
  assert.ok(detailed.includedSourceIds.length <= answerModeProfile('detailed').sourceLimit);
  assert.ok(compact.text.length <= answerModeProfile('compact').evidenceChars);
  assert.ok(detailed.text.length <= answerModeProfile('detailed').evidenceChars);
  assert.ok(detailed.text.length > compact.text.length);
});

test('clipText preserves short text and marks truncation', () => {
  assert.equal(clipText('коротко', 20), 'коротко');
  assert.equal(clipText('длинный текст', 7), 'длинны…');
});
