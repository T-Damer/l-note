import assert from 'node:assert/strict';
import test from 'node:test';

import { SqliteFtsSearchPort } from '../src/adapters/sqlite-fts-search.js';

class WorkerStub {
  constructor() {
    this.listeners = new Map();
    this.messages = [];
  }

  addEventListener(type, listener) {
    const values = this.listeners.get(type) ?? [];
    values.push(listener);
    this.listeners.set(type, values);
  }

  postMessage(message) {
    this.messages.push(message);
    queueMicrotask(() => {
      for (const listener of this.listeners.get('message') ?? []) {
        listener({
          data: {
            requestId: message.requestId,
            type: 'result',
            result: { backend: 'sqlite-fts5-idb-v1', recordCount: 1, imported: true },
          },
        });
      }
    });
  }

  terminate() {}
}

test('passes the stored search descriptor and Blob to the SQLite worker', async () => {
  const worker = new WorkerStub();
  const port = new SqliteFtsSearchPort({ workerFactory: () => worker });
  const blob = new Blob(['database']);
  await port.build([{ id: 'record' }], {
    fingerprint: 'corpus',
    artifact: {
      id: 'search.demo',
      kind: 'sqlite-fts5',
      formatVersion: 1,
      runtime: '@subframe7536/sqlite-wasm@1.3.1',
      url: './not-forwarded.sqlite',
      sha256: 'a'.repeat(64),
      bytes: blob.size,
      corpusFingerprint: 'corpus',
      recordCount: 1,
      blob,
      extra: 'not-forwarded',
    },
  });
  const payload = worker.messages[0].artifact;
  assert.equal(payload.id, 'search.demo');
  assert.equal(payload.kind, 'sqlite-fts5');
  assert.equal(payload.corpusFingerprint, 'corpus');
  assert.equal(payload.blob, blob);
  assert.equal('url' in payload, false);
  assert.equal('extra' in payload, false);
});
