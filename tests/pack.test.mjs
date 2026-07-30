import test from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import {
  expandQuery,
  flattenPack,
  validateGroundedAnswer,
  validatePack,
} from '../src/core.js';

const execFileAsync = promisify(execFile);
const catalog = JSON.parse(
  await readFile(new URL('../packs/catalog.json', import.meta.url), 'utf8'),
);
const packs = await Promise.all(
  catalog.packs.map(async (entry) => {
    const raw = await readFile(
      new URL(`../packs/${entry.url.replace('./', '')}`, import.meta.url),
    );
    return {
      entry,
      sizeBytes: raw.byteLength,
      pack: JSON.parse(raw.toString('utf8')),
    };
  }),
);

test('catalog exposes four independently installable MiniMed packs', () => {
  assert.equal(packs.length, 4);
  assert.equal(new Set(packs.map(({ pack }) => pack.manifest.id)).size, 4);
  assert.ok(packs.every(({ entry, pack }) => entry.id === pack.manifest.id));
});

test('catalog byte sizes match the downloadable files', () => {
  for (const { entry, sizeBytes } of packs) {
    assert.equal(entry.sizeBytes, sizeBytes, entry.id);
  }
});

test('all demo packs are structurally valid', () => {
  const stats = packs.map(({ pack }) => validatePack(pack));
  assert.equal(stats.reduce((sum, item) => sum + item.documents, 0), 4);
  assert.equal(stats.reduce((sum, item) => sum + item.chunks, 0), 25);
  assert.equal(stats.reduce((sum, item) => sum + item.relations, 0), 6);
});

test('packs flatten into searchable source-linked chunks', () => {
  const chunks = packs.flatMap(({ pack }) => flattenPack(pack));
  assert.ok(chunks.some((chunk) => chunk.chunkId === 'pneumonia.treatment.1'));
  assert.ok(chunks.every((chunk) => chunk.source?.url));
});

test('abbreviation expansion is deterministic', () => {
  const utiPack = packs.find(({ pack }) => pack.manifest.id === 'demo.minimed.uti.ru').pack;
  const output = expandQuery(
    'ИМП температура без очага ОАМ',
    utiPack.glossary,
    utiPack.entities,
  );
  assert.match(output.expanded, /инфекция мочевых путей/u);
  assert.match(output.expanded, /общий анализ мочи/u);
});

test('grounded answer rejects invented citations and uncited prose', () => {
  assert.equal(validateGroundedAnswer('Положение подтверждается. [E1]', ['E1']).valid, true);
  assert.equal(validateGroundedAnswer('Положение подтверждается. [E9]', ['E1']).valid, false);
  assert.equal(validateGroundedAnswer('Положение без ссылки.', ['E1']).valid, false);
});

test('pack compiler builds deterministic Markdown packs without a model', async () => {
  const root = await mkdtemp(join(tmpdir(), 'l-note-pack-'));
  try {
    await mkdir(join(root, 'documents'));
    await writeFile(
      join(root, 'manifest.json'),
      JSON.stringify({ id: 'test.local.pack', title: 'Test pack', version: '1.0.0' }),
    );
    await writeFile(
      join(root, 'documents', 'handbook.md'),
      '# Handbook\n\n## Tests\n\nОбщий анализ мочи (ОАМ) используется как пример сокращения.\n',
    );
    const output = join(root, 'pack.json');
    await execFileAsync(process.execPath, [
      new URL('../tools/build-pack.mjs', import.meta.url).pathname,
      root,
      output,
    ]);
    const pack = JSON.parse(await readFile(output, 'utf8'));
    assert.equal(validatePack(pack).documents, 1);
    assert.ok(pack.glossary.some((entry) => entry.term === 'ОАМ'));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
