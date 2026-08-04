import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

test('document reader exposes preserved non-PDF source files safely', async () => {
  const source = await readFile(path.join(root, 'src/pages/document-asset-view.js'), 'utf8');
  assert.match(source, /Открыть или скачать исходный файл/u);
  assert.match(source, /download:\s*''/u);
  assert.match(source, /rel:\s*'noreferrer'/u);
  assert.match(source, /target:\s*'_blank'/u);
  assert.match(source, /Встроенный просмотр этого формата недоступен/u);
});

test('universal preparation publishes the original file through the public asset field', async () => {
  const source = await readFile(path.join(root, 'tools/lib/universal-document-preparation.mjs'), 'utf8');
  assert.match(source, /asset:\s*sourceAsset\(primaryAsset, mimeType, extracted\.title, isPdf\)/u);
  assert.match(source, /sha256:\s*sourceSha256/u);
  assert.match(source, /bytes:\s*info\.size/u);
});
