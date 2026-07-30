import { describe, expect, it } from 'vitest';

import { createMemoryStorage } from '../packages/storage/src/index.js';

describe('memory storage adapter', () => {
  it('keeps packs and notes in separate stores', async () => {
    const storage = createMemoryStorage();
    const pack = { manifest: { id: 'demo' }, documents: [] };
    const note = { id: 'note', updatedAt: '2026-07-30T11:30:00Z' };

    await storage.putPack(pack);
    await storage.putNote(note);
    await storage.deletePack('demo');

    expect(await storage.listPacks()).toEqual([]);
    expect(await storage.listNotes()).toEqual([note]);
  });
});
