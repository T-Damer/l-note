import { readFile } from 'node:fs/promises';

import { describe, expect, it } from 'vitest';

import { parseKnowledgePack } from '../packages/contracts/src/index.js';
import { KnowledgeEngine } from '../packages/core/src/index.js';

async function loadPacks() {
  const files = ['l-note-foundations.json', 'offline-web-runtime.json'];
  return Promise.all(
    files.map(async (file) =>
      parseKnowledgePack(
        JSON.parse(await readFile(new URL(`../public/packs/${file}`, import.meta.url), 'utf8')),
      ),
    ),
  );
}

describe('fuzzy knowledge search', () => {
  it('finds a Russian source despite a typo', async () => {
    const engine = new KnowledgeEngine({ packs: await loadPacks() });
    const results = engine.search('как PWA работает офлаин');

    expect(results.length).toBeGreaterThan(0);
    expect(results.some((result) => result.text.toLowerCase().includes('оффлайн'))).toBe(true);
  });

  it('resolves abbreviations through entity aliases', async () => {
    const engine = new KnowledgeEngine({ packs: await loadPacks() });
    const suggestions = engine.suggest('RAG');

    expect(suggestions.some((item) => item.canonicalName === 'Retrieval-augmented generation')).toBe(
      true,
    );
  });

  it('keeps personal notes visible but explicitly separate', async () => {
    const packs = await loadPacks();
    const engine = new KnowledgeEngine({
      packs,
      notes: [
        {
          id: '00000000-0000-4000-8000-000000000001',
          title: 'Личный опыт с офлайн-режимом',
          body: 'После очистки браузерного кэша оболочка перестала запускаться без сети.',
          tags: ['опыт'],
          entityLinks: [{ packId: 'offline-web-runtime', itemId: 'pwa' }],
          personalClaim: null,
          createdAt: '2026-07-30T11:30:00Z',
          updatedAt: '2026-07-30T11:30:00Z',
        },
      ],
    });

    const results = engine.search('очистка кэша офлайн');
    expect(results[0].kind).toBe('note');
  });
});
