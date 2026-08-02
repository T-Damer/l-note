import {
  buildDiskPostingEntries,
  diskQueryTokens,
  diskTokenMatch,
  hydrateDiskResults,
} from '../helpers/disk-search.js';

const DB_NAME = 'l-note-search';
const DB_VERSION = 1;
let databasePromise = null;
let recordCount = 0;
let tokenCount = 0;

function requestAsPromise(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('IndexedDB request failed.'));
  });
}

function transactionDone(transaction) {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error ?? new Error('IndexedDB transaction failed.'));
    transaction.onabort = () => reject(transaction.error ?? new Error('IndexedDB transaction aborted.'));
  });
}

function openDatabase() {
  if (databasePromise) return databasePromise;
  databasePromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains('records')) {
        database.createObjectStore('records', { keyPath: 'id' });
      }
      if (!database.objectStoreNames.contains('postings')) {
        database.createObjectStore('postings', { keyPath: 'token' });
      }
      if (!database.objectStoreNames.contains('meta')) {
        database.createObjectStore('meta', { keyPath: 'key' });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('Unable to open disk search database.'));
    request.onblocked = () => reject(new Error('Disk search upgrade is blocked by another tab.'));
  });
  return databasePromise;
}

async function clearIndex() {
  const database = await openDatabase();
  const transaction = database.transaction(['records', 'postings', 'meta'], 'readwrite');
  transaction.objectStore('records').clear();
  transaction.objectStore('postings').clear();
  transaction.objectStore('meta').clear();
  await transactionDone(transaction);
  recordCount = 0;
  tokenCount = 0;
}

async function writeBatches(storeName, entries, batchSize = 500) {
  const database = await openDatabase();
  for (let offset = 0; offset < entries.length; offset += batchSize) {
    const transaction = database.transaction(storeName, 'readwrite');
    const store = transaction.objectStore(storeName);
    for (const entry of entries.slice(offset, offset + batchSize)) store.put(entry);
    await transactionDone(transaction);
  }
}

async function buildIndex(records, requestId) {
  await clearIndex();
  const postings = buildDiskPostingEntries(records);
  postProgress(requestId, { stage: 'records', completed: 0, total: records.length });
  await writeBatches('records', records);
  postProgress(requestId, { stage: 'postings', completed: 0, total: postings.length });
  await writeBatches('postings', postings);
  recordCount = records.length;
  tokenCount = postings.length;
  await writeBatches('meta', [
    { key: 'recordCount', value: recordCount },
    { key: 'tokenCount', value: tokenCount },
    { key: 'builtAt', value: new Date().toISOString() },
  ]);
  return { recordCount, tokenCount, storage: 'indexeddb', backend: 'disk-postings-v1' };
}

async function postingForToken(token) {
  const database = await openDatabase();
  const transaction = database.transaction('postings', 'readonly');
  const result = await requestAsPromise(transaction.objectStore('postings').get(token));
  await transactionDone(transaction);
  return result ?? null;
}

async function cursorPostings(range, accept, limit) {
  const database = await openDatabase();
  const transaction = database.transaction('postings', 'readonly');
  const store = transaction.objectStore('postings');
  const values = await new Promise((resolve, reject) => {
    const output = [];
    const request = store.openCursor(range);
    request.onerror = () => reject(request.error ?? new Error('Unable to scan disk postings.'));
    request.onsuccess = () => {
      const cursor = request.result;
      if (!cursor || output.length >= limit) {
        resolve(output);
        return;
      }
      if (accept(cursor.value)) output.push(cursor.value);
      cursor.continue();
    };
  });
  await transactionDone(transaction);
  return values;
}

async function candidatePostings(queryToken) {
  const exact = await postingForToken(queryToken);
  const output = exact ? [{ posting: exact, match: 1 }] : [];
  if (queryToken.length >= 2) {
    const range = IDBKeyRange.bound(queryToken, `${queryToken}\uffff`);
    const prefix = await cursorPostings(
      range,
      (posting) => posting.token !== queryToken,
      32,
    );
    output.push(...prefix.map((posting) => ({ posting, match: .76 })));
  }
  if (output.length === 0 && queryToken.length >= 4) {
    const fuzzy = await cursorPostings(
      null,
      (posting) => diskTokenMatch(queryToken, posting.token) > 0,
      48,
    );
    output.push(...fuzzy.map((posting) => ({
      posting,
      match: diskTokenMatch(queryToken, posting.token),
    })));
  }
  return output;
}

function addPostingScores(scores, posting, match) {
  const rarity = 1 / Math.max(1, Math.log2(2 + posting.documentFrequency));
  for (const item of posting.items) {
    scores.set(item.id, (scores.get(item.id) ?? 0) + item.score * match * rarity);
  }
}

async function recordsById(ids) {
  if (!ids.length) return [];
  const database = await openDatabase();
  const transaction = database.transaction('records', 'readonly');
  const store = transaction.objectStore('records');
  const records = await Promise.all(ids.map((id) => requestAsPromise(store.get(id))));
  await transactionDone(transaction);
  return records.filter(Boolean);
}

async function searchIndex(query, options = {}) {
  const tokens = diskQueryTokens(query);
  if (!tokens.length) return [];
  const scores = new Map();
  for (const token of tokens) {
    for (const candidate of await candidatePostings(token)) {
      addPostingScores(scores, candidate.posting, candidate.match);
    }
  }
  const limit = Math.max(1, Number(options.limit ?? 40));
  const ids = [...scores.entries()]
    .sort((left, right) => right[1] - left[1])
    .slice(0, Math.max(limit * 4, 80))
    .map(([id]) => id);
  return hydrateDiskResults(
    await recordsById(ids),
    scores,
    query,
    limit,
    Boolean(options.personalPriority),
  );
}

async function suggestIndex(query, limit = 5) {
  const token = diskQueryTokens(query).at(-1);
  if (!token) return [];
  const range = IDBKeyRange.bound(token, `${token}\uffff`);
  const postings = await cursorPostings(range, () => true, Math.max(limit * 5, 20));
  return postings
    .sort((left, right) => right.documentFrequency - left.documentFrequency)
    .slice(0, limit)
    .map((posting) => posting.token);
}

async function indexStats() {
  if (!recordCount && !tokenCount) {
    const database = await openDatabase();
    const transaction = database.transaction('meta', 'readonly');
    const store = transaction.objectStore('meta');
    const [records, tokens] = await Promise.all([
      requestAsPromise(store.get('recordCount')),
      requestAsPromise(store.get('tokenCount')),
    ]);
    await transactionDone(transaction);
    recordCount = Number(records?.value ?? 0);
    tokenCount = Number(tokens?.value ?? 0);
  }
  return { recordCount, tokenCount, storage: 'indexeddb', backend: 'disk-postings-v1' };
}

function postProgress(requestId, progress) {
  self.postMessage({ requestId, type: 'progress', progress });
}

self.addEventListener('message', async (event) => {
  const message = event.data ?? {};
  try {
    let result;
    if (message.command === 'build') result = await buildIndex(message.records ?? [], message.requestId);
    else if (message.command === 'search') result = await searchIndex(message.query, message.options);
    else if (message.command === 'suggest') result = await suggestIndex(message.query, message.limit);
    else if (message.command === 'clear') result = await clearIndex();
    else if (message.command === 'stats') result = await indexStats();
    else throw new Error(`Unknown disk-search command: ${message.command}`);
    self.postMessage({ requestId: message.requestId, type: 'result', result });
  } catch (error) {
    self.postMessage({
      requestId: message.requestId,
      type: 'error',
      error: error instanceof Error ? error.message : String(error),
    });
  }
});
