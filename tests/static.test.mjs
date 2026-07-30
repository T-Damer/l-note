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
    'src/adapters/runtime-adapters.js',
    'src/domain-plugins/minimed.js',
    'src/services/model-action.js',
    'src/ui/text.js',
    'src/ui/icons.js',
    'src/ui/components.js',
  ]) {
    await access(path.join(root, 'dist', relative));
  }
  const css = await readFile(path.join(root, 'dist', 'styles.css'), 'utf8');
  assert.match(css, /Generated from styles\/main\.scss/u);
  assert.match(css, /--palette-dark-paper/u);
  assert.match(css, /vendor\/phosphor\/style\.css/u);
  assert.match(css, /html:has\(body\.modal-open\)/u);
  assert.match(css, /grid-column:\s*3/u);

  const html = await readFile(path.join(root, 'dist', 'index.html'), 'utf8');
  assert.match(html, /ph-magnifying-glass/u);
  assert.match(html, /ph-note-pencil/u);

  const syntax = spawnSync(process.execPath, ['--check', path.join(root, 'dist', 'src', 'app.js')], {
    cwd: root,
    encoding: 'utf8',
  });
  assert.equal(syntax.status, 0, syntax.stderr);
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
