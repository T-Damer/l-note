import assert from 'node:assert/strict';
import test from 'node:test';

import {
  STORAGE_PERSISTENCE_STATUS,
  requestPersistentStorage,
  storagePersistenceLabel,
} from '../src/services/storage-persistence.js';

test('reports unsupported storage managers without failing model load', async () => {
  const result = await requestPersistentStorage(null);
  assert.equal(result.status, STORAGE_PERSISTENCE_STATUS.UNSUPPORTED);
  assert.equal(result.persistent, false);
});

test('does not request persistence twice', async () => {
  let persistCalls = 0;
  const result = await requestPersistentStorage({
    async persisted() { return true; },
    async persist() { persistCalls += 1; return true; },
  });
  assert.equal(result.status, STORAGE_PERSISTENCE_STATUS.ALREADY_PERSISTENT);
  assert.equal(result.persistent, true);
  assert.equal(persistCalls, 0);
});

test('records granted and denied persistence results', async () => {
  const granted = await requestPersistentStorage({
    async persisted() { return false; },
    async persist() { return true; },
  });
  const denied = await requestPersistentStorage({
    async persisted() { return false; },
    async persist() { return false; },
  });
  assert.equal(granted.status, STORAGE_PERSISTENCE_STATUS.GRANTED);
  assert.equal(denied.status, STORAGE_PERSISTENCE_STATUS.DENIED);
  assert.match(storagePersistenceLabel(denied), /очистить кэш/u);
});
