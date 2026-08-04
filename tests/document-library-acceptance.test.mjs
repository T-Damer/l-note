import assert from 'node:assert/strict';
import {
  mkdtemp,
  readFile,
  readdir,
  rm,
  writeFile,
} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { validatePack } from '../src/packs.js';
import {
  pdfInspectorPages,
  pdfInspectorSections,
} from '../src/helpers/pdf-inspector-result.js';
import { buildPackFromBrowserFiles } from '../src/services/browser-pack-builder.js';
import { buildPack } from '../tools/build-pack.mjs';
import { inspectPdfFile } from '../tools/lib/pdf-inspector-node.mjs';
import { prepareFromArguments } from '../tools/prepare-documents.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const manifestPath = path.join(root, 'tests', 'fixtures', 'document-library', 'manifest.json');
const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));

function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function storedZip(entries) {
  const locals = [];
  const directory = [];
  let offset = 0;
  for (const [name, value] of entries) {
    const filename = Buffer.from(name, 'utf8');
    const data = Buffer.from(value, 'utf8');
    const checksum = crc32(data);
    const local = Buffer.alloc(30 + filename.length);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0x0800, 6);
    local.writeUInt16LE(0, 8);
    local.writeUInt32LE(checksum, 14);
    local.writeUInt32LE(data.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(filename.length, 26);
    filename.copy(local, 30);
    locals.push(local, data);

    const central = Buffer.alloc(46 + filename.length);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0x0800, 8);
    central.writeUInt16LE(0, 10);
    central.writeUInt32LE(checksum, 16);
    central.writeUInt32LE(data.length, 20);
    central.writeUInt32LE(data.length, 24);
    central.writeUInt16LE(filename.length, 28);
    central.writeUInt32LE(offset, 42);
    filename.copy(central, 46);
    directory.push(central);
    offset += local.length + data.length;
  }
  const directoryBytes = Buffer.concat(directory);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(directoryBytes.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, directoryBytes, end]);
}

