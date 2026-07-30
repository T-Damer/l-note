import assert from 'node:assert/strict';
import test from 'node:test';
import {
  DEFAULT_LOCAL_MODEL_ID,
  LOCAL_MODEL_PROFILES,
  localModelProfile,
  resolveLocalModelProfiles,
  validateGroundedAnswer,
} from '../src/ai.js';

test('defines exactly three independent browser-local model families', () => {
  assert.equal(LOCAL_MODEL_PROFILES.length, 3);
  assert.deepEqual(
    LOCAL_MODEL_PROFILES.map((profile) => profile.modelId),
    [
      'gemma3-1b-it-q4f16_1-MLC',
      'Qwen3-1.7B-q4f16_1-MLC',
      'Phi-4-mini-instruct-q4f16_1-MLC',
    ],
  );
  assert.equal(DEFAULT_LOCAL_MODEL_ID, 'Qwen3-1.7B-q4f16_1-MLC');
  assert.equal(localModelProfile(DEFAULT_LOCAL_MODEL_ID)?.role, 'Рекомендуемая модель');
});

test('marks models unavailable when a WebLLM catalog does not contain them', () => {
  const resolved = resolveLocalModelProfiles([
    { model_id: 'gemma3-1b-it-q4f16_1-MLC' },
    { model_id: 'Phi-4-mini-instruct-q4f16_1-MLC' },
  ]);
  assert.deepEqual(resolved.map((profile) => profile.available), [true, false, true]);
});

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
