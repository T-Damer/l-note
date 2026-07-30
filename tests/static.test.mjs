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
    'src/services/model-action.js',
    'src/services/model-progress.js',
    'src/services/welcome-note.js',
    'src/ui/text.js',
    'src/ui/icons.js',
    'src/ui/components.js',
    'src/ui/routed-dialog.js',
    'src/ui/knowledge-graph.js',
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
  assert.match(css, /\.knowledge-graph-node/u);
  assert.match(css, /\.ui-switch__track/u);

  const html = await readFile(path.join(root, 'dist', 'index.html'), 'utf8');
  assert.match(html, /ph-magnifying-glass/u);
  assert.match(html, /ph-note-pencil/u);
  assert.match(html, /data-action="toggle-library-view"/u);
  assert.match(html, /id="model-workspace" class="model-workspace hidden"/u);
  assert.match(html, /dialog-close-button/u);

  const app = await readFile(path.join(root, 'dist', 'src', 'app.js'), 'utf8');
  assert.match(app, /SourceCard\(\{/u);
  assert.match(app, /buildKnowledgeGraph/u);
  assert.match(app, /beginLocalModelLoad/u);
  assert.match(app, /createRoutedDialogController/u);
  assert.match(app, /ensureWelcomeNote/u);

  const syntax = spawnSync(process.execPath, ['--check', path.join(root, 'dist', 'src', 'app.js')], {
    cwd: root,
    encoding: 'utf8',
  });
  assert.equal(syntax.status, 0, `${syntax.stderr}\n\nAssembled app tail:\n${numberedTail(app)}`);
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
