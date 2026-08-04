import assert from 'node:assert/strict';
import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  pdfInspectorPages,
  pdfInspectorSections,
} from '../src/helpers/pdf-inspector-result.js';
import { buildPack } from '../tools/build-pack.mjs';
import { inspectPdfFile } from '../tools/lib/pdf-inspector-node.mjs';
import { prepareFromArguments } from '../tools/prepare-documents.mjs';
import {
  imageHeavyPdf,
  imageOnlyPdf,
  mixedTextAndImagePdf,
  multiColumnPdf,
} from './fixtures/document-library/pdf-fixtures.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const manifest = JSON.parse(await readFile(
  path.join(root, 'tests', 'fixtures', 'document-library', 'manifest.json'),
  'utf8',
));
const OCR_TSV = [
  'level\tpage_num\tblock_num\tpar_num\tline_num\tword_num\tleft\ttop\twidth\theight\tconf\ttext',
  '1\t1\t0\t0\t0\t0\t0\t0\t1200\t1600\t-1\t',
  '5\t1\t1\t1\t1\t1\t100\t120\t180\t40\t96.0\tScanned',
  '5\t1\t1\t1\t1\t2\t300\t120\t140\t40\t74.0\tpage',
  '',
].join('\n');

function acceptanceCase(id) {
  const value = manifest.cases.find((item) => item.id === id && item.status === 'active');
  assert.ok(value, `Missing active acceptance case ${id}`);
  return value;
}

async function generatedPdf(t, name, value) {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'lnote-pdf-acceptance-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const filename = path.join(directory, name);
  await writeFile(filename, value);
  return { directory, filename };
}

function deterministicOcrRunner(command, args) {
  if (command === 'pdftoppm') {
    assert.equal(args.includes('-singlefile'), true);
    return Promise.resolve({ stdout: Buffer.alloc(0), stderr: '' });
  }
  if (command === 'tesseract') {
    assert.equal(args.at(-1), 'tsv');
    return Promise.resolve({ stdout: Buffer.from(OCR_TSV), stderr: '' });
  }
  return Promise.reject(new Error(`Unexpected OCR command: ${command}`));
}

function acceptedReview(review, text) {
  const output = structuredClone(review);
  output.reviewedAt = '2026-08-04T12:00:00.000Z';
  output.reviewedBy = 'Acceptance reviewer';
  for (const candidate of output.candidates) {
    candidate.decision = 'accept';
    candidate.text = text;
    candidate.reviewedAt = output.reviewedAt;
    candidate.reviewedBy = output.reviewedBy;
  }
  return output;
}

test('real mixed PDF keeps its text page and routes the image page to OCR', async (t) => {
  const fixture = acceptanceCase('generated-mixed-pdf');
  const { directory, filename } = await generatedPdf(t, 'mixed.pdf', mixedTextAndImagePdf());
  const inspection = await inspectPdfFile(filename);
  const routed = new Set(inspection.pagesNeedingOcr.map(Number));
  assert.equal(inspection.pageCount, fixture.expect.pageCount);
  assert.equal(routed.has(fixture.expect.textPage), false);
  assert.equal(routed.has(fixture.expect.ocrPage), true);

  const pages = pdfInspectorPages(inspection);
  assert.equal(pages.find((page) => page.page === fixture.expect.textPage)?.needsOcr, false);
  assert.equal(pages.find((page) => page.page === fixture.expect.ocrPage)?.needsOcr, true);
  const sections = pdfInspectorSections(inspection);
  assert.deepEqual([...new Set(sections.map((section) => section.assetAnchor.page))], [fixture.expect.textPage]);
  assert.match(sections.map((section) => section.text).join('\n'), new RegExp(fixture.expect.contains, 'u'));

  const output = path.join(directory, 'prepared');
  await prepareFromArguments({
    input: filename,
    output,
    id: 'acceptance.generated-mixed-pdf',
    title: 'Mixed PDF acceptance',
  }, { generatedAt: '2026-08-04T11:00:00.000Z', onProgress() {} });
  const pack = await buildPack(output);
  assert.deepEqual(pack.documents[0].sections.map((section) => section.assetAnchor.page), [1]);
  assert.deepEqual(pack.documents[0].source.inspection.pagesNeedingOcr, [2]);
  assert.match(pack.documents[0].extractionWarnings.join('\n'), /2/u);
  assert.ok((await readdir(path.join(output, 'assets'))).some((name) => name.endsWith('.pdf')));
});

