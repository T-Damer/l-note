import assert from 'node:assert/strict';
import test from 'node:test';

import { IndexedDbSearchPort } from '../src/adapters/indexeddb-search.js';
import { defineAsyncSearchPort } from '../src/core/ports.js';
import {
  buildDiskPostingEntries,
  diskRecordTokenScores,
  diskTokenMatch,
  hydrateDiskResults,
} from '../src/helpers/disk-search.js';

const records = [
  {
    id: 'section:1',
    kind: 'section',
    title: 'Бронхиолит',
    documentTitle: 'Свистящее дыхание у грудничка',
    body: 'Бронхиолит может сопровождаться свистящим дыханием.',
    aliases: 'бронхиальная обструкция',
    entityNames: 'Бронхиолит',
    tags: 'дыхательная система',
    authority: 'reference',
  },
  {
    id: 'section:2',
    kind: 'section',
    title: 'Лекарственный реестр',
    documentTitle: 'Амоксициллин',
    body: 'Регистрационная запись препарата.',
    aliases: '',
    entityNames: 'Амоксициллин',
    tags: 'лекарства',
    authority: 'reference',
  },
];

test('builds weighted token postings without keeping a MiniSearch instance', () => {
  const scores = diskRecordTokenScores(records[0]);
  assert.ok(scores.get('бронхиолит') > scores.get('сопровождаться'));
  const postings = buildDiskPostingEntries(records);
  const bronchiolitis = postings.find((posting) => posting.token === 'бронхиолит');
  assert.equal(bronchiolitis.documentFrequency, 1);
  assert.equal(bronchiolitis.items[0].id, 'section:1');
});

test('disk token matching supports exact, prefix and bounded typo matches', () => {
  assert.equal(diskTokenMatch('бронхиолит', 'бронхиолит'), 1);
  assert.ok(diskTokenMatch('бронх', 'бронхиолит') > .7);
  assert.ok(diskTokenMatch('бронхиалит', 'бронхиолит') > 0);
  assert.equal(diskTokenMatch('ад', 'яд'), 0);
});

test('hydrates disk candidates into the common relevance contract', () => {
  const scores = new Map([['section:1', 12], ['section:2', 2]]);
  const results = hydrateDiskResults(records, scores, 'грудничок свистит', 10, false);
  assert.equal(results[0].id, 'section:1');
  assert.equal(results[0].relevance, 100);
  assert.ok(results[1].relevance < results[0].relevance);
});

class FakeSearchWorker {
  constructor() {
    this.listeners = new Map();
    this.terminated = false;
  }

  addEventListener(type, listener) {
    const values = this.listeners.get(type) ?? [];
    values.push(listener);
    this.listeners.set(type, values);
  }

  emit(data) {
    for (const listener of this.listeners.get('message') ?? []) listener({ data });
  }

  postMessage(message) {
    queueMicrotask(() => {
      const result = message.command === 'build'
        ? { recordCount: message.records.length, tokenCount: 12, storage: 'indexeddb', backend: 'test' }
        : message.command === 'search'
          ? [{ ...records[0], relevance: 100 }]
          : message.command === 'suggest'
            ? ['бронхиолит']
            : message.command === 'stats'
              ? { recordCount: 2, tokenCount: 12, storage: 'indexeddb', backend: 'test' }
              : undefined;
      this.emit({ requestId: message.requestId, type: 'result', result });
    });
  }

  terminate() {
    this.terminated = true;
  }
}

test('async disk search adapter exposes build, search, suggestions and cleanup', async () => {
  const worker = new FakeSearchWorker();
  const port = new IndexedDbSearchPort({ workerFactory: () => worker });
  assert.equal(defineAsyncSearchPort(port), port);
  const stats = await port.build(records);
  assert.equal(stats.recordCount, 2);
  assert.equal(port.count, 2);
  assert.equal((await port.search('бронхиолит'))[0].id, 'section:1');
  assert.deepEqual(await port.suggest('брон'), ['бронхиолит']);
  port.close();
  assert.equal(worker.terminated, true);
});
