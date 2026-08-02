import assert from 'node:assert/strict';
import test from 'node:test';

import {
  MODEL_CATALOG_STATUS,
  indexModelCatalog,
  isModelAvailable,
  markModelCached,
  resolveModelLifecycle,
} from '../src/services/model-lifecycle.js';

const profile = { modelId: 'Qwen3-1.7B-q4f16_1-MLC', label: 'Qwen3 1.7B' };

test('model lifecycle distinguishes missing, cached and loaded states', () => {
  const catalog = indexModelCatalog([{ ...profile, available: true, cached: false }]);
  assert.equal(resolveModelLifecycle({ profile, catalog }).id, 'missing');

  const cached = markModelCached(catalog, profile, true);
  assert.equal(resolveModelLifecycle({ profile, catalog: cached }).id, 'cached');
  assert.equal(resolveModelLifecycle({
    profile,
    catalog: cached,
    active: true,
    activeModelId: profile.modelId,
  }).id, 'loaded');
});

test('catalog checks do not make an unknown model unavailable prematurely', () => {
  assert.equal(isModelAvailable(new Map(), profile), true);
  assert.equal(resolveModelLifecycle({
    profile,
    catalog: new Map(),
    catalogStatus: MODEL_CATALOG_STATUS.LOADING,
  }).id, 'checking');
});

test('catalog unavailability and inspection errors remain distinct', () => {
  const unavailable = indexModelCatalog([{ ...profile, available: false, cached: false }]);
  assert.equal(resolveModelLifecycle({ profile, catalog: unavailable }).id, 'unavailable');
  assert.equal(resolveModelLifecycle({
    profile,
    catalog: new Map(),
    catalogStatus: MODEL_CATALOG_STATUS.ERROR,
  }).id, 'unknown');
});

test('markModelCached returns a new catalog without mutating the previous map', () => {
  const original = new Map();
  const next = markModelCached(original, profile, true);
  assert.equal(original.size, 0);
  assert.equal(next.get(profile.modelId)?.cached, true);
  assert.equal(next.get(profile.modelId)?.available, true);
});
