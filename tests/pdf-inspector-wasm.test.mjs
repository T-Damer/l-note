import assert from 'node:assert/strict';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { inspectPdfFile } from '../tools/lib/pdf-inspector-node.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

test('pdf-inspector WASM parses the bundled text PDF', async () => {
  const result = await inspectPdfFile(path.join(root, 'assets', 'lnote-source-demo.pdf'));
  assert.ok(result.pageCount >= 1);
  assert.equal(typeof result.pdfType, 'string');
  assert.equal(result.parserVersion, '0.1.3');
  assert.equal(typeof result.markdown, 'string');
  assert.ok(result.markdown.length > 20);
});
