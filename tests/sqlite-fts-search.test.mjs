import assert from 'node:assert/strict';
import test from 'node:test';

import { SqliteFtsSearchPort } from '../src/adapters/sqlite-fts-search.js';
import {
  rankSqliteFtsRows,
  selectSqliteFuzzyTerms,
  sqliteFtsMatchQuery,
  sqliteFtsRecordValues,
} from '../src/helpers/sqlite-fts.js';

const record = {
  id: 'section:respiratory:bronchiolitis',
  kind: 'section',
  packId: 'demo',
  packTitle: 'Демонстрация',
  documentId: 'bronchiolitis',
  documentTitle: 'Бронхиолит у детей',
  sectionId: 'clinical',
  title: 'Свистящее дыхание',
  body: 'При бронхиолите возможно свистящее дыхание и затруднение выдоха.',
  aliases: 'бронхообструкция',
  entityNames: 'Бронхиолит',
  tags: 'педиатрия дыхательная система',
  authority: 'reference',
};

test('builds safe prefix FTS queries from normalized Russian terms', () => {
  assert.equal(
    sqliteFtsMatchQuery('Бронхиолит ёлка', ['свистящее дыхание']),
    '"бронхиолит"* OR "елка"* OR "свистящее"* OR "дыхание"*',
  );
  assert.equal(sqliteFtsMatchQuery('   '), '');
});

test('serializes records for FTS while preserving the complete payload', () => {
  const values = sqliteFtsRecordValues(record);
  assert.equal(values.length, 8);
  assert.equal(values[0], record.id);
  assert.deepEqual(JSON.parse(values[1]), record);
  assert.equal(values[2], 'свистящее дыхание');
  assert.equal(values[5], 'бронхообструкция');
});

test('ranks SQLite rows through the shared SearchResult contract', () => {
  const [result] = rankSqliteFtsRows([
    { payload: JSON.stringify(record), score: 4.2 },
  ], 'свистящее дыхание', { limit: 5 });
  assert.equal(result.id, record.id);
  assert.equal(result.relevance, 100);
  assert.deepEqual(result.queryTerms, ['свистящее', 'дыхание']);
  assert.match(result.snippet, /свистящее дыхание/iu);
});

test('selects bounded Damerau-Levenshtein corrections from FTS vocabulary', () => {
  const terms = selectSqliteFuzzyTerms('бронхиалит', [
    { term: 'бронхиолит', documents: 12 },
    { term: 'бронхит', documents: 40 },
    { term: 'пневмония', documents: 99 },
  ]);
  assert.deepEqual(terms, ['бронхиолит']);
});

class FakeWorker {
  constructor(log) {
    this.log = log;
    this.listeners = new Map();
    this.terminated = false;
  }

  addEventListener(type, listener) {
    const values = this.listeners.get(type) ?? [];
    values.push(listener);
    this.listeners.set(type, values);
  }

  emit(type, data) {
    for (const listener of this.listeners.get(type) ?? []) listener({ data });
  }

  postMessage(message) {
    this.log.push(message);
    queueMicrotask(() => {
      if (message.command === 'build') {
        this.emit('message', {
          requestId: message.requestId,
          type: 'progress',
          progress: { stage: 'records', completed: 1, total: 1 },
        });
        this.emit('message', {
          requestId: message.requestId,
          type: 'result',
          result: { recordCount: 1, tokenCount: 7, storage: 'indexeddb-vfs', backend: 'sqlite-fts5-idb-v1' },
        });
      } else if (message.command === 'search') {
        this.emit('message', { requestId: message.requestId, type: 'result', result: [{ ...record, relevance: 100 }] });
      } else if (message.command === 'suggest') {
        this.emit('message', { requestId: message.requestId, type: 'result', result: ['бронхиолит'] });
      } else if (message.command === 'stats') {
        this.emit('message', {
          requestId: message.requestId,
          type: 'result',
          result: { recordCount: 1, tokenCount: 7, storage: 'indexeddb-vfs', backend: 'sqlite-fts5-idb-v1' },
        });
      } else {
        this.emit('message', { requestId: message.requestId, type: 'result', result: {} });
      }
    });
  }

  terminate() {
    this.terminated = true;
  }
}

test('SQLite adapter sends fingerprinted build and search commands to one worker', async () => {
  const log = [];
  const worker = new FakeWorker(log);
  const port = new SqliteFtsSearchPort({ workerFactory: () => worker });
  const progress = [];
  const stats = await port.build([record], {
    fingerprint: 'corpus-v1',
    onProgress: (value) => progress.push(value),
  });
  assert.equal(stats.backend, 'sqlite-fts5-idb-v1');
  assert.equal(log[0].fingerprint, 'corpus-v1');
  assert.equal(progress.length, 1);
  assert.equal((await port.search('бронхиолит'))[0].id, record.id);
  assert.deepEqual(await port.suggest('брон', 3), ['бронхиолит']);
  assert.equal((await port.stats()).recordCount, 1);
  await port.close();
  assert.equal(log.at(-1).command, 'close');
  assert.equal(worker.terminated, true);
});
