import assert from 'node:assert/strict';
import test from 'node:test';

import { detectEntitiesInText, entityTerms } from '../src/helpers/entity-terms.js';

const normalize = (value) => String(value ?? '')
  .normalize('NFKC')
  .toLocaleLowerCase('ru-RU')
  .replaceAll('ё', 'е');

test('orders canonical names and aliases from longest to shortest', () => {
  assert.deepEqual(
    entityTerms({ name: 'ИМП', aliases: ['Инфекция мочевых путей', 'мочевая инфекция'] }),
    ['Инфекция мочевых путей', 'мочевая инфекция', 'ИМП'],
  );
});

test('detects concepts by canonical name or alias and respects the limit', () => {
  const entities = [
    { id: 'bronchiolitis', name: 'Бронхиолит', aliases: ['свистящее дыхание'] },
    { id: 'pneumonia', name: 'Пневмония', aliases: [] },
    { id: 'uti', name: 'Инфекция мочевых путей', aliases: ['ИМП'] },
  ];

  assert.deepEqual(
    detectEntitiesInText({
      entities,
      text: 'Грудничок: свистящее дыхание; ИМП не описана.',
      normalizeText: normalize,
      limit: 2,
    }).map((entity) => entity.id),
    ['bronchiolitis', 'uti'],
  );
});

test('requires an explicit normalizer and does not mutate input', () => {
  const entities = [{ id: 'one', name: 'Первое', aliases: [] }];
  assert.throws(() => detectEntitiesInText({ entities, text: 'Первое' }), /normalization function/u);
  detectEntitiesInText({ entities, text: 'Первое', normalizeText: normalize });
  assert.deepEqual(entities, [{ id: 'one', name: 'Первое', aliases: [] }]);
});