test('real image-only PDF enters the pack only after reviewed OCR acceptance', async (t) => {
  const fixture = acceptanceCase('generated-scanned-pdf-reviewed-ocr');
  const { directory, filename } = await generatedPdf(t, 'scan.pdf', imageOnlyPdf());
  const inspection = await inspectPdfFile(filename);
  assert.equal(inspection.pageCount, 1);
  assert.deepEqual(inspection.pagesNeedingOcr.map(Number), [1]);

  const pending = await prepareFromArguments({
    input: filename,
    output: path.join(directory, 'pending'),
    id: 'acceptance.generated-scanned-pdf-reviewed-ocr',
    title: 'Scanned PDF acceptance',
    ocr: true,
  }, {
    baseRunner: deterministicOcrRunner,
    generatedAt: '2026-08-04T11:30:00.000Z',
    onProgress() {},
  });
  assert.equal(pending.sections, 0);
  assert.equal(pending.ocrReviewState.pending, 1);

  const reviewFile = path.join(directory, 'reviewed.json');
  await writeFile(reviewFile, JSON.stringify(acceptedReview(
    pending.ocrReview,
    fixture.expect.reviewedText,
  )));
  const output = path.join(directory, 'reviewed');
  await prepareFromArguments({
    input: filename,
    output,
    id: 'acceptance.generated-scanned-pdf-reviewed-ocr',
    title: 'Scanned PDF acceptance',
    ocr: true,
    ocrReviewIn: reviewFile,
  }, {
    baseRunner: deterministicOcrRunner,
    generatedAt: '2026-08-04T12:30:00.000Z',
    onProgress() {},
  });
  const pack = await buildPack(output);
  assert.equal(pack.documents[0].sections.length, 1);
  assert.equal(pack.documents[0].sections[0].text, fixture.expect.reviewedText);
  assert.equal(pack.documents[0].sections[0].provenance.kind, 'pdf-page-ocr');
  assert.equal(pack.documents[0].sections[0].provenance.reviewedBy, 'Acceptance reviewer');
  assert.equal(pack.documents[0].source.extractor, '@firecrawl/pdf-inspector-wasm+tesseract-tsv');
  assert.equal(pack.preparationReviews[0].status, 'completed');
});

test('real multi-column PDF preserves columns as an ordered Markdown table', async (t) => {
  const fixture = acceptanceCase('generated-multicolumn-pdf');
  const { filename } = await generatedPdf(t, 'columns.pdf', multiColumnPdf());
  const inspection = await inspectPdfFile(filename);
  assert.equal(inspection.pageCount, 1);
  assert.equal(inspection.pagesNeedingOcr.map(Number).includes(1), false);
  const markdown = pdfInspectorSections(inspection).map((section) => section.text).join('\n');
  assert.match(markdown, /\|---\|---\|/u);
  const positions = fixture.expect.tableRows.map(([left, right]) => (
    markdown.indexOf(`|${left}|${right}|`)
  ));
  assert.equal(positions.every((position) => position >= 0), true, markdown);
  for (let index = 1; index < positions.length; index += 1) {
    assert.ok(positions[index - 1] < positions[index], markdown);
  }
});

test('image-heavy PDF keeps its reliable text outside OCR routing', async (t) => {
  const fixture = acceptanceCase('generated-image-heavy-pdf');
  const pdf = imageHeavyPdf();
  assert.equal((pdf.toString('latin1').match(/\/Subtype \/Image/gu) ?? []).length, fixture.expect.imageObjects);
  const { directory, filename } = await generatedPdf(t, 'image-heavy.pdf', pdf);
  const inspection = await inspectPdfFile(filename);
  assert.equal(inspection.pageCount, 1);
  assert.equal(inspection.pagesNeedingOcr.map(Number).includes(1), false);
  const sections = pdfInspectorSections(inspection);
  assert.deepEqual([...new Set(sections.map((section) => section.assetAnchor.page))], [1]);
  assert.match(sections.map((section) => section.text).join('\n'), new RegExp(fixture.expect.contains, 'u'));

  const output = path.join(directory, 'prepared');
  await prepareFromArguments({
    input: filename,
    output,
    id: 'acceptance.generated-image-heavy-pdf',
    title: 'Image-heavy PDF acceptance',
  }, { generatedAt: '2026-08-04T13:00:00.000Z', onProgress() {} });
  const pack = await buildPack(output);
  assert.equal(pack.documents[0].source.inspection.pagesNeedingOcr.length, 0);
  assert.match(pack.documents[0].sections.map((section) => section.text).join('\n'), /IMAGE HEAVY SEARCHABLE PAGE/u);
  assert.ok((await readdir(path.join(output, 'assets'))).some((name) => name.endsWith('.pdf')));
});
