import assert from 'node:assert/strict';
import test from 'node:test';

import {
  attentionTransferTasks,
  sectionForTransferKind,
  sectionTransferActivities,
} from '../src/helpers/transfer-activity.js';

test('maps transfer kinds to their owning navigation sections', () => {
  assert.equal(sectionForTransferKind('speech-model'), 'search');
  assert.equal(sectionForTransferKind('model'), 'ask');
  assert.equal(sectionForTransferKind('package'), 'library');
  assert.equal(sectionForTransferKind('document'), 'library');
  assert.equal(sectionForTransferKind('unknown'), null);
});

test('aggregates running transfers into compact section progress', () => {
  const activities = sectionTransferActivities([
    { kind: 'package', status: 'active', label: 'Pack A', loaded: 25, total: 100 },
    { kind: 'package', status: 'queued', label: 'Pack B', progress: 0 },
    { kind: 'model', status: 'active', label: 'Qwen', progress: .6 },
    { kind: 'speech-model', status: 'completed', label: 'Whisper', progress: 1 },
  ]);
  assert.equal(activities.library.active, true);
  assert.equal(activities.library.taskCount, 2);
  assert.equal(activities.library.progress, .125);
  assert.equal(activities.library.label, '2 операции загрузки');
  assert.equal(activities.ask.progress, .6);
  assert.equal(activities.search, undefined);
});

test('keeps indeterminate progress when running tasks report no usable value', () => {
  const activities = sectionTransferActivities([
    { kind: 'speech-model', status: 'active', label: 'Whisper', progress: null },
  ]);
  assert.equal(activities.search.progress, null);
  assert.equal(activities.search.label, 'Whisper');
});

test('large panel receives only operations that require user attention', () => {
  const tasks = [
    { id: 'queued', status: 'queued' },
    { id: 'active', status: 'active' },
    { id: 'done', status: 'completed' },
    { id: 'interrupted', status: 'interrupted' },
    { id: 'failed', status: 'failed' },
    { id: 'cancelled', status: 'cancelled' },
  ];
  assert.deepEqual(attentionTransferTasks(tasks).map((task) => task.id), [
    'interrupted',
    'failed',
    'cancelled',
  ]);
});
