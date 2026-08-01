import assert from 'node:assert/strict';
import test from 'node:test';

import {
  TRANSFER_PRIORITY,
  TRANSFER_STATUS,
  createTransferQueue,
} from '../src/services/transfer-queue.js';

function storageWith(initial = []) {
  const values = new Map([['transfers.queue.v1', initial]]);
  return {
    async getSetting(key, fallback) {
      return values.has(key) ? structuredClone(values.get(key)) : fallback;
    },
    async setSetting(key, value) {
      values.set(key, structuredClone(value));
    },
    value: (key) => values.get(key),
  };
}

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

function nextTurn() {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

test('limits active transfers to four and starts higher priority tasks first', async () => {
  const storage = storageWith();
  const gates = new Map();
  const started = [];
  const queue = createTransferQueue({ storagePort: storage, maxConcurrent: 4 });
  queue.register('test', async (task) => {
    started.push(task.resourceId);
    const gate = deferred();
    gates.set(task.resourceId, gate);
    return gate.promise;
  });
  await queue.init();

  const tasks = [];
  for (let index = 0; index < 6; index += 1) {
    tasks.push(await queue.enqueue({
      id: `task-${index}`,
      kind: 'test',
      resourceId: `resource-${index}`,
      priority: index === 5 ? TRANSFER_PRIORITY.CURRENT_MODEL : TRANSFER_PRIORITY.DEFAULT,
    }));
  }
  await nextTurn();
  assert.equal(queue.activeCount(), 4);
  assert.ok(started.includes('resource-5'));

  for (const name of [...started]) gates.get(name).resolve(name);
  await nextTurn();
  await nextTurn();
  for (const gate of gates.values()) gate.resolve('done');
  await Promise.all(tasks.map(({ completion }) => completion));
  assert.equal(queue.activeCount(), 0);
  assert.equal(queue.list().every((task) => task.status === TRANSFER_STATUS.COMPLETED), true);
});

test('persists progress and restores interrupted work according to resume policy', async () => {
  const storage = storageWith([
    {
      id: 'auto',
      kind: 'package',
      resourceId: 'pack-a',
      dedupeKey: 'package:pack-a',
      label: 'Pack A',
      priority: 100,
      status: TRANSFER_STATUS.ACTIVE,
      resumeOnRestore: true,
      createdAt: '2026-08-01T00:00:00.000Z',
      updatedAt: '2026-08-01T00:00:00.000Z',
      attempts: 1,
      progress: .4,
      metadata: {},
    },
    {
      id: 'manual',
      kind: 'model',
      resourceId: 'model-a',
      dedupeKey: 'model:model-a',
      label: 'Model A',
      priority: 300,
      status: TRANSFER_STATUS.ACTIVE,
      resumeOnRestore: false,
      createdAt: '2026-08-01T00:00:00.000Z',
      updatedAt: '2026-08-01T00:00:00.000Z',
      attempts: 1,
      progress: .5,
      metadata: {},
    },
  ]);
  const queue = createTransferQueue({ storagePort: storage });
  await queue.init();
  const records = new Map(queue.list().map((task) => [task.id, task]));
  assert.equal(records.get('auto').status, TRANSFER_STATUS.QUEUED);
  assert.equal(records.get('manual').status, TRANSFER_STATUS.INTERRUPTED);
  assert.equal(storage.value('transfers.queue.v1').length, 2);
});

test('reports progress, resolves completion and deduplicates active resources', async () => {
  const queue = createTransferQueue({ storagePort: storageWith() });
  queue.register('package', async (task, { report }) => {
    report({ progress: .5, loaded: 5, total: 10, message: 'Половина' });
    return { installed: task.resourceId };
  });
  const first = await queue.enqueue({
    id: 'pack-1',
    kind: 'package',
    resourceId: 'pack-1',
  });
  const duplicate = await queue.enqueue({
    id: 'pack-copy',
    kind: 'package',
    resourceId: 'pack-1',
  });
  assert.equal(first.task.id, duplicate.task.id);
  assert.deepEqual(await first.completion, { installed: 'pack-1' });
  assert.equal(queue.list()[0].status, TRANSFER_STATUS.COMPLETED);
  assert.equal(queue.list()[0].progress, 1);
});

test('cancels active tasks through AbortSignal and allows retry after failure', async () => {
  const queue = createTransferQueue({ storagePort: storageWith(), maxConcurrent: 1 });
  queue.register('model', async (_task, { signal }) => new Promise((resolve, reject) => {
    signal.addEventListener('abort', () => {
      const error = new Error('cancelled');
      error.name = 'AbortError';
      reject(error);
    }, { once: true });
  }));
  const task = await queue.enqueue({ id: 'model-1', kind: 'model', resourceId: 'model-1' });
  await nextTurn();
  await queue.cancel('model-1');
  await assert.rejects(task.completion, (error) => error.name === 'AbortError');
  assert.equal(queue.list()[0].status, TRANSFER_STATUS.CANCELLED);
  assert.equal(await queue.retry('model-1'), true);
  assert.equal(queue.list()[0].status, TRANSFER_STATUS.QUEUED);
  await queue.cancel('model-1');
});
