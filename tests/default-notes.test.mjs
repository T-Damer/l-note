import assert from 'node:assert/strict';
import test from 'node:test';

import {
  WELCOME_NOTE_ID,
  WELCOME_NOTE_SETTING,
  createWelcomeNote,
  ensureWelcomeNote,
} from '../src/services/default-notes.js';

function memoryPort() {
  const stores = { notes: new Map(), settings: new Map() };
  return {
    stores,
    async getOne(store, key) {
      return stores[store].get(key);
    },
    async putOne(store, value) {
      stores[store].set(value.id ?? value.key, structuredClone(value));
      return value;
    },
  };
}

test('creates a generic welcome note with a stable ID', () => {
  const note = createWelcomeNote('2026-07-30T00:00:00.000Z');
  assert.equal(note.id, WELCOME_NOTE_ID);
  assert.equal(note.title, 'Привет, коллега');
  assert.equal(note.relation, 'observation');
  assert.deepEqual(note.relatedEntityIds, []);
});

test('seeds the welcome note only once and respects later deletion', async () => {
  const storage = memoryPort();
  const first = await ensureWelcomeNote(storage, '2026-07-30T00:00:00.000Z');
  assert.equal(first.created, true);
  assert.equal(storage.stores.notes.get(WELCOME_NOTE_ID)?.title, 'Привет, коллега');
  assert.equal(storage.stores.settings.get(WELCOME_NOTE_SETTING)?.value, true);

  storage.stores.notes.delete(WELCOME_NOTE_ID);
  const second = await ensureWelcomeNote(storage, '2026-07-31T00:00:00.000Z');
  assert.equal(second.created, false);
  assert.equal(storage.stores.notes.has(WELCOME_NOTE_ID), false);
});
