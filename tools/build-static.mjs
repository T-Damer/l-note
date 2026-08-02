#!/usr/bin/env node
import { cp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildPhosphorIcons } from './lib/icons-builder.mjs';
import { buildStyles } from './lib/styles-builder.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dist = path.join(root, 'dist');
await buildStyles(root);
await buildPhosphorIcons(root);
await rm(dist, { recursive: true, force: true });
await mkdir(dist, { recursive: true });
for (const item of ['index.html', 'styles.css', 'manifest.webmanifest', 'service-worker.js', 'assets', 'src', 'packs', 'vendor']) {
  await cp(path.join(root, item), path.join(dist, item), { recursive: true });
}
const appPartsDir = path.join(root, 'src', 'app-parts');
const appParts = (await readdir(appPartsDir)).filter((name) => name.endsWith('.js')).sort();
const appSource = (await Promise.all(appParts.map((name) => readFile(path.join(appPartsDir, name), 'utf8')))).join('\n');
await writeFile(path.join(dist, 'src', 'app.js'), appSource);
await rm(path.join(dist, 'src', 'app-parts'), { recursive: true, force: true });
const installedMiniSearch = path.join(root, 'node_modules', 'minisearch', 'dist', 'umd', 'index.js');
try {
  await cp(installedMiniSearch, path.join(dist, 'vendor', 'minisearch.js'));
  console.log('Vendored MiniSearch 7.2.0 into the static build.');
} catch (error) {
  if (error?.code !== 'ENOENT') throw error;
  console.warn('MiniSearch dependency is not installed; static build keeps the deterministic fallback placeholder.');
}
console.log(`Static application copied to ${dist}`);
