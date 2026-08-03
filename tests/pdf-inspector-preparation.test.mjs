import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { parsePdfTextPages } from '../tools/lib/document-extraction.mjs';
import {
  createPdfInspectorPreparationRunner,
  decoratePreparedPdfDocuments,
} from '../tools/lib/pdf-inspector-preparation.mjs';
import { prepareFromArguments } from '../tools/prepare-documents.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const MIXED_RESULT = {
  pdfType: 'Mixed',
  pageCount: 3,
  parserVersion: '0.1.3',
  confidence: .9,
  pagesNeedingOcr: [2],
  ocrReasonsByPage: [{ page: 2, reasons: ['no_text_operators'] }],
  layout: { isComplex: true, pagesWithTables: [1], pagesWithColumns: [] },
  markdown: [
    '<!-- Page 1 -->',
    '| A | B |',
    '| --- | --- |',
    '| 1 | 2 |',
    '<!-- Page 2 -->',
    '[Image 1]',
    '<!-- Page 3 -->',
    'Финал.',
  ].join('\n'),
};

async function temporaryDirectory(t) {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'lnote-pdf-inspector-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  return directory;
}

test('CLI compatibility runner emits page-aware Markdown and blank OCR pages', async (t) => {
  const directory = await temporaryDirectory(t);
  const pdf = path.join(directory, 'report.pdf');
  await writeFile(pdf, '%PDF fixture');
  const preparation = await createPdfInspectorPreparationRunner({
    inputPath: directory,
    inspector: async () => MIXED_RESULT,
  });
  const output = await preparation.runner('pdftotext', ['-layout', pdf, '-']);
  const pages = parsePdfTextPages(output.stdout);

  assert.equal(pages.length, 3);
  assert.match(pages[0].text, /\| 1 \| 2 \|/u);
  assert.equal(pages[1].text, '');
  assert.equal(pages[2].text, 'Финал.');
  assert.equal(preparation.inspections.get('report.pdf'), MIXED_RESULT);
});

test('prepared PDF metadata records pdf-inspector instead of the compatibility command', async (t) => {
  const directory = await temporaryDirectory(t);
  const documents = path.join(directory, 'documents');
  await mkdir(documents, { recursive: true });
  const filename = path.join(documents, 'report.json');
  await writeFile(filename, `${JSON.stringify({
    id: 'doc.report',
    title: 'Report',
    source: {
      title: 'report.pdf',
      mimeType: 'application/pdf',
      extractor: 'pdftotext+tesseract-tsv',
    },
    sections: [],
  })}\n`);

  const changed = await decoratePreparedPdfDocuments(directory, new Map([['report.pdf', MIXED_RESULT]]));
  const document = JSON.parse(await readFile(filename, 'utf8'));
  assert.equal(changed, 1);
  assert.equal(document.source.extractor, '@firecrawl/pdf-inspector-wasm+tesseract-tsv');
  assert.equal(document.source.inspection.pdfType, 'Mixed');
  assert.deepEqual(document.source.inspection.pagesNeedingOcr, [2]);
  assert.match(document.extractionWarnings.join(' '), /2/u);
});

test('prepare:documents parses a real text PDF without Poppler', async (t) => {
  const directory = await temporaryDirectory(t);
  const output = path.join(directory, 'prepared');
  const result = await prepareFromArguments({
    input: path.join(root, 'assets', 'lnote-source-demo.pdf'),
    output,
    id: 'test.pdf-inspector',
    title: 'PDF inspector test',
  });
  const documentFiles = (await readdir(path.join(output, 'documents'))).filter((name) => name.endsWith('.json'));
  assert.equal(result.documents, 1);
  assert.equal(documentFiles.length, 1);
  const document = JSON.parse(await readFile(path.join(output, 'documents', documentFiles[0]), 'utf8'));
  assert.equal(document.source.extractor, '@firecrawl/pdf-inspector-wasm');
  assert.equal(document.source.inspection.pdfType, 'TextBased');
  assert.ok(document.sections.length >= 1);
  assert.ok(document.sections.every((section) => Number.isInteger(section.assetAnchor?.page)));
});
