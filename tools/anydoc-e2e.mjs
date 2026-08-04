#!/usr/bin/env node
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { validatePack } from '../src/packs.js';
import { buildPack } from './build-pack.mjs';
import { prepareUniversalDocumentDirectory } from './lib/universal-document-preparation.mjs';

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
  const centralDirectory = [];
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
    centralDirectory.push(central);
    offset += local.length + data.length;
  }
  const directoryBytes = Buffer.concat(centralDirectory);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(directoryBytes.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, directoryBytes, end]);
}

function minimalDocx() {
  const contentTypes = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
</Types>`;
  const rootRelationships = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`;
  const document = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>
    <w:p><w:r><w:t>Локальный anydoc документ.</w:t></w:r></w:p>
    <w:tbl>
      <w:tr>
        <w:tc><w:p><w:r><w:t>Параметр</w:t></w:r></w:p></w:tc>
        <w:tc><w:p><w:r><w:t>Значение</w:t></w:r></w:p></w:tc>
      </w:tr>
      <w:tr>
        <w:tc><w:p><w:r><w:t>Доза</w:t></w:r></w:p></w:tc>
        <w:tc><w:p><w:r><w:t>5 мг</w:t></w:r></w:p></w:tc>
      </w:tr>
    </w:tbl>
  </w:body>
</w:document>`;
  return storedZip([
    ['[Content_Types].xml', contentTypes],
    ['_rels/.rels', rootRelationships],
    ['word/document.xml', document],
  ]);
}

function corpusText(pack) {
  return pack.documents
    .flatMap((document) => document.sections.map((section) => section.text))
    .join('\n\n');
}

const root = await mkdtemp(path.join(os.tmpdir(), 'l-note-anydoc-smoke-'));
try {
  const input = path.join(root, 'input');
  const output = path.join(root, 'prepared');
  await mkdir(input, { recursive: true });
  const docx = minimalDocx();
  await writeFile(path.join(input, 'native.docx'), docx);
  await writeFile(path.join(input, 'renamed.bin'), docx);
  await writeFile(path.join(input, 'registry.csv'), [
    'name,dose,unit',
    'Alpha,5,mg',
    'Beta,10,mg',
    '',
  ].join('\n'));

  const result = await prepareUniversalDocumentDirectory({
    inputPath: input,
    outputPath: output,
    id: 'smoke.anydoc-native',
    title: 'Native anydoc smoke',
    anydocMode: 'require',
    generatedAt: '2026-08-04T17:00:00.000Z',
  });
  assert.equal(result.files, 3);
  assert.equal(result.documents, 3);
  assert.equal(result.parserStats.anydoc, 3);

  const pack = await buildPack(output);
  const validation = validatePack(pack);
  assert.equal(validation.valid, true, validation.errors.join('\n'));
  assert.equal(pack.documents.length, 3);
  assert.ok(pack.documents.every((document) => document.source.extractor === 'anydoc@0.1.2'));
  const mislabeled = pack.documents.find((document) => document.source.title === 'renamed.bin');
  assert.equal(mislabeled?.source.format, 'docx');
  assert.equal(mislabeled?.source.mimeType, 'application/octet-stream');
  assert.equal(mislabeled?.asset.url, mislabeled?.source.path);
  const text = corpusText(pack);
  assert.match(text, /Локальный anydoc документ/u);
  assert.match(text, /Доза/u);
  assert.match(text, /5 мг/u);
  assert.match(text, /Alpha/u);
  assert.match(text, /Beta/u);
  assert.ok(pack.documents.every((document) => document.source.sha256?.length === 64));
  console.log(`anydoc native smoke passed: ${pack.documents.length} documents, ${pack.documents.flatMap((document) => document.sections).length} sections.`);
} finally {
  await rm(root, { recursive: true, force: true });
}
