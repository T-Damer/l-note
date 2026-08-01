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

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

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

test('inspects persistent WebLLM cache state without loading a model', async () => {
  const module = {
    prebuiltAppConfig: {
      model_list: LOCAL_MODEL_PROFILES.map((profile) => ({ model_id: profile.modelId })),
    },
    async hasModelInCache(modelId, appConfig) {
      assert.equal(appConfig.cacheBackend, 'cache');
      return modelId === 'Qwen3-4B-q4f16_1-MLC';
    },
  };
  const adapter = new BrowserLocalAi({ moduleLoader: async () => module });
  const inspected = await adapter.inspectModels();

  assert.deepEqual(inspected.map((profile) => profile.cached), [false, true, false]);
  assert.equal(await adapter.isModelCached('Qwen3-4B-q4f16_1-MLC'), true);
  assert.equal(adapter.engine, null);
});

test('explicit unload releases the worker but keeps cache management separate', async () => {
  const worker = { terminated: false, terminate() { this.terminated = true; } };
  const engine = { unloaded: false, async unload() { this.unloaded = true; } };
  const adapter = new BrowserLocalAi();
  adapter.worker = worker;
  adapter.engine = engine;
  adapter.modelId = 'Qwen3-1.7B-q4f16_1-MLC';

  const result = await adapter.unload();

  assert.deepEqual(result, { modelId: 'Qwen3-1.7B-q4f16_1-MLC', unloaded: true });
  assert.equal(worker.terminated, true);
  assert.equal(engine.unloaded, true);
  assert.equal(adapter.worker, null);
  assert.equal(adapter.engine, null);
  assert.equal(adapter.modelId, null);
});

test('cancelLoad terminates the loading worker and rejects a late engine result', async () => {
  const engineDeferred = deferred();
  const worker = { terminated: false, terminate() { this.terminated = true; } };
  const engine = { unloaded: false, async unload() { this.unloaded = true; } };
  const module = {
    prebuiltAppConfig: { model_list: [{ model_id: DEFAULT_LOCAL_MODEL_ID }] },
    hasModelInCache: async () => false,
    CreateWebWorkerMLCEngine: async () => engineDeferred.promise,
  };
  const adapter = new BrowserLocalAi({
    moduleLoader: async () => module,
    workerFactory: () => worker,
  });
  Object.defineProperty(adapter, 'available', { value: true });

  const loading = adapter.load({ modelId: DEFAULT_LOCAL_MODEL_ID });
  await new Promise((resolve) => setTimeout(resolve, 0));
  const cancelled = await adapter.cancelLoad();
  engineDeferred.resolve(engine);

  assert.deepEqual(cancelled, { modelId: DEFAULT_LOCAL_MODEL_ID, cancelled: true });
  await assert.rejects(loading, (error) => error.name === 'AbortError');
  assert.equal(worker.terminated, true);
  assert.equal(engine.unloaded, true);
  assert.equal(adapter.loading, false);
});

test('browser adapter exposes explicit unload and requires WebGPU plus Worker', () => {
  const adapter = new BrowserLocalAi();
  assert.equal(typeof adapter.unload, 'function');
  assert.equal(typeof adapter.cancelLoad, 'function');
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
