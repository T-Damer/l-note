import assert from 'node:assert/strict';
import test from 'node:test';
import { expandMiniMedQuery } from '../src/domain-plugins/minimed.js';
import {
  createSearchEngine,
  damerauLevenshtein,
  normalizeRelevance,
  normalizeText,
} from '../src/search.js';

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

test('normalizes relevance into an integer percentage', () => {
  assert.equal(normalizeRelevance(250, 250), 100);
  assert.equal(Number.isInteger(normalizeRelevance(50, 250)), true);
  assert.equal(normalizeRelevance(0, 250), 0);
  assert.equal(normalizeRelevance(500, 250), 100);
});

test('MiniMed plugin expands infant wheeze into respiratory concepts', () => {
  assert.deepEqual(expandMiniMedQuery('грудничок свистит при дыхании'), [
    'свистящие хрипы',
    'бронхиолит',
    'бронхообструкция',
    'дифференциальная диагностика',
  ]);
});

test('infant wheeze ranks respiratory evidence ahead of an unrelated medication registry record', () => {
  const scenarioRecords = [
    {
      id: 'bronchiolitis', kind: 'section', title: 'Острый бронхиолит', documentTitle: 'Бронхиолит у детей',
      body: 'У грудных детей возможны свистящие хрипы и затруднение дыхания.', aliases: 'бронхиолит свистящие хрипы',
      entityNames: 'Острый бронхиолит', tags: 'педиатрия дыхательная система', authority: 'reference', entityIds: [], claimIds: [],
    },
    {
      id: 'obstruction', kind: 'section', title: 'Бронхообструкция', documentTitle: 'Синдром бронхиальной обструкции',
      body: 'Свистящее дыхание может соответствовать бронхообструкции.', aliases: 'бронхообструкция свистящее дыхание',
      entityNames: 'Бронхообструкция', tags: 'педиатрия дыхательная система', authority: 'reference', entityIds: [], claimIds: [],
    },
    {
      id: 'differential', kind: 'section', title: 'Дифференциальная диагностика', documentTitle: 'Свистящее дыхание у младенца',
      body: 'Дифференциальная диагностика включает бронхиолит, обструкцию и инородное тело.',
      aliases: 'дифференциальная диагностика', entityNames: 'Свистящее дыхание', tags: 'диагностика',
      authority: 'reference', entityIds: [], claimIds: [],
    },
    {
      id: 'medication', kind: 'section', title: 'Регистрационная запись', documentTitle: 'Амоксициллин + клавулановая кислота',
      body: 'Официальная регистрационная запись лекарственного препарата.', aliases: 'амоксициллин клавуланат',
      entityNames: 'Амоксициллин', tags: 'лекарственный реестр', authority: 'reference', entityIds: [], claimIds: [],
    },
  ];
  const engine = createSearchEngine(scenarioRecords, [], { queryExpanders: [expandMiniMedQuery] });
  const result = engine.search('грудничок свистит при дыхании', { limit: 4 });
  assert.deepEqual(result.slice(0, 3).map((item) => item.id), [
    'obstruction',
    'bronchiolitis',
    'differential',
  ]);
  assert.equal(result.findIndex((item) => item.id === 'medication') > 2 || !result.some((item) => item.id === 'medication'), true);
  assert.equal(result.every((item) => item.relevance >= 0 && item.relevance <= 100), true);
});
