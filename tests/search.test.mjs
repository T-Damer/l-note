import assert from 'node:assert/strict';
import test from 'node:test';
import { createSearchEngine, damerauLevenshtein, normalizeText } from '../src/search.js';

const records = [
  {
    id: 'section:bronchiolitis', kind: 'section', title: 'Клиническая картина', documentTitle: 'Острый бронхиолит у детей',
    body: 'Характерны кашель, одышка и свистящие хрипы.', aliases: 'бронхиолит', entityNames: 'Острый бронхиолит',
    tags: 'педиатрия дыхание', authority: 'reference', entityIds: [], claimIds: [],
  },
  {
    id: 'section:uti', kind: 'section', title: 'Диагностика', documentTitle: 'Инфекция мочевых путей',
    body: 'Диагностический поиск включает общий анализ мочи и посев.', aliases: 'ИМП инфекция мочевыводящих путей',
    entityNames: 'Инфекция мочевых путей', tags: 'нефрология', authority: 'reference', entityIds: [], claimIds: [],
  },
];
const entities = [{ id: 'uti', name: 'Инфекция мочевых путей', aliases: ['ИМП'] }];

test('normalizes Russian text and ё', () => {
  assert.equal(normalizeText('  Всё—ХОРОШО  '), 'все-хорошо');
});

test('Damerau-Levenshtein handles transposition', () => {
  assert.equal(damerauLevenshtein('бронхиалит', 'бронхиолит'), 1);
});

test('fallback fuzzy search finds a typo', () => {
  const engine = createSearchEngine(records, entities);
  const result = engine.search('бронхиалит');
  assert.equal(result[0]?.id, 'section:bronchiolitis');
});

test('entity alias expands an abbreviation', () => {
  const engine = createSearchEngine(records, entities);
  const result = engine.search('ИМП анализ');
  assert.equal(result[0]?.id, 'section:uti');
});
