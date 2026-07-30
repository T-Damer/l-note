import assert from 'node:assert/strict';
import test from 'node:test';

import {
  WELCOME_NOTE_ID,
  WELCOME_NOTE_SETTING_KEY,
  createWelcomeNote,
  ensureWelcomeNote,
} from '../src/services/welcome-note.js';

function memoryStorage(initialNotes = []) {
  const stores = {
    notes: new Map(initialNotes.map((note) => [note.id, note])),
    settings: new Map(),
  };
  return {
    stores,
    async getAll(name) { return [...stores[name].values()]; },
    async putOne(name, value) { stores[name].set(value.id ?? value.key, value); return value; },
    async getSetting(key, fallback) { return stores.settings.get(key)?.value ?? fallback; },
    async setSetting(key, value) { stores.settings.set(key, { key, value }); return value; },
  };
}

test('welcome note uses a stable ID and explicit personal authority', () => {
  const note = createWelcomeNote({ now: '2026-07-31T00:00:00Z' });
  assert.equal(note.id, WELCOME_NOTE_ID);
  assert.equal(note.title, 'Привет, коллега');
  assert.equal(note.relation, 'observation');
  assert.deepEqual(note.relatedEntityIds, []);
  assert.equal(note.createdAt, note.updatedAt);
});

test('welcome note is inserted once through the StoragePort boundary', async () => {
  const storage = memoryStorage();
  const first = await ensureWelcomeNote(storage, { now: '2026-07-31T00:00:00Z' });
  const second = await ensureWelcomeNote(storage, { now: '2026-07-31T00:01:00Z' });

  assert.equal(first.created, true);
  assert.equal(second.created, false);
  assert.equal(second.reason, 'already-seeded');
  assert.equal(storage.stores.notes.size, 1);
  assert.equal(storage.stores.settings.get(WELCOME_NOTE_SETTING_KEY)?.value, true);
});

test('existing user notes prevent an unsolicited extra welcome note', async () => {
  const storage = memoryStorage([{ id: 'user-note', title: 'Existing', body: 'Body' }]);
  const result = await ensureWelcomeNote(storage);

  assert.equal(result.created, false);
  assert.equal(result.reason, 'existing-notes');
  assert.equal(storage.stores.notes.size, 1);
});
