import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { validatePack } from '../src/packs.js';
import { buildPack } from '../tools/build-pack.mjs';
import {
  extractPdfDocument,
  parseDocxDocumentXml,
  parsePdfTextPages,
  prepareDocumentDirectory,
} from '../tools/lib/document-extraction.mjs';
import { argumentsFrom as prepareArguments } from '../tools/prepare-documents.mjs';

const DOCX_XML = `<?xml version="1.0" encoding="UTF-8"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>
    <w:p><w:pPr><w:pStyle w:val="Title"/></w:pPr><w:r><w:t>Рабочий документ</w:t></w:r></w:p>
    <w:p><w:pPr><w:pStyle w:val="Heading1"/></w:pPr><w:r><w:t>Первый раздел</w:t></w:r></w:p>
    <w:p><w:r><w:t>Первый абзац.</w:t></w:r></w:p>
    <w:p><w:r><w:t xml:space="preserve">Второй абзац &amp; данные.</w:t></w:r></w:p>
    <w:p><w:pPr><w:pStyle w:val="Heading2"/></w:pPr><w:r><w:t>Подраздел</w:t></w:r></w:p>
    <w:p><w:r><w:t>Третий абзац.</w:t></w:r></w:p>
  </w:body>
</w:document>`;

const OCR_TSV = [
  'level\tpage_num\tblock_num\tpar_num\tline_num\tword_num\tleft\ttop\twidth\theight\tconf\ttext',
  '1\t1\t0\t0\t0\t0\t0\t0\t1200\t1600\t-1\t',
  '5\t1\t1\t1\t1\t1\t100\t120\t180\t40\t94.5\tРаспознанная',
  '5\t1\t1\t1\t1\t2\t300\t120\t140\t40\t72.0\tстраница.',
  '',
].join('\n');

function fakeRunner(command, args) {
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
  if (command === 'unzip' && args.includes('word/document.xml')) {
    return Promise.resolve({ stdout: Buffer.from(DOCX_XML), stderr: '' });
  }
  return Promise.reject(new Error(`Unexpected command: ${command} ${args.join(' ')}`));
}

test('splits pdftotext output into stable page records', () => {
  assert.deepEqual(parsePdfTextPages('Первая\f\fТретья\f'), [
    { page: 1, text: 'Первая' },
    { page: 2, text: '' },
    { page: 3, text: 'Третья' },
  ]);
});

test('collects OCR review data only for PDF pages without a text layer', async () => {
  const calls = [];
  const extracted = await extractPdfDocument('/tmp/source.pdf', {
    ocr: true,
    runner: async (command, args) => {
      calls.push([command, ...args]);
      return fakeRunner(command, args);
    },
  });
  assert.equal(extracted.sections.length, 2);
  assert.deepEqual(extracted.sections.map((section) => section.assetAnchor.page), [1, 3]);
  assert.equal(extracted.ocrPages.length, 1);
  assert.equal(extracted.ocrPages[0].page, 2);
  assert.equal(extracted.ocrPages[0].recognition.text, 'Распознанная страница.');
  assert.equal(extracted.ocrPages[0].recognition.lowConfidenceWords, 1);
  assert.equal(calls.filter(([command]) => command === 'tesseract').length, 1);
  assert.equal(extracted.extractor, 'pdftotext+tesseract-tsv');
  assert.match(extracted.warnings[0], /обязательной проверки/u);
});

test('parses DOCX headings and keeps paragraph anchors', () => {
  const extracted = parseDocxDocumentXml(DOCX_XML, 'source.docx');
  assert.equal(extracted.title, 'Рабочий документ');
  assert.deepEqual(extracted.sections.map((section) => section.title), ['Первый раздел', 'Подраздел']);
  assert.match(extracted.sections[0].text, /Второй абзац & данные/u);
  assert.deepEqual(extracted.sections[0].provenance, {
    kind: 'docx-paragraphs',
    paragraphStart: 3,
    paragraphEnd: 4,
  });
});

test('prepares text-layer PDF and DOCX content as a valid pack without OCR', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'l-note-documents-'));
  const input = path.join(root, 'input');
  const output = path.join(root, 'prepared');
  await import('node:fs/promises').then(({ mkdir }) => mkdir(input, { recursive: true }));
  await writeFile(path.join(input, 'guide.pdf'), 'fake-pdf');
  await writeFile(path.join(input, 'notes.docx'), 'fake-docx');
  try {
    const result = await prepareDocumentDirectory({
      inputPath: input,
      outputPath: output,
      id: 'example.prepared-documents',
      title: 'Prepared documents',
      ocr: false,
      runner: fakeRunner,
      generatedAt: '2026-08-03T12:00:00.000Z',
    });
    assert.equal(result.files, 2);
    assert.equal(result.sections, 4);
    assert.equal(result.ocrReview, null);

    const pack = await buildPack(output);
    assert.equal(validatePack(pack).valid, true);
    assert.equal(pack.documents.length, 2);
    const pdf = pack.documents.find((document) => document.tags.includes('pdf'));
    const docx = pack.documents.find((document) => document.tags.includes('docx'));
    assert.equal(pdf.asset.mimeType, 'application/pdf');
    assert.deepEqual(pdf.sections.map((section) => section.assetAnchor.page), [1, 3]);
    assert.equal(docx.sections[0].provenance.paragraphStart, 3);
    assert.equal(await readFile(path.join(output, 'assets', 'guide.pdf'), 'utf8'), 'fake-pdf');
    assert.equal(await readFile(path.join(output, 'assets', 'notes.docx'), 'utf8'), 'fake-docx');
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('CLI parses OCR review and preparation options', () => {
  const args = prepareArguments([
    './sources',
    '--output', './prepared',
    '--id', 'example.documents',
    '--ocr',
    '--ocr-language', 'rus+eng',
    '--ocr-review-in', './review.json',
    '--ocr-review-out', './prepared/ocr-review.json',
    '--ocr-review-html', './prepared/ocr-review.html',
    '--max-section-chars', '4000',
  ]);
  assert.equal(args.input, './sources');
  assert.equal(args.ocr, true);
  assert.equal(args.ocrLanguage, 'rus+eng');
  assert.equal(args.ocrReviewIn, './review.json');
  assert.equal(args.ocrReviewOut, './prepared/ocr-review.json');
  assert.equal(args.ocrReviewHtml, './prepared/ocr-review.html');
  assert.equal(args.maxSectionChars, '4000');
});
