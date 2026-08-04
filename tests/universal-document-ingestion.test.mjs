import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { validatePack } from '../src/packs.js';
import { buildPack } from '../tools/build-pack.mjs';
import {
  loadAnydoc,
  tryExtractAnydocDocument,
} from '../tools/lib/anydoc-extraction.mjs';
import {
  renderAnydocBlocks,
  sectionsFromAnydoc,
} from '../tools/lib/anydoc-markup.mjs';
import { prepareUniversalDocumentDirectory } from '../tools/lib/universal-document-preparation.mjs';
import { argumentsFrom as prepareArguments } from '../tools/prepare-documents.mjs';

function anydocModel() {
  return {
    blocks: [
      { kind: 'heading', level: 1, content: [{ kind: 'text', text: 'Универсальный документ', style: {} }] },
      { kind: 'heading', level: 2, content: [{ kind: 'text', text: 'Основные данные', style: {} }] },
      {
        kind: 'paragraph',
        content: [
          { kind: 'text', text: 'Важный', style: { bold: true } },
          { kind: 'text', text: ' текст и ', style: {} },
          { kind: 'image', alt: 'Схема', source: { kind: 'asset', assetId: 0 } },
          { kind: 'noteRef', noteId: 'note-1' },
        ],
      },
      {
        kind: 'list',
        list: {
          marker: 'decimal',
          start: 3,
          items: [{
            checked: true,
            blocks: [{ kind: 'paragraph', content: [{ kind: 'text', text: 'Проверенный пункт', style: {} }] }],
          }],
        },
      },
      {
        kind: 'table',
        table: {
          headerRows: 1,
          kind: 'data',
          grid: [
            [
              { kind: 'origin', cell: { blocks: [{ kind: 'paragraph', content: [{ kind: 'text', text: 'Параметр', style: {} }] }] } },
              { kind: 'origin', cell: { blocks: [{ kind: 'paragraph', content: [{ kind: 'text', text: 'Значение', style: {} }] }] } },
            ],
            [
              { kind: 'origin', cell: { blocks: [{ kind: 'paragraph', content: [{ kind: 'text', text: 'Доза', style: {} }] }] } },
              { kind: 'origin', cell: { blocks: [{ kind: 'paragraph', content: [{ kind: 'text', text: '5 мг', style: {} }] }] } },
            ],
          ],
        },
      },
    ],
    notes: [{
      id: 'note-1',
      kind: 'footnote',
      blocks: [{ kind: 'paragraph', content: [{ kind: 'text', text: 'Текст сноски.', style: {} }] }],
    }],
    assets: [{
      id: 0,
      mediaType: 'image/png',
      originPart: 'word/media/image1.png',
      data: Buffer.from('embedded-image'),
    }],
  };
}

function fakeAnydocModule() {
  return {
    formatFromBytes(bytes) {
      return Buffer.from(bytes).toString('utf8') === 'fake-docx' ? 'docx' : null;
    },
    formatFromPath(filename) {
      return String(filename).toLowerCase().endsWith('.docx') ? 'docx' : null;
    },
    async toDocument(_bytes, format) {
      if (format !== 'docx') throw new Error('unsupported test container');
      return anydocModel();
    },
  };
}

test('renders the anydoc model as structured source-aware Markdown', () => {
  const model = anydocModel();
  const rendered = renderAnydocBlocks(model.blocks);
  assert.match(rendered, /\*\*Важный\*\*/u);
  assert.match(rendered, /3\. \[x\] Проверенный пункт/u);
  assert.match(rendered, /\| Параметр \| Значение \|/u);
  assert.match(rendered, /\| Доза \| 5 мг \|/u);

  const normalized = sectionsFromAnydoc(model, 'source.docx');
  assert.equal(normalized.title, 'Универсальный документ');
  assert.deepEqual(normalized.sections.map((section) => section.title), [
    'Основные данные',
    'Сноски и примечания',
  ]);
  assert.deepEqual(normalized.sections[0].provenance, {
    kind: 'anydoc-blocks',
    blockStart: 3,
    blockEnd: 5,
  });
  assert.match(normalized.sections[1].text, /Текст сноски/u);
});

test('loads anydoc optionally and reports a missing native package without failing auto mode', async () => {
  const missing = new Error("Cannot find package '@firecrawl/anydoc'");
  missing.code = 'ERR_MODULE_NOT_FOUND';
  const loaded = await loadAnydoc({
    mode: 'auto',
    moduleLoader: async () => { throw missing; },
  });
  assert.equal(loaded.module, null);
  assert.match(loaded.warning, /npm install/u);

  await assert.rejects(loadAnydoc({
    mode: 'require',
    moduleLoader: async () => { throw missing; },
  }), /Cannot find package/u);
});

