import assert from 'node:assert/strict';
import test from 'node:test';
import { validateGroundedAnswer } from '../src/ai.js';

test('accepts only allowed source identifiers', () => {
  const result = validateGroundedAnswer('Факт подтверждён [S1], второй фрагмент [S2].', ['S1', 'S2']);
  assert.equal(result.grounded, true);
  assert.deepEqual(result.invalidCitations, []);
});

test('flags invented source identifiers', () => {
  const result = validateGroundedAnswer('Есть подтверждение [S1], но также [S9].', ['S1']);
  assert.equal(result.grounded, false);
  assert.deepEqual(result.invalidCitations, ['S9']);
});

test('does not call uncited prose grounded', () => {
  const result = validateGroundedAnswer('Содержательный ответ без ссылки.', ['S1']);
  assert.equal(result.grounded, false);
});
