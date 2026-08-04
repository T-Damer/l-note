import assert from 'node:assert/strict';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';

import {
  assertStaticFiles,
  assertStaticSyntax,
  buildStatic,
  root,
} from './helpers/static-build-fixture.mjs';
import {
  assertDocumentFeatureContracts,
  assertModelContracts,
  assertPackAndOfflineContracts,
  assertWorkflowFeatureContracts,
} from './helpers/static-feature-contracts.mjs';
import {
  assertApplicationAssemblyContracts,
  assertBenchmarkContracts,
  assertSearchRuntimeContracts,
  assertShellContracts,
} from './helpers/static-shell-contracts.mjs';

test('static build contains the complete local-first shell', async () => {
  const result = buildStatic();
  assert.equal(result.status, 0, result.stderr);
  await assertStaticFiles();
  await assertShellContracts();
  await assertBenchmarkContracts();
  const app = await assertApplicationAssemblyContracts();
  await assertSearchRuntimeContracts();
  await assertDocumentFeatureContracts();
  await assertWorkflowFeatureContracts();
  await assertModelContracts();
  await assertPackAndOfflineContracts();
  assertStaticSyntax(app);
});

test('static builder vendors the installed MiniSearch UMD file', async () => {
  const nodeModules = path.join(root, 'node_modules');
  const target = path.join(nodeModules, 'minisearch', 'dist', 'umd');
  const installed = path.join(target, 'index.js');
  const original = await readFile(installed, 'utf8').catch(() => null);
  await mkdir(target, { recursive: true });
  await writeFile(installed, 'globalThis.MiniSearch = class TestMiniSearch {};\n');
  try {
    const result = buildStatic();
    assert.equal(result.status, 0, result.stderr);
    const vendored = await readFile(path.join(root, 'dist', 'vendor', 'minisearch.js'), 'utf8');
    assert.match(vendored, /TestMiniSearch/u);
  } finally {
    if (original === null) await rm(nodeModules, { recursive: true, force: true });
    else await writeFile(installed, original);
  }
});
