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

function fakeSearchFactory(log, { id = 'test', fail = false } = {}) {
  return () => ({
    kind: id,
    available: true,
    async build(records, options) {
      log.push(['build', id, records.length, options.fingerprint]);
      if (fail) throw new Error(`${id} failed`);
      return { recordCount: records.length, tokenCount: 8, storage: id, backend: id };
    },
    async search(query, options) {
      log.push(['search', id, query, options]);
      return [{ ...record, score: 10, relevance: 100 }];
    },
    async suggest(query, limit) {
      log.push(['suggest', id, query, limit]);
      return ['инфекция'];
    },
    async stats() {
      return { recordCount: 1, tokenCount: 8, storage: id, backend: id };
    },
    async close() {
      await Promise.resolve();
      log.push(['close', id]);
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

test('prefers SQLite FTS5 and preserves query expansion plus corpus fingerprint', async () => {
  const log = [];
  const port = createAdaptiveSearchPort(
    [record],
    [{ name: 'Инфекция мочевых путей', aliases: ['ИМП'] }],
    {
      forceDisk: true,
      corpusFingerprint: 'pack@1',
      sqliteFactory: fakeSearchFactory(log, { id: 'sqlite' }),
      diskFactory: fakeSearchFactory(log, { id: 'postings' }),
      queryExpanders: [() => ['анализ мочи']],
    },
  );
  assert.equal(port.async, true);
  assert.equal(port.retainsRecords, false);
  assert.equal((await port.ready).backend, 'sqlite');
  const results = await port.search('ИМП', { limit: 5 });
  const searchCall = log.find(([name]) => name === 'search');
  assert.equal(searchCall[1], 'sqlite');
  assert.match(searchCall[2], /Инфекция мочевых путей/u);
  assert.match(searchCall[2], /анализ мочи/u);
  assert.deepEqual(results[0].queryTerms, ['имп']);
  assert.deepEqual(await port.suggest('инф', 3), ['инфекция']);
  assert.deepEqual(log[0], ['build', 'sqlite', 1, 'pack@1']);
  await port.close();
  assert.deepEqual(log.at(-1), ['close', 'sqlite']);
});

test('falls back only after the failed SQLite worker has closed', async () => {
  const log = [];
  const port = createAdaptiveSearchPort([record], [], {
    forceDisk: true,
    sqliteFactory: fakeSearchFactory(log, { id: 'sqlite', fail: true }),
    diskFactory: fakeSearchFactory(log, { id: 'postings' }),
  });
  const stats = await port.ready;
  assert.equal(stats.backend, 'postings');
  assert.equal(port.kind, 'postings');
  assert.equal(port.backendErrors[0].backend, 'sqlite-fts5');
  assert.deepEqual(log.slice(0, 3), [
    ['build', 'sqlite', 1, ''],
    ['close', 'sqlite'],
    ['build', 'postings', 1, ''],
  ]);
  await port.close();
});
