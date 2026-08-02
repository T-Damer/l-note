import assert from 'node:assert/strict';
import test from 'node:test';

import {
  parseBrowserJson,
  parseBrowserMarkdown,
  proposedBrowserPackId,
} from '../src/helpers/pack-source-parser.js';
import { validatePack } from '../src/packs.js';
import {
  browserPackStats,
  buildPackFromBrowserFiles,
} from '../src/services/browser-pack-builder.js';

function sourceFile(name, text) {
  return {
    name,
    size: new TextEncoder().encode(text).byteLength,
    async text() {
      return text;
    },
  };
}

test('browser Markdown parser preserves headings and source text', () => {
  const parsed = parseBrowserMarkdown([
    '# Личная справка',
    '',
    '## Термины',
    'Инфекция мочевых путей (ИМП) требует отдельной оценки.',
    '',
    '## Практика',
    'Исходный текст остаётся внутри пакета.',
  ].join('\n'), 'notes.md');

  assert.equal(parsed.title, 'Личная справка');
  assert.equal(parsed.sections.length, 2);
  assert.equal(parsed.sections[0].title, 'Термины');
  assert.match(parsed.sections[0].text, /Инфекция мочевых путей/u);
});

test('browser JSON parser flattens ordinary data but preserves ready packs', () => {
  const data = parseBrowserJson('{"title":"Справочник","items":[{"name":"A"}]}', 'data.json');
  assert.equal(data.title, 'Справочник');
  assert.match(data.sections[0].text, /\$\.items\[0\]\.name: "A"/u);

  const ready = {
    schemaVersion: 1,
    id: 'user.ready',
    version: '1.0.0',
    title: 'Готовый пакет',
    description: 'Описание',
    language: 'ru',
    documents: [],
    entities: [],
    claims: [],
    relations: [],
  };
  assert.deepEqual(parseBrowserJson(JSON.stringify(ready), 'ready.json').existingPack, ready);
});

test('browser builder creates a valid installable pack and discovers abbreviations', async () => {
  const pack = await buildPackFromBrowserFiles({
    files: [
      sourceFile('respiratory.md', '# Дыхание\n\n## Термины\nБронхиальная астма (БА) сопровождается свистящим дыханием.'),
      sourceFile('table.json', '{"severity":"moderate","score":2}'),
    ],
    title: 'Моя клиническая справка',
    version: '2026.07.31',
    description: 'Локально собранный тестовый пакет.',
    language: 'ru',
  });

  const validation = validatePack(pack);
  assert.equal(validation.valid, true, validation.errors.join('\n'));
  assert.match(pack.id, /^user\.knowledge-[a-f0-9]{8}$/u);
  assert.equal(pack.documents.length, 2);
  assert.equal(pack.claims.length, 0);
  assert.equal(pack.relations.length, 0);
  assert.equal(pack.entities.length, 1);
  assert.equal(pack.entities[0].name, 'Бронхиальная астма');
  assert.deepEqual(pack.entities[0].aliases, ['БА']);
  assert.ok(pack.documents[0].sections[0].entityIds.includes(pack.entities[0].id));

  const stats = browserPackStats(pack);
  assert.equal(stats.documents, 2);
  assert.ok(stats.sections >= 2);
  assert.ok(stats.bytes > 0);
});

test('browser builder accepts a ready pack as a single selected JSON file', async () => {
  const ready = {
    schemaVersion: 1,
    id: 'user.ready',
    version: '1.0.0',
    title: 'Готовый пакет',
    description: 'Описание',
    language: 'ru',
    documents: [{
      id: 'doc.ready',
      title: 'Документ',
      sections: [{ id: 'content', title: 'Содержание', text: 'Текст', entityIds: [] }],
    }],
    entities: [],
    claims: [],
    relations: [],
  };
  const built = await buildPackFromBrowserFiles({
    files: [sourceFile('ready.json', JSON.stringify(ready))],
    title: 'Ignored for ready pack',
  });
  assert.deepEqual(built, ready);
});

test('suggested pack IDs stay URL and filename safe for Russian titles', () => {
  assert.match(proposedBrowserPackId('Моя справка'), /^user\.knowledge-[a-f0-9]{8}$/u);
  assert.equal(proposedBrowserPackId('My Knowledge'), 'user.my-knowledge');
});
