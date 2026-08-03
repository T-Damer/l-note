import assert from 'node:assert/strict';
import test from 'node:test';

import { createQueuedRuntimeLoader, normalizeRuntimeTransferProgress } from '../src/services/queued-runtime-loader.js';
import { createTransferQueue, TRANSFER_STATUS } from '../src/services/transfer-queue.js';

function storagePort() {
  const values = new Map();
  return {
    async getSetting(key, fallback) {
      return values.has(key) ? structuredClone(values.get(key)) : fallback;
    },
    async setSetting(key, value) {
      values.set(key, structuredClone(value));
    },
  };
}

async function waitFor(predicate, timeoutMs = 500) {
  const started = Date.now();
  while (!predicate()) {
    if (Date.now() - started > timeoutMs) throw new Error('Timed out waiting for state.');
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
}

test('normalizes percentage and byte progress for the shared queue', () => {
  assert.deepEqual(normalizeRuntimeTransferProgress({ progress: 45, text: 'Загрузка' }), {
    progress: .45,
    loaded: null,
    total: null,
    message: 'Загрузка',
  });
  assert.equal(normalizeRuntimeTransferProgress({ loaded: 2, total: 8 }).progress, .25);
});

test('runs model loading through one persisted queue task and forwards progress', async () => {
  const queue = createTransferQueue({ storagePort: storagePort(), maxConcurrent: 1 });
  const progress = [];
  const loaded = [];
  const loader = createQueuedRuntimeLoader({
    queue,
    kind: 'model',
    directLoad: async ({ modelId, onProgress }) => {
      onProgress({ progress: .5, text: 'Половина' });
      return { modelId, reused: false };
    },
    labelFor: () => 'Тестовая модель',
    onLoaded: (result) => loaded.push(result.modelId),
  });

  const result = await loader.load({
    modelId: 'model-a',
    onProgress: (value) => progress.push(value),
  });

  assert.equal(result.modelId, 'model-a');
  assert.deepEqual(loaded, ['model-a']);
  assert.equal(queue.list().length, 1);
  assert.equal(queue.list()[0].status, TRANSFER_STATUS.COMPLETED);
  assert.equal(progress.some((value) => value.progress >= .5), true);
});

test('queue cancellation stops the underlying runtime load', async () => {
  const queue = createTransferQueue({ storagePort: storagePort(), maxConcurrent: 1 });
  let rejectLoad;
  let cancelCalls = 0;
  const loader = createQueuedRuntimeLoader({
    queue,
    kind: 'speech-model',
    directLoad: () => new Promise((_resolve, reject) => {
      rejectLoad = reject;
    }),
    cancel() {
      cancelCalls += 1;
      const error = new Error('cancelled');
      error.name = 'AbortError';
      rejectLoad?.(error);
    },
  });

  const pending = loader.load({ modelId: 'speech-a' });
  await waitFor(() => queue.list()[0]?.status === TRANSFER_STATUS.ACTIVE);
  await queue.cancel(queue.list()[0].id);
  await assert.rejects(pending, (error) => error.name === 'AbortError');
  assert.equal(cancelCalls, 1);
  assert.equal(queue.list()[0].status, TRANSFER_STATUS.CANCELLED);
});
