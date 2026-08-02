const DB_NAME = 'l-note';
const DB_VERSION = 1;
const memory = {
  packs: new Map(),
  notes: new Map(),
  settings: new Map(),
};

let databasePromise;
let persistentAvailable = true;

function requestAsPromise(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('IndexedDB request failed'));
  });
}

function transactionDone(transaction) {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error ?? new Error('IndexedDB transaction failed'));
    transaction.onabort = () => reject(transaction.error ?? new Error('IndexedDB transaction aborted'));
  });
}

async function openDatabase() {
  if (!persistentAvailable || !('indexedDB' in globalThis)) {
    persistentAvailable = false;
    return null;
  }
  if (databasePromise) return databasePromise;

  databasePromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains('packs')) db.createObjectStore('packs', { keyPath: 'id' });
      if (!db.objectStoreNames.contains('notes')) {
        const notes = db.createObjectStore('notes', { keyPath: 'id' });
        notes.createIndex('updatedAt', 'updatedAt');
      }
      if (!db.objectStoreNames.contains('settings')) db.createObjectStore('settings', { keyPath: 'key' });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('Unable to open IndexedDB'));
    request.onblocked = () => reject(new Error('IndexedDB upgrade is blocked by another tab'));
  }).catch((error) => {
    console.warn('Persistent storage is unavailable; using memory only.', error);
    persistentAvailable = false;
    databasePromise = undefined;
    return null;
  });

  return databasePromise;
}

export async function getAll(storeName) {
  const db = await openDatabase();
  if (!db) return [...memory[storeName].values()];
  const transaction = db.transaction(storeName, 'readonly');
  const result = await requestAsPromise(transaction.objectStore(storeName).getAll());
  await transactionDone(transaction);
  return result;
}

export async function getOne(storeName, key) {
  const db = await openDatabase();
  if (!db) return memory[storeName].get(key);
  const transaction = db.transaction(storeName, 'readonly');
  const result = await requestAsPromise(transaction.objectStore(storeName).get(key));
  await transactionDone(transaction);
  return result;
}

export async function putOne(storeName, value) {
  const db = await openDatabase();
  if (!db) {
    memory[storeName].set(value.id ?? value.key, structuredClone(value));
    return value;
  }
  const transaction = db.transaction(storeName, 'readwrite');
  transaction.objectStore(storeName).put(value);
  await transactionDone(transaction);
  return value;
}

export async function deleteOne(storeName, key) {
  const db = await openDatabase();
  if (!db) {
    memory[storeName].delete(key);
    return;
  }
  const transaction = db.transaction(storeName, 'readwrite');
  transaction.objectStore(storeName).delete(key);
  await transactionDone(transaction);
}

export async function clearStore(storeName) {
  const db = await openDatabase();
  if (!db) {
    memory[storeName].clear();
    return;
  }
  const transaction = db.transaction(storeName, 'readwrite');
  transaction.objectStore(storeName).clear();
  await transactionDone(transaction);
}

export async function setSetting(key, value) {
  return putOne('settings', { key, value });
}

export async function getSetting(key, fallback) {
  const record = await getOne('settings', key);
  return record ? record.value : fallback;
}

export function storageMode() {
  return persistentAvailable && 'indexedDB' in globalThis ? 'persistent' : 'memory';
}