test('normalizes anydoc embedded assets and detects mislabeled office bytes', async () => {
  const options = {
    mode: 'require',
    moduleLoader: async () => fakeAnydocModule(),
    readFileFn: async () => Buffer.from('fake-docx'),
  };
  const result = await tryExtractAnydocDocument('/virtual/source.docx', options);
  const mislabeled = await tryExtractAnydocDocument('/virtual/source.bin', options);
  assert.equal(result.status, 'extracted');
  assert.equal(mislabeled.status, 'extracted');
  assert.equal(result.extracted.detectedFormat, 'docx');
  assert.equal(mislabeled.extracted.detectedFormat, 'docx');
  assert.equal(result.extracted.embeddedAssets[0].originPart, 'word/media/image1.png');
  assert.equal(result.extracted.embeddedAssets[0].data.toString(), 'embedded-image');
});

test('prepares structured, text and unknown binary files in one valid pack', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'l-note-universal-'));
  const input = path.join(root, 'input');
  const output = path.join(root, 'prepared');
  await mkdir(input, { recursive: true });
  await writeFile(path.join(input, 'report.docx'), 'fake-docx');
  await writeFile(path.join(input, 'notes.md'), '# Личные данные\n\n## Наблюдение\n\nТекст заметки.');
  await writeFile(path.join(input, 'weights.bin'), Buffer.from([0, 1, 2, 3, 4, 5]));
  try {
    const result = await prepareUniversalDocumentDirectory({
      inputPath: input,
      outputPath: output,
      id: 'example.universal-library',
      title: 'Universal library',
      anydocMode: 'require',
      anydocModuleLoader: async () => fakeAnydocModule(),
      generatedAt: '2026-08-04T16:00:00.000Z',
    });
    assert.equal(result.files, 3);
    assert.equal(result.documents, 3);
    assert.equal(result.parserStats.anydoc, 1);
    assert.equal(result.parserStats.text, 1);
    assert.equal(result.parserStats.attachment, 1);

    const pack = await buildPack(output);
    assert.equal(validatePack(pack).valid, true);
    assert.equal(pack.documents.length, 3);
    const office = pack.documents.find((document) => document.tags.includes('anydoc'));
    const text = pack.documents.find((document) => document.tags.includes('text'));
    const attachment = pack.documents.find((document) => document.tags.includes('attachment-only'));
    assert.ok(office);
    assert.ok(text);
    assert.ok(attachment);
    assert.equal(office.source.extractor, 'anydoc@0.1.2');
    assert.equal(office.source.embeddedAssets.length, 1);
    assert.equal(office.asset.mimeType, office.source.mimeType);
    assert.equal(text.asset.mimeType, 'text/markdown');
    assert.equal(attachment.asset.url, attachment.source.path);
    assert.match(office.sections[0].text, /\.\/assets\/report-docx-embedded-0\.png/u);
    assert.match(text.sections[0].text, /Текст заметки/u);
    assert.equal(attachment.sections[0].title, 'Файл для ручной разметки');
    assert.match(attachment.sections[0].text, /SHA-256/u);
    const embeddedUrl = office.source.embeddedAssets[0].url.replace('./assets/', '');
    assert.equal(await readFile(path.join(output, 'assets', embeddedUrl), 'utf8'), 'embedded-image');
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('keeps colliding paths and repeated headings as distinct pack resources', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'l-note-universal-ids-'));
  const input = path.join(root, 'input');
  const output = path.join(root, 'prepared');
  await mkdir(path.join(input, 'a'), { recursive: true });
  await writeFile(path.join(input, 'a', 'b.md'), '# Nested\n\n## Repeat\n\nOne.\n\n## Repeat\n\nTwo.');
  await writeFile(path.join(input, 'a-b.md'), '# Flat\n\n## Content\n\nThree.');
  try {
    await prepareUniversalDocumentDirectory({
      inputPath: input,
      outputPath: output,
      id: 'example.collision-library',
      anydocMode: 'off',
      generatedAt: '2026-08-04T16:30:00.000Z',
    });
    const pack = await buildPack(output);
    assert.equal(validatePack(pack).valid, true);
    assert.equal(pack.documents.length, 2);
    assert.equal(new Set(pack.documents.map((document) => document.id)).size, 2);
    assert.equal((await readdir(path.join(output, 'documents'))).length, 2);
    const nested = pack.documents.find((document) => document.source.title === 'a/b.md');
    assert.ok(nested);
    assert.deepEqual(nested.sections.map((section) => section.id), ['repeat', 'repeat-2']);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('CLI parses universal ingestion controls', () => {
  const args = prepareArguments([
    './sources',
    '--output', './prepared',
    '--id', 'example.documents',
    '--anydoc', 'require',
    '--max-parser-bytes', '1048576',
  ]);
  assert.equal(args.anydoc, 'require');
  assert.equal(args.maxParserBytes, '1048576');
});
