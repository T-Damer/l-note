import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

test('WebLLM cache inspection stays lazy until the Ask page opens', async () => {
  const source = await readFile(path.join(root, 'src', 'app-parts', '04z-model-runtime-lazy.js'), 'utf8');
  let actualInspections = 0;
  let refreshes = 0;
  let shownPage = null;

  const state = {
    localAi: {
      async inspectModels() {
        actualInspections += 1;
        return [{ modelId: 'model-1', available: true, cached: true }];
      },
    },
  };

  const sandbox = {
    state,
    LOCAL_MODEL_PROFILES: [{ modelId: 'model-1' }],
    normalizeBaseRoute(page) { return page; },
    showBasePage(page) { shownPage = page; },
    async refreshLocalModelCatalogState() {
      refreshes += 1;
      await state.localAi.inspectModels();
    },
    queueMicrotask(callback) { Promise.resolve().then(callback); },
    console,
  };

  vm.runInNewContext(source, sandbox, { filename: '04z-model-runtime-lazy.js' });

  const initial = await state.localAi.inspectModels();
  assert.equal(actualInspections, 0);
  assert.equal(initial[0].cached, null);

  sandbox.showBasePage('search');
  await Promise.resolve();
  assert.equal(shownPage, 'search');
  assert.equal(refreshes, 0);

  sandbox.showBasePage('ask');
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(shownPage, 'ask');
  assert.equal(refreshes, 1);
  assert.equal(actualInspections, 1);

  sandbox.showBasePage('ask');
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(refreshes, 1);
});
