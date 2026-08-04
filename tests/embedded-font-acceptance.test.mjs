import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { pdfInspectorSections } from '../src/helpers/pdf-inspector-result.js';
import { buildPack } from '../tools/build-pack.mjs';
import { inspectPdfFile } from '../tools/lib/pdf-inspector-node.mjs';
import { prepareFromArguments } from '../tools/prepare-documents.mjs';
import { embeddedType3FontPdf } from './fixtures/document-library/embedded-font-fixtures.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const manifest = JSON.parse(await readFile(
  path.join(root, 'tests', 'fixtures', 'document-library', 'manifest.json'),
  'utf8',
));

function acceptanceCase(id) {
  const value = manifest.cases.find((item) => item.id === id && item.status === 'active');
  assert.ok(value, `Missing active acceptance case ${id}`);
  return value;
}

async function generatedPdf(t, name, value) {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'lnote-font-acceptance-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const filename = path.join(directory, name);
  await writeFile(filename, value);
  return { directory, filename };
}

test('embedded Type3 font with ToUnicode remains exact searchable evidence', async (t) => {
  const fixture = acceptanceCase('generated-embedded-type3-font');
  const { directory, filename } = await generatedPdf(
    t,
    'embedded-font.pdf',
    embeddedType3FontPdf({ withToUnicode: true }),
  );
  const inspection = await inspectPdfFile(filename);
  assert.equal(inspection.pageCount, 1);
  assert.equal(inspection.hasEncodingIssues, false);
  assert.deepEqual(inspection.pagesNeedingOcr.map(Number), []);
  const text = pdfInspectorSections(inspection).map((section) => section.text).join('\n');
  for (const expected of fixture.expect.contains) assert.match(text, new RegExp(expected, 'u'));

  const output = path.join(directory, 'prepared');
  await prepareFromArguments({
    input: filename,
    output,
    id: 'acceptance.generated-embedded-type3-font',
    title: 'Embedded font acceptance',
  }, { generatedAt: '2026-08-04T14:00:00.000Z', onProgress() {} });
  const pack = await buildPack(output);
  assert.equal(pack.documents[0].source.inspection.hasEncodingIssues, false);
  assert.deepEqual(pack.documents[0].source.inspection.pagesNeedingOcr, []);
  assert.match(pack.documents[0].sections.map((section) => section.text).join('\n'), /EMBEDDED FONT TEXT/u);
});

test('embedded font without ToUnicode is blocked from search and routed to OCR', async (t) => {
  const fixture = acceptanceCase('generated-broken-font-encoding');
  const { filename } = await generatedPdf(
    t,
    'broken-font.pdf',
    embeddedType3FontPdf({ withToUnicode: false }),
  );
  const inspection = await inspectPdfFile(filename);
  assert.equal(inspection.pageCount, 1);
  assert.deepEqual(inspection.pagesNeedingOcr.map(Number), fixture.expect.ocrPages);
  assert.equal(pdfInspectorSections(inspection).length, 0);
});
