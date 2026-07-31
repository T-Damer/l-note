import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createModelRunRecord,
  loadSelectedLocalModel,
  prependModelRun,
} from '../src/services/local-model-loader.js';

test('loads a selected model after requesting persistent storage', async () => {
  const calls = [];
  const result = await loadSelectedLocalModel({
    modelPort: {
      async load(options) {
        calls.push(['load', options.modelId]);
        options.onProgress?.({ progress: 0.5 });
        return { modelId: options.modelId, loadMs: 1200 };
      },
    },
    modelId: 'Qwen3-1.7B-q4f16_1-MLC',
    onProgress: (progress) => calls.push(['progress', progress.progress]),
    requestPersistence: async () => {
      calls.push(['persistence']);
      return { status: 'granted', persistent: true };
    },
  });

  assert.deepEqual(calls, [
    ['persistence'],
    ['load', 'Qwen3-1.7B-q4f16_1-MLC'],
    ['progress', 0.5],
  ]);
  assert.equal(result.loaded.modelId, 'Qwen3-1.7B-q4f16_1-MLC');
  assert.equal(result.persistence.persistent, true);
});

test('creates a bounded immutable model run history', () => {
  const answer = {
    modelId: 'model-a',
    modeId: 'compact',
    durationMs: 500,
    tokensPerSecond: 4,
    completionTokens: 20,
    grounded: true,
  };
  const record = createModelRunRecord(answer, { modelId: 'model-a', loadMs: 900 }, '2026-07-31T00:00:00Z');
  const previous = [{ modelId: 'old' }];
  const next = prependModelRun(previous, record, 1);

  assert.equal(record.loadMs, 900);
  assert.deepEqual(next, [record]);
  assert.deepEqual(previous, [{ modelId: 'old' }]);
});
