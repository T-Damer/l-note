import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createKnowledgeIndex,
  damerauLevenshtein,
  expandQuery,
  searchKnowledge,
  suggestQuery
} from '../src/search-engine.js';

const snapshot = {
  packs: [
    {
      id: 'test.pack',
      version: '1',
      title: 'Тестовый пакет',
      description: 'Тест',
      tags: []
    }
  ],
  records: [
    {
      key: 'test.pack::record::uti',
      packId: 'test.pack',
      packVersion: '1',
      packTitle: 'Тестовый пакет',
      id: 'uti',
      documentId: 'doc.uti',
      kind: 'reference',
      title: 'Инфекция мочевых путей',
      section: 'Диагностика',
      body: 'При лихорадке без очага рассматривают общий анализ мочи.',
      aliases: [],
      tags: ['педиатрия'],
      entityIds: ['condition.uti', 'investigation.urinalysis'],
      claims: [],
      source: { authority: 'official', label: 'Источник', url: null, locator: null },
      updatedAt: null,
      metadata: {}
    }
  ],
  entities: [
    {
      key: 'test.pack::entity::condition.uti',
      packId: 'test.pack',
      packVersion: '1',
      packTitle: 'Тестовый пакет',
      id: 'condition.uti',
      type: 'condition',
      name: 'Инфекция мочевых путей',
      aliases: ['ИМП', 'ИМВП'],
      description: 'Инфекция мочевой системы.',
      tags: [],
      metadata: {}
    },
    {
      key: 'test.pack::entity::investigation.urinalysis',
      packId: 'test.pack',
      packVersion: '1',
      packTitle: 'Тестовый пакет',
      id: 'investigation.urinalysis',
      type: 'investigation',
      name: 'Общий анализ мочи',
      aliases: ['ОАМ'],
      description: 'Лабораторное исследование.',
      tags: [],
      metadata: {}
    }
  ],
  relations: [
    {
      key: 'test.pack::relation::uti-oam',
      packId: 'test.pack',
      packVersion: '1',
      packTitle: 'Тестовый пакет',
      id: 'uti-oam',
      from: 'condition.uti',
      predicate: 'diagnosed-with',
      to: 'investigation.urinalysis',
      recordId: 'uti',
      description: 'ОАМ используется в диагностике.',
      weight: 1,
      metadata: {}
    }
  ],
  notes: [
    {
      id: 'note.test',
      title: 'Личное наблюдение',
      body: 'При конкретном сценарии я повторно проверяю способ забора образца.',
      tags: ['личное'],
      entityIds: ['condition.uti'],
      relationType: 'refines',
      linkedRecordKey: 'test.pack::record::uti',
      createdAt: '2026-07-30T00:00:00Z',
      updatedAt: '2026-07-30T00:00:00Z'
    }
  ]
};

test('Damerau-Levenshtein handles a transposition', () => {
  assert.equal(damerauLevenshtein('сатруация', 'сатурация', 2), 1);
});

test('query suggestion corrects a known term', () => {
  assert.equal(suggestQuery('сатруация', ['сатурация', 'пневмония']), 'сатурация');
});

test('aliases expand abbreviations before retrieval', () => {
  assert.equal(
    expandQuery('что значит ИМП', [{ alias: 'имп', canonical: 'Инфекция мочевых путей' }]),
    'что значит ИМП Инфекция мочевых путей'
  );
});

test('knowledge index separates reference and personal scopes', async () => {
  const index = await createKnowledgeIndex(snapshot);
  const reference = await searchKnowledge(index, 'ИМП анализ мочи', { scope: 'reference' });
  assert.ok(reference.hits.some((hit) => hit.type === 'reference'));
  assert.ok(reference.hits.every((hit) => hit.type !== 'personal'));

  const personal = await searchKnowledge(index, 'способ забора образца', { scope: 'personal' });
  assert.equal(personal.hits[0]?.type, 'personal');
});
