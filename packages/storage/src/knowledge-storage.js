import { openDB } from 'idb';

const DEFAULT_DATABASE_NAME = 'l-note';
const DATABASE_VERSION = 1;

const clone = (value) => structuredClone(value);

export function createMemoryStorage(seed = {}) {
  const packs = new Map((seed.packs ?? []).map((pack) => [pack.manifest.id, clone(pack)]));
  const notes = new Map((seed.notes ?? []).map((note) => [note.id, clone(note)]));
  const settings = new Map(
    Object.entries(seed.settings ?? {}).map(([key, value]) => [key, clone(value)]),
  );

  return {
    kind: 'memory',
    async listPacks() {
      return [...packs.values()].map((pack) => clone(pack));
    },
    async putPack(pack) {
      packs.set(pack.manifest.id, clone(pack));
    },
    async deletePack(packId) {
      packs.delete(packId);
    },
    async listNotes() {
      return [...notes.values()]
        .map((note) => clone(note))
        .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
    },
    async putNote(note) {
      notes.set(note.id, clone(note));
    },
    async deleteNote(noteId) {
      notes.delete(noteId);
    },
    async getSetting(key, fallback = null) {
      return settings.has(key) ? clone(settings.get(key)) : clone(fallback);
    },
    async setSetting(key, value) {
      settings.set(key, clone(value));
    },
    async clearAll() {
      packs.clear();
      notes.clear();
      settings.clear();
    },
  };
}

export async function createIndexedDbStorage({ databaseName = DEFAULT_DATABASE_NAME } = {}) {
  if (!globalThis.indexedDB) throw new Error('IndexedDB is unavailable.');

  const database = await openDB(databaseName, DATABASE_VERSION, {
    upgrade(db) {
      if (!db.objectStoreNames.contains('packs')) {
        db.createObjectStore('packs', { keyPath: 'manifest.id' });
      }
      if (!db.objectStoreNames.contains('notes')) {
        db.createObjectStore('notes', { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains('settings')) {
        db.createObjectStore('settings');
      }
    },
  });

  return {
    kind: 'indexeddb',
    async listPacks() {
      return database.getAll('packs');
    },
    async putPack(pack) {
      await database.put('packs', pack);
    },
    async deletePack(packId) {
      await database.delete('packs', packId);
    },
    async listNotes() {
      const notes = await database.getAll('notes');
      return notes.sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
    },
    async putNote(note) {
      await database.put('notes', note);
    },
    async deleteNote(noteId) {
      await database.delete('notes', noteId);
    },
    async getSetting(key, fallback = null) {
      const value = await database.get('settings', key);
      return value === undefined ? fallback : value;
    },
    async setSetting(key, value) {
      await database.put('settings', value, key);
    },
    async clearAll() {
      const transaction = database.transaction(['packs', 'notes', 'settings'], 'readwrite');
      await Promise.all([
        transaction.objectStore('packs').clear(),
        transaction.objectStore('notes').clear(),
        transaction.objectStore('settings').clear(),
        transaction.done,
      ]);
    },
    close() {
      database.close();
    },
  };
}

export async function openKnowledgeStorage(options) {
  try {
    return await createIndexedDbStorage(options);
  } catch (error) {
    console.warn('Falling back to in-memory storage.', error);
    return createMemoryStorage();
  }
}
