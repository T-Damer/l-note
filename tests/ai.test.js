import assert from 'node:assert/strict';
import test from 'node:test';

import { buildExtractiveAnswer, validateCitations } from '../src/ai.js';

test('citation validator rejects invented source numbers', () => {
  const validation = validateCitations('Факт подтвержден источником [S9].', 2);
  assert.equal(validation.valid, false);
  assert.deepEqual(validation.invalid, [9]);
});

test('citation validator accepts grounded paragraphs', () => {
  const validation = validateCitations(
    'Первый подтвержденный факт подробно изложен в локальном фрагменте [S1].\n\nОграничения: данных мало.',
    1
  );
  assert.equal(validation.valid, true);
});

test('deterministic answer works without a model', () => {
  const result = buildExtractiveAnswer('пример', [
    {
      id: 'S1',
      title: 'Документ',
      section: 'Раздел',
      body: 'Это первое предложение. Это второе предложение.'
    }
  ]);
  assert.equal(result.mode, 'deterministic');
  assert.match(result.text, /\[S1\]/u);
});
