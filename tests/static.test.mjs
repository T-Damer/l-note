import assert from 'node:assert/strict';
import { access, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

test('static build contains the complete offline shell', async () => {
  const result = spawnSync(process.execPath, ['tools/build-static.mjs'], { cwd: root, encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
  for (const relative of [
    'index.html',
    'styles.css',
    'service-worker.js',
    'vendor/minisearch.js',
    'packs/catalog.json',
    'src/app.js',
    'src/router.js',
    'src/relations.js',
    'src/domain-plugins/minimed.js',
  ]) {
    await access(path.join(root, 'dist', relative));
  }
  const css = await readFile(path.join(root, 'dist', 'styles.css'), 'utf8');
  assert.match(css, /Generated from styles\/main\.scss/u);
  assert.match(css, /--palette-dark-paper/u);
});

test('static builder vendors the installed MiniSearch UMD file', async () => {
  const nodeModules = path.join(root, 'node_modules');
  const target = path.join(nodeModules, 'minisearch', 'dist', 'umd');
  const existed = await readFile(path.join(target, 'index.js'), 'utf8').then(() => true, () => false);
  const original = existed ? await readFile(path.join(target, 'index.js'), 'utf8') : null;
  await mkdir(target, { recursive: true });
  await writeFile(path.join(target, 'index.js'), 'globalThis.MiniSearch = class TestMiniSearch {};\n');
  try {
    const result = spawnSync(process.execPath, ['tools/build-static.mjs'], { cwd: root, encoding: 'utf8' });
    assert.equal(result.status, 0, result.stderr);
    assert.match(await readFile(path.join(root, 'dist', 'vendor', 'minisearch.js'), 'utf8'), /TestMiniSearch/u);
  } finally {
    if (original === null) await rm(nodeModules, { recursive: true, force: true });
    else await writeFile(path.join(target, 'index.js'), original);
  }
});
