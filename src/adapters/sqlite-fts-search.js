import { defineAsyncSearchPort } from '../core/ports.js';

const SQLITE_SEARCH_WORKER_URL = new URL('../workers/sqlite-search-worker.js', import.meta.url);

function defaultWorkerFactory() {
  if (typeof Worker !== 'function') throw new Error('Web Worker недоступен.');
  return new Worker(SQLITE_SEARCH_WORKER_URL, { type: 'module', name: 'l-note-sqlite-fts' });
}

export class SqliteFtsSearchPort {
  constructor({ workerFactory = defaultWorkerFactory } = {}) {
    this.kind = 'SQLite/FTS5';
    this.count = 0;
    this.workerFactory = workerFactory;
    this.worker = null;
    this.pending = new Map();
    this.nextRequestId = 1;
  }

  get available() {
    const customWorker = this.workerFactory !== defaultWorkerFactory;
    return (typeof Worker === 'function' || customWorker)
      && ('indexedDB' in globalThis || customWorker);
  }

  ensureWorker() {
    if (this.worker) return this.worker;
    const worker = this.workerFactory();
    worker.addEventListener('message', (event) => this.handleMessage(event.data));
    worker.addEventListener('error', (event) => {
      this.rejectPending(new Error(event.message || 'SQLite FTS worker failed.'));
      this.close();
    });
    this.worker = worker;
    return worker;
  }

  handleMessage(message) {
    const pending = this.pending.get(message?.requestId);
    if (!pending) return;
    if (message.type === 'progress') {
      pending.onProgress?.(message.progress);
      return;
    }
    this.pending.delete(message.requestId);
    if (message.type === 'error') pending.reject(new Error(message.error || 'SQLite FTS failed.'));
    else pending.resolve(message.result);
  }

  rejectPending(error) {
    for (const pending of this.pending.values()) pending.reject(error);
    this.pending.clear();
  }

  request(command, payload = {}, { onProgress } = {}) {
    if (!this.available) return Promise.reject(new Error('SQLite/FTS5 search is unavailable.'));
    const requestId = this.nextRequestId;
    this.nextRequestId += 1;
    return new Promise((resolve, reject) => {
      this.pending.set(requestId, { resolve, reject, onProgress });
      this.ensureWorker().postMessage({ requestId, command, ...payload });
    });
  }

  async build(records, { fingerprint = '', onProgress } = {}) {
    const result = await this.request('build', { records, fingerprint }, { onProgress });
    this.count = Number(result?.recordCount ?? records?.length ?? 0);
    return result;
  }

  search(query, options = {}) {
    return this.request('search', { query: String(query ?? ''), options });
  }

  suggest(query, limit = 5) {
    return this.request('suggest', { query: String(query ?? ''), limit });
  }

  async clear() {
    const result = await this.request('clear');
    this.count = 0;
    return result;
  }

  async stats() {
    const result = await this.request('stats');
    this.count = Number(result?.recordCount ?? this.count);
    return result;
  }

  close() {
    this.rejectPending(new Error('SQLite FTS worker was closed.'));
    this.worker?.terminate?.();
    this.worker = null;
  }
}

export function createSqliteFtsSearchPort(options = {}) {
  return defineAsyncSearchPort(new SqliteFtsSearchPort(options));
}