function minimalDocxXml() {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>
    <w:p><w:pPr><w:pStyle w:val="Title"/></w:pPr><w:r><w:t>Локальный DOCX</w:t></w:r></w:p>
    <w:p><w:pPr><w:pStyle w:val="Heading1"/></w:pPr><w:r><w:t>Первый раздел</w:t></w:r></w:p>
    <w:p><w:r><w:t>Первый абзац с числом 42.</w:t></w:r></w:p>
    <w:p><w:pPr><w:pStyle w:val="Heading1"/></w:pPr><w:r><w:t>Второй раздел</w:t></w:r></w:p>
    <w:p><w:r><w:t>Второй абзац сохраняет provenance.</w:t></w:r></w:p>
  </w:body>
</w:document>`;
}

function browserFile(filename, bytes) {
  return {
    name: path.basename(filename),
    size: bytes.byteLength,
    async text() {
      return bytes.toString('utf8');
    },
    async arrayBuffer() {
      return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
    },
  };
}

function bodyText(pack) {
  return pack.documents.flatMap((document) => document.sections.map((section) => section.text)).join('\n\n');
}

function reopened(pack) {
  const value = JSON.parse(JSON.stringify(pack));
  const validation = validatePack(value);
  assert.equal(validation.valid, true, validation.errors.join('\n'));
  return value;
}

function caseByFormat(format) {
  const value = manifest.cases.find((item) => item.format === format && item.status === 'active');
  assert.ok(value, `Missing active ${format} acceptance case`);
  return value;
}

test('acceptance manifest is versioned and leaves uncovered categories explicit', () => {
  assert.equal(manifest.schemaVersion, 1);
  assert.equal(manifest.kind, 'lnote.document-acceptance');
  assert.match(manifest.corpusVersion, /^\d{4}\.\d{2}\.\d{2}\.\d+$/u);
  assert.equal(new Set(manifest.cases.map((item) => item.id)).size, manifest.cases.length);
  const activeIds = new Set(manifest.cases.filter((item) => item.status === 'active').map((item) => item.id));
  for (const coverage of manifest.coverage.filter((item) => item.status === 'active')) {
    assert.ok(activeIds.has(coverage.caseId), `Coverage ${coverage.category} references a missing case`);
  }
  for (const category of ['mixed-pdf', 'scanned-pdf-reviewed-ocr', 'multi-column-pdf']) {
    assert.ok(manifest.coverage.some((item) => item.category === category && item.status === 'active'));
  }
  assert.ok(manifest.coverage.some((item) => item.category === 'image-heavy-pdf' && item.status === 'pending'));
  assert.ok(manifest.coverage.some((item) => item.category === 'long-document' && item.status === 'pending'));
});

for (const format of ['markdown', 'txt']) {
  test(`browser preparation accepts the ${format} corpus case`, async () => {
    const fixture = caseByFormat(format);
    const filename = path.join(root, fixture.source);
    const bytes = await readFile(filename);
    const pack = await buildPackFromBrowserFiles({
      files: [browserFile(filename, bytes)],
      id: `acceptance.${fixture.id}`,
      title: `Acceptance ${fixture.id}`,
      version: manifest.corpusVersion,
    });
    const restored = reopened(pack);
    assert.equal(restored.documents.length, 1);
    assert.ok(restored.documents[0].sections.length >= fixture.expect.minSections);
    if (fixture.expect.title) assert.equal(restored.documents[0].title, fixture.expect.title);
    const content = bodyText(restored);
    for (const expected of fixture.expect.contains) assert.match(content, new RegExp(expected.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&'), 'u'));
  });
}

test('strong-device preparation accepts a real minimal DOCX ZIP', async (t) => {
  const fixture = caseByFormat('docx');
  const directory = await mkdtemp(path.join(os.tmpdir(), 'lnote-docx-acceptance-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const source = path.join(directory, 'minimal-headings.docx');
  const output = path.join(directory, 'prepared');
  await writeFile(source, storedZip([['word/document.xml', minimalDocxXml()]]));

  const result = await prepareFromArguments({
    input: source,
    output,
    id: `acceptance.${fixture.id}`,
    title: fixture.expect.title,
  }, { generatedAt: '2026-08-04T10:00:00.000Z', onProgress() {} });
  assert.equal(result.documents, 1);
  const pack = reopened(await buildPack(output));
  const document = pack.documents[0];
  assert.equal(document.title, fixture.expect.title);
  assert.deepEqual(document.sections.map((section) => section.title), fixture.expect.sectionTitles);
  assert.deepEqual(document.sections.map((section) => [
    section.provenance.paragraphStart,
    section.provenance.paragraphEnd,
  ]), fixture.expect.paragraphAnchors);
  assert.equal(document.source.extractor, 'docx-xml');
  assert.ok((await readdir(path.join(output, 'assets'))).some((name) => name.endsWith('.docx')));
});

test('bundled PDF uses the real WASM parser and excludes routed OCR pages from sections', async () => {
  const fixture = caseByFormat('pdf');
  const filename = path.join(root, fixture.source);
  const result = await inspectPdfFile(filename);
  assert.equal(result.parserVersion, fixture.expect.parserVersion);
  assert.ok(result.pageCount >= fixture.expect.minPages);
  assert.ok(result.markdown.length >= fixture.expect.minMarkdownChars);
  assert.ok(Array.isArray(result.pagesNeedingOcr));

  const pages = pdfInspectorPages(result);
  const sections = pdfInspectorSections(result);
  const routedPages = new Set(result.pagesNeedingOcr.map(Number));
  assert.equal(pages.length, result.pageCount);
  assert.ok(pages.filter((page) => page.needsOcr).every((page) => routedPages.has(page.page)));
  assert.ok(sections.every((section) => !routedPages.has(section.assetAnchor.page)));
  if (fixture.expect.requiresExplicitOcrRouting && routedPages.size) {
    assert.ok(pages.some((page) => page.needsOcr));
  }
});
