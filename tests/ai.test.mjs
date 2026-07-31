import assert from 'node:assert/strict';
import test from 'node:test';
import {
  BrowserLocalAi,
  DEFAULT_LOCAL_MODEL_ID,
  LOCAL_MODEL_PROFILES,
  localModelProfile,
  resolveLocalModelProfiles,
  validateGroundedAnswer,
} from '../src/ai.js';

test('defines three device-oriented browser-local model profiles', () => {
  assert.equal(LOCAL_MODEL_PROFILES.length, 3);
  assert.deepEqual(
    LOCAL_MODEL_PROFILES.map((profile) => profile.modelId),
    [
      'Qwen3-1.7B-q4f16_1-MLC',
      'Qwen3-4B-q4f16_1-MLC',
      'Phi-4-mini-instruct-q4f16_1-MLC',
    ],
  );
  assert.equal(DEFAULT_LOCAL_MODEL_ID, 'Qwen3-1.7B-q4f16_1-MLC');
  assert.equal(localModelProfile(DEFAULT_LOCAL_MODEL_ID)?.recommendedRamGB, 8);
  assert.equal(localModelProfile('Qwen3-4B-q4f16_1-MLC')?.role, 'Лучшее качество');
  assert.equal(localModelProfile('Phi-4-mini-instruct-q4f16_1-MLC')?.role, 'Математика и логика');
});

test('separates persistent weight size from active runtime memory', () => {
  const profile = localModelProfile('Qwen3-4B-q4f16_1-MLC');
  assert.ok(profile.downloadSizeMB < profile.runtimeMemoryMB);
  assert.equal(profile.contextWindow, 4096);
  assert.equal(profile.quantization, 'q4f16_1');
});

test('marks models unavailable when a WebLLM catalog does not contain them', () => {
  const resolved = resolveLocalModelProfiles([
    { model_id: 'Qwen3-1.7B-q4f16_1-MLC' },
    { model_id: 'Phi-4-mini-instruct-q4f16_1-MLC' },
  ]);
  assert.deepEqual(resolved.map((profile) => profile.available), [true, false, true]);
});

test('browser adapter exposes explicit unload and requires WebGPU plus Worker', () => {
  const adapter = new BrowserLocalAi();
  assert.equal(typeof adapter.unload, 'function');
  assert.equal(adapter.available, false);
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
