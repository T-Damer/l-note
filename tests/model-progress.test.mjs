import assert from 'node:assert/strict';
import test from 'node:test';

import {
  MODEL_LOAD_STATUS,
  completeModelLoad,
  createModelLoadState,
  failModelLoad,
  startModelLoad,
  updateModelLoadProgress,
} from '../src/services/model-progress.js';

const profile = { modelId: 'model-1', sizeMB: 1000 };

test('tracks approximate model bytes and a smoothed speed from progress callbacks', () => {
  const idle = createModelLoadState(profile, 1000);
  const loading = startModelLoad(idle, profile, 1000);
  const halfway = updateModelLoadProgress(loading, { progress: 0.5, text: 'Загрузка весов' }, 2000);
  assert.equal(halfway.status, MODEL_LOAD_STATUS.LOADING);
  assert.equal(halfway.progress, 0.5);
  assert.equal(halfway.loadedMB, 500);
  assert.equal(halfway.remainingMB, 500);
  assert.equal(halfway.speedMBps, 175);
  assert.equal(halfway.text, 'Загрузка весов');
});

test('uses persistent download size separately from active runtime memory', () => {
  const state = createModelLoadState({
    modelId: 'qwen-4b',
    downloadSizeMB: 2300,
    runtimeMemoryMB: 3431.59,
    sizeMB: 9999,
  });
  assert.equal(state.totalMB, 2300);
  assert.equal(state.runtimeMemoryMB, 3431.59);
});

test('does not let a multi-stage callback move the progress bar backwards', () => {
  const loading = startModelLoad(createModelLoadState(profile, 1000), profile, 1000);
  const first = updateModelLoadProgress(loading, { progress: 0.8 }, 2000);
  const reset = updateModelLoadProgress(first, { progress: 0.2 }, 3000);
  assert.equal(reset.progress, 0.8);
});

test('marks completed and failed model loads explicitly', () => {
  const loading = startModelLoad(createModelLoadState(profile, 1000), profile, 1000);
  const ready = completeModelLoad(loading, 2000);
  assert.equal(ready.status, MODEL_LOAD_STATUS.READY);
  assert.equal(ready.progress, 1);
  assert.equal(ready.remainingMB, 0);

  const failed = failModelLoad(loading, new Error('network'), 2000);
  assert.equal(failed.status, MODEL_LOAD_STATUS.ERROR);
  assert.equal(failed.error, 'network');
});
