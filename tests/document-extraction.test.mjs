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

function fakeRunner(command, args) {
  if (command === 'pdftotext') {
    return Promise.resolve({
      stdout: Buffer.from('Текст первой страницы.\f\fТекст третьей страницы.\f'),
      stderr: '',
    });
  }
  if (command === 'pdftoppm') return Promise.resolve({ stdout: Buffer.alloc(0), stderr: '' });
  if (command === 'tesseract') {
    return Promise.resolve({ stdout: Buffer.from('Распознанная вторая страница.'), stderr: '' });
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

test('uses OCR only for PDF pages without a text layer', async () => {
  const calls = [];
  const extracted = await extractPdfDocument('/tmp/source.pdf', {
    ocr: true,
    runner: async (command, args) => {
      calls.push([command, ...args]);
      return fakeRunner(command, args);
    },
  });
  assert.equal(extracted.sections.length, 3);
  assert.deepEqual(extracted.sections.map((section) => section.assetAnchor.page), [1, 2, 3]);
  assert.match(extracted.sections[1].text, /Распознанная/u);
  assert.equal(calls.filter(([command]) => command === 'tesseract').length, 1);
  assert.equal(extracted.extractor, 'pdftotext+tesseract');
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

test('prepares an authoring directory that compiles into a valid pack', async () => {
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
      ocr: true,
      runner: fakeRunner,
      generatedAt: '2026-08-03T12:00:00.000Z',
    });
    assert.equal(result.files, 2);
    assert.equal(result.sections, 5);

    const pack = await buildPack(output);
    assert.equal(validatePack(pack).valid, true);
    assert.equal(pack.documents.length, 2);
    const pdf = pack.documents.find((document) => document.tags.includes('pdf'));
    const docx = pack.documents.find((document) => document.tags.includes('docx'));
    assert.equal(pdf.asset.mimeType, 'application/pdf');
    assert.equal(pdf.sections[1].assetAnchor.page, 2);
    assert.equal(docx.sections[0].provenance.paragraphStart, 3);
    assert.equal(await readFile(path.join(output, 'assets', 'guide.pdf'), 'utf8'), 'fake-pdf');
    assert.equal(await readFile(path.join(output, 'assets', 'notes.docx'), 'utf8'), 'fake-docx');
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('CLI parses OCR and preparation options', () => {
  const args = prepareArguments([
    './sources',
    '--output', './prepared',
    '--id', 'example.documents',
    '--ocr',
    '--ocr-language', 'rus+eng',
    '--max-section-chars', '4000',
  ]);
  assert.equal(args.input, './sources');
  assert.equal(args.ocr, true);
  assert.equal(args.ocrLanguage, 'rus+eng');
  assert.equal(args.maxSectionChars, '4000');
});
