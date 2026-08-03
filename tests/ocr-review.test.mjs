import assert from 'node:assert/strict';
import { access, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { buildPack } from '../tools/build-pack.mjs';
import { renderOcrReviewHtml } from '../tools/lib/ocr-review-html.mjs';
import {
  OCR_REVIEW_KIND,
  createOcrReview,
  parseTesseractTsv,
} from '../tools/lib/ocr-review.mjs';
import { prepareFromArguments } from '../tools/prepare-documents.mjs';

const OCR_TSV = [
  'level\tpage_num\tblock_num\tpar_num\tline_num\tword_num\tleft\ttop\twidth\theight\tconf\ttext',
  '1\t1\t0\t0\t0\t0\t0\t0\t1200\t1600\t-1\t',
  '5\t1\t1\t1\t1\t1\t100\t120\t180\t40\t94.5\tРаспознанная',
  '5\t1\t1\t1\t1\t2\t300\t120\t140\t40\t72.0\tстраница.',
  '',
].join('\n');

function runner(command, args) {
  if (command === 'pdftotext') {
    return Promise.resolve({
      stdout: Buffer.from('Текст первой страницы.\f\fТекст третьей страницы.\f'),
      stderr: '',
    });
  }
  if (command === 'pdftoppm') return Promise.resolve({ stdout: Buffer.alloc(0), stderr: '' });
  if (command === 'tesseract') {
    assert.equal(args.at(-1), 'tsv');
    return Promise.resolve({ stdout: Buffer.from(OCR_TSV), stderr: '' });
  }
  return Promise.reject(new Error(`Unexpected command: ${command}`));
}

async function fixture() {
  const root = await mkdtemp(path.join(os.tmpdir(), 'l-note-ocr-review-'));
  const input = path.join(root, 'input');
  await mkdir(input, { recursive: true });
  const pdf = path.join(input, 'scan.pdf');
  await writeFile(pdf, 'pdf-version-1');
  return { root, input, pdf };
}

function reviewed(review, decision, text = null) {
  const output = structuredClone(review);
  output.reviewedAt = '2026-08-03T16:00:00.000Z';
  output.reviewedBy = 'Reviewer';
  for (const candidate of output.candidates) {
    candidate.decision = decision;
    candidate.reviewedAt = output.reviewedAt;
    candidate.reviewedBy = output.reviewedBy;
    if (text !== null) candidate.text = text;
  }
  return output;
}

test('parses Tesseract TSV text, confidence and coordinates', () => {
  const result = parseTesseractTsv(OCR_TSV);
  assert.equal(result.text, 'Распознанная страница.');
  assert.equal(result.words.length, 2);
  assert.equal(result.pageWidth, 1200);
  assert.equal(result.pageHeight, 1600);
  assert.equal(result.minimumConfidence, 72);
  assert.equal(result.lowConfidenceWords, 1);
  assert.deepEqual(result.words[1], {
    text: 'страница.',
    confidence: 72,
    block: 1,
    paragraph: 1,
    line: 1,
    word: 2,
    left: 300,
    top: 120,
    width: 140,
    height: 40,
  });
});

test('first OCR pass writes review artifacts and blocks pack compilation', async () => {
  const { root, input } = await fixture();
  try {
    const output = path.join(root, 'pending');
    const result = await prepareFromArguments({
      input,
      output,
      id: 'example.ocr',
      title: 'OCR example',
      ocr: true,
    }, {
      runner,
      generatedAt: '2026-08-03T15:00:00.000Z',
      onProgress() {},
    });
    assert.equal(result.ocrReview.kind, OCR_REVIEW_KIND);
    assert.equal(result.ocrReviewState.pending, 1);
    assert.equal(result.sections, 2);
    await access(path.join(output, 'ocr-review.json'));
    await access(path.join(output, 'ocr-review.html'));
    const manifest = JSON.parse(await readFile(path.join(output, 'manifest.json'), 'utf8'));
    assert.equal(manifest.preparationReviews[0].status, 'pending');
    await assert.rejects(buildPack(output), /Preparation review is incomplete/u);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('accepted edited OCR text enters the pack with review provenance', async () => {
  const { root, input } = await fixture();
  try {
    const pending = await prepareFromArguments({
      input,
      output: path.join(root, 'pending'),
      id: 'example.ocr',
      ocr: true,
    }, { runner, generatedAt: '2026-08-03T15:00:00.000Z', onProgress() {} });
    const reviewFile = path.join(root, 'reviewed.json');
    await writeFile(reviewFile, JSON.stringify(reviewed(
      pending.ocrReview,
      'accept',
      'Исправленный текст второй страницы.',
    )));

    const output = path.join(root, 'reviewed');
    const prepared = await prepareFromArguments({
      input,
      output,
      id: 'example.ocr',
      ocr: true,
      ocrReviewIn: reviewFile,
    }, { runner, generatedAt: '2026-08-03T17:00:00.000Z', onProgress() {} });
    assert.equal(prepared.ocrReviewState.complete, true);
    assert.equal(prepared.ocrReviewState.accept, 1);
    const pack = await buildPack(output);
    const pdf = pack.documents[0];
    assert.deepEqual(pdf.sections.map((section) => section.assetAnchor.page), [1, 2, 3]);
    const accepted = pdf.sections.find((section) => section.assetAnchor.page === 2);
    assert.equal(accepted.text, 'Исправленный текст второй страницы.');
    assert.equal(accepted.provenance.kind, 'pdf-page-ocr');
    assert.equal(accepted.provenance.reviewedBy, 'Reviewer');
    assert.equal(accepted.provenance.reviewedAt, '2026-08-03T16:00:00.000Z');
    assert.equal(accepted.provenance.lowConfidenceWords, 1);
    assert.equal(pack.preparationReviews[0].status, 'completed');
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('dismissed OCR pages stay outside the final pack', async () => {
  const { root, input } = await fixture();
  try {
    const pending = await prepareFromArguments({
      input,
      output: path.join(root, 'pending'),
      id: 'example.ocr-dismiss',
      ocr: true,
    }, { runner, onProgress() {} });
    const reviewFile = path.join(root, 'dismissed.json');
    await writeFile(reviewFile, JSON.stringify(reviewed(pending.ocrReview, 'dismiss')));
    const output = path.join(root, 'reviewed');
    await prepareFromArguments({
      input,
      output,
      id: 'example.ocr-dismiss',
      ocr: true,
      ocrReviewIn: reviewFile,
    }, { runner, onProgress() {} });
    const pack = await buildPack(output);
    assert.deepEqual(pack.documents[0].sections.map((section) => section.assetAnchor.page), [1, 3]);
    assert.equal(pack.preparationReviews[0].dismissed, 1);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('changed PDF content invalidates a previous review', async () => {
  const { root, input, pdf } = await fixture();
  try {
    const first = await prepareFromArguments({
      input,
      output: path.join(root, 'pending'),
      id: 'example.ocr-change',
      ocr: true,
    }, { runner, onProgress() {} });
    const reviewFile = path.join(root, 'accepted.json');
    await writeFile(reviewFile, JSON.stringify(reviewed(first.ocrReview, 'accept')));
    await writeFile(pdf, 'pdf-version-2');
    const output = path.join(root, 'changed');
    const changed = await prepareFromArguments({
      input,
      output,
      id: 'example.ocr-change',
      ocr: true,
      ocrReviewIn: reviewFile,
    }, { runner, onProgress() {} });
    assert.equal(changed.ocrReviewState.pending, 1);
    assert.notEqual(changed.ocrReview.candidates[0].id, first.ocrReview.candidates[0].id);
    await assert.rejects(buildPack(output), /Preparation review is incomplete/u);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('OCR review HTML embeds source data safely and exposes an editable workflow', () => {
  const review = createOcrReview({
    targetPackId: 'example.safe',
    candidates: [{
      id: 'ocr-review.test',
      decision: 'pending',
      eligible: true,
      validationError: null,
      sourcePath: '<img src=x onerror=alert(1)>.pdf',
      sourceSha256: 'a'.repeat(64),
      assetUrl: './assets/safe.pdf',
      documentId: 'doc.safe',
      documentTitle: '<script>alert(1)</script>',
      page: 1,
      language: 'rus',
      originalText: '<b>OCR text</b>',
      text: '<b>OCR text</b>',
      pageWidth: 100,
      pageHeight: 100,
      averageConfidence: 90,
      minimumConfidence: 90,
      lowConfidenceThreshold: 80,
      lowConfidenceWords: 0,
      words: [],
    }],
  });
  const html = renderOcrReviewHtml(review);
  assert.doesNotMatch(html, /<script>alert\(1\)<\/script>/u);
  assert.doesNotMatch(html, /<img src=x/u);
  assert.match(html, /textContent/u);
  assert.match(html, /Исправленный OCR-текст/u);
  assert.match(html, /iframe/u);
});
