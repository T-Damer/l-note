import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createAdaptiveSearchPort,
  estimateSearchCorpusBytes,
  shouldUseDiskSearch,
} from '../src/adapters/adaptive-search.js';

const record = {
  id: 'section:1',
  kind: 'section',
  title: 'Инфекция мочевых путей',
  documentTitle: 'ИМП у детей',
  body: 'Инфекция мочевых путей требует исследования мочи.',
  aliases: 'ИМП',
  entityNames: 'Инфекция мочевых путей',
  tags: 'педиатрия',
  authority: 'reference',
};

function fakeDiskFactory(log) {
  return () => ({
    async build(records) {
      log.push(['build', records.length]);
      return { recordCount: records.length, tokenCount: 8, storage: 'indexeddb', backend: 'test' };
    },
    async search(query, options) {
      log.push(['search', query, options]);
      return [{ ...record, score: 10, relevance: 100 }];
    },
    async suggest(query, limit) {
      log.push(['suggest', query, limit]);
      return ['инфекция'];
    },
    async stats() {
      return { recordCount: 1, tokenCount: 8, storage: 'indexeddb', backend: 'test' };
    },
    close() {
      log.push(['close']);
    },
  });
}

test('estimates corpus size and selects disk mode by record or byte threshold', () => {
  assert.ok(estimateSearchCorpusBytes([record]) > record.body.length);
  assert.equal(shouldUseDiskSearch([record], { recordThreshold: 1 }), true);
  assert.equal(shouldUseDiskSearch([record], { recordThreshold: 10, byteThreshold: 1 }), true);
  assert.equal(shouldUseDiskSearch([record], { forceDisk: false }), false);
});

test('keeps small corpora on synchronous MiniSearch or deterministic fallback', async () => {
  const port = createAdaptiveSearchPort([record], [], { forceDisk: false });
  assert.equal(port.async, false);
  assert.equal(port.retainsRecords, true);
  assert.equal((await port.ready).storage, 'memory');
  assert.equal(Array.isArray(port.search('инфекция')), true);
});

test('builds large corpora on disk and preserves query expansion', async () => {
  const log = [];
  const port = createAdaptiveSearchPort(
    [record],
    [{ name: 'Инфекция мочевых путей', aliases: ['ИМП'] }],
    {
      forceDisk: true,
      diskFactory: fakeDiskFactory(log),
      queryExpanders: [() => ['анализ мочи']],
    },
  );
  assert.equal(port.async, true);
  assert.equal(port.retainsRecords, false);
  await port.ready;
  const results = await port.search('ИМП', { limit: 5 });
  assert.match(log.find(([name]) => name === 'search')[1], /Инфекция мочевых путей/u);
  assert.match(log.find(([name]) => name === 'search')[1], /анализ мочи/u);
  assert.deepEqual(results[0].queryTerms, ['имп']);
  assert.deepEqual(await port.suggest('инф', 3), ['инфекция']);
  port.close();
  assert.deepEqual(log.at(-1), ['close']);
});
