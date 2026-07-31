import assert from 'node:assert/strict';
import { access, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function buildStatic() {
  return spawnSync(process.execPath, ['tools/build-static.mjs'], { cwd: root, encoding: 'utf8' });
}

function numberedTail(source, count = 120) {
  const lines = source.split('\n');
  const start = Math.max(0, lines.length - count);
  return lines.slice(start).map((line, index) => `${start + index + 1}: ${line}`).join('\n');
}

const offlineModules = [
  'src/ai.js',
  'src/router.js',
  'src/relations.js',
  'src/core/contracts.js',
  'src/core/ports.js',
  'src/core/runtime.js',
  'src/core/application-adapter.js',
  'src/core/knowledge-graph.js',
  'src/adapters/runtime-adapters.js',
  'src/domain-plugins/minimed.js',
  'src/integrations/minimed-adapter.js',
  'src/helpers/model-formatters.js',
  'src/pages/evidence-view.js',
  'src/pages/local-answer-view.js',
  'src/pages/model-lab-elements.js',
  'src/pages/model-lab-view.js',
  'src/services/answer-modes.js',
  'src/services/evidence-query.js',
  'src/services/local-model-loader.js',
  'src/services/model-action.js',
  'src/services/model-lifecycle.js',
  'src/services/model-preferences.js',
  'src/services/model-progress.js',
  'src/services/storage-persistence.js',
  'src/services/welcome-note.js',
  'src/workers/webllm-worker.js',
  'src/ui/dom.js',
  'src/ui/text.js',
  'src/ui/icons.js',
  'src/ui/components.js',
  'src/ui/routed-dialog.js',
  'src/ui/knowledge-graph.js',
];

test('static build contains the complete offline shell', async () => {
  const result = buildStatic();
  assert.equal(result.status, 0, result.stderr);
  for (const relative of [
    'index.html',
    'styles.css',
    'service-worker.js',
    'vendor/minisearch.js',
    'vendor/phosphor/style.css',
    'vendor/phosphor/Phosphor.woff2',
    'packs/catalog.json',
    'src/app.js',
    ...offlineModules,
  ]) {
    await access(path.join(root, 'dist', relative));
  }

  const css = await readFile(path.join(root, 'dist', 'styles.css'), 'utf8');
  assert.match(css, /Generated from styles\/main\.scss/u);
  assert.match(css, /--palette-dark-paper/u);
  assert.match(css, /vendor\/phosphor\/style\.css/u);
  assert.match(css, /html:has\(body\.modal-open\)/u);
  assert.match(css, /\.dialog-close-button/u);
  assert.match(css, /\.source-card__action/u);
  assert.match(css, /\.model-progress-track/u);
  assert.match(css, /\.model-active-panel/u);
  assert.match(css, /\.model-power\.is-cached/u);
  assert.match(css, /\.answer-mode-panel/u);
  assert.match(css, /\.knowledge-graph-node/u);
  assert.match(css, /\.ui-switch__track/u);

  const html = await readFile(path.join(root, 'dist', 'index.html'), 'utf8');
  assert.match(html, /ph-magnifying-glass/u);
  assert.match(html, /ph-note-pencil/u);
  assert.match(html, /data-action="toggle-library-view"/u);
  assert.match(html, /id="model-workspace" class="model-workspace hidden"/u);
  assert.match(html, /dialog-close-button/u);

  const app = await readFile(path.join(root, 'dist', 'src', 'app.js'), 'utf8');
  assert.match(app, /buildKnowledgeGraph/u);
  assert.match(app, /beginLocalModelLoad/u);
  assert.match(app, /createModelLabView/u);
  assert.match(app, /collectQuestionEvidence/u);
  assert.match(app, /renderEvidenceView/u);
  assert.match(app, /loadSelectedLocalModel/u);
  assert.match(app, /renderGeneratedLocalAnswer/u);
  assert.match(app, /MODEL_SELECTION_SETTING_KEY/u);
  assert.match(app, /markLocalModelCached/u);
  assert.match(app, /createRoutedDialogController/u);
  assert.match(app, /ensureWelcomeNote/u);

  const evidenceView = await readFile(path.join(root, 'dist', 'src', 'pages', 'evidence-view.js'), 'utf8');
  assert.match(evidenceView, /SourceCard\(\{/u);
  assert.match(evidenceView, /renderEvidenceView/u);

  const ai = await readFile(path.join(root, 'dist', 'src', 'ai.js'), 'utf8');
  assert.match(ai, /Qwen3-4B-q4f16_1-MLC/u);
  assert.match(ai, /CreateWebWorkerMLCEngine/u);
  assert.match(ai, /hasModelInCache/u);
  assert.match(ai, /cacheBackend:\s*this\.cacheBackend/u);

  const modelElements = await readFile(path.join(root, 'dist', 'src', 'pages', 'model-lab-elements.js'), 'utf8');
  assert.match(modelElements, /Выгрузить из памяти/u);
  assert.match(modelElements, /createModelLabElements/u);

  const appSyntax = spawnSync(process.execPath, ['--check', path.join(root, 'dist', 'src', 'app.js')], {
    cwd: root,
    encoding: 'utf8',
  });
  assert.equal(appSyntax.status, 0, `${appSyntax.stderr}\n\nAssembled app tail:\n${numberedTail(app)}`);

  for (const relative of offlineModules) {
    const check = spawnSync(process.execPath, ['--check', path.join(root, 'dist', relative)], {
      cwd: root,
      encoding: 'utf8',
    });
    assert.equal(check.status, 0, `${relative}: ${check.stderr}`);
  }
});

test('static builder vendors the installed MiniSearch UMD file', async () => {
  const nodeModules = path.join(root, 'node_modules');
  const target = path.join(nodeModules, 'minisearch', 'dist', 'umd');
  const existed = await readFile(path.join(target, 'index.js'), 'utf8').then(() => true, () => false);
  const original = existed ? await readFile(path.join(target, 'index.js'), 'utf8') : null;
  await mkdir(target, { recursive: true });
  await writeFile(path.join(target, 'index.js'), 'globalThis.MiniSearch = class TestMiniSearch {};\n');
  try {
    const result = buildStatic();
    assert.equal(result.status, 0, result.stderr);
    assert.match(await readFile(path.join(root, 'dist', 'vendor', 'minisearch.js'), 'utf8'), /TestMiniSearch/u);
  } finally {
    if (original === null) await rm(nodeModules, { recursive: true, force: true });
    else await writeFile(path.join(target, 'index.js'), original);
  }
});
