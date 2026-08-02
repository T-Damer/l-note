import assert from 'node:assert/strict';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { validatePack } from '../src/packs.js';
import { buildPackFromPath, mergeAiSection, parseMarkdown } from '../tools/lib/pack-builder.mjs';

test('Markdown parser keeps headings and text', () => {
  const parsed = parseMarkdown('# Справочник\n\nВведение.\n\n## Термины\n\nОбщий анализ крови (ОАК) используют как исследование.', 'sample.md');
  assert.equal(parsed.title, 'Справочник');
  assert.equal(parsed.sections.length, 2);
  assert.equal(parsed.sections[1].title, 'Термины');
});

test('deterministic builder creates a valid portable pack and discovers abbreviations', async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'l-note-builder-'));
  await writeFile(path.join(directory, 'sample.md'), '# Анализы\n\n## Исследование\n\nОбщий анализ крови (ОАК) помогает оценить состояние.');
  const pack = await buildPackFromPath({ inputPath: directory, id: 'test.pack', title: 'Test pack' });
  assert.deepEqual(validatePack(pack), { valid: true, errors: [] });
  assert.ok(pack.entities.some((entity) => entity.aliases.includes('ОАК')));
  assert.ok(pack.documents[0].sections[0].entityIds.length > 0);
});

test('AI merge accepts only exact evidence quotes', async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'l-note-ai-'));
  await writeFile(path.join(directory, 'sample.txt'), 'Фактология\nТочный факт находится здесь.');
  const pack = await buildPackFromPath({ inputPath: directory, id: 'test.ai', title: 'AI test' });
  const document = pack.documents[0];
  const section = document.sections[0];
  mergeAiSection(pack, document, section, {
    entities: [{ name: 'Факт', type: 'concept', aliases: [] }],
    claims: [
      { text: 'Поддержанный факт', subject: 'Факт', quote: 'Точный факт находится здесь.' },
      { text: 'Выдуманный факт', subject: 'Факт', quote: 'Такой строки нет.' },
    ],
  });
  assert.equal(pack.claims.length, 1);
  assert.equal(pack.claims[0].text, 'Поддержанный факт');
});
