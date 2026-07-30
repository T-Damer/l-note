import { readFile } from 'node:fs/promises';

import { describe, expect, it } from 'vitest';

import { parseKnowledgePack, parseLocalNote } from '../packages/contracts/src/index.js';
import { KnowledgeEngine } from '../packages/core/src/index.js';

async function loadPack(file) {
  return parseKnowledgePack(
    JSON.parse(await readFile(new URL(`../public/packs/${file}`, import.meta.url), 'utf8')),
  );
}

describe('KnowledgeEngine', () => {
  it('creates a source-addressable evidence bundle', async () => {
    const engine = new KnowledgeEngine({ packs: [await loadPack('l-note-foundations.json')] });
    const bundle = engine.buildEvidenceBundle('Нужна ли LLM для обычного поиска?');

    expect(bundle.sources.length).toBeGreaterThan(0);
    expect(bundle.sources.every((source) => source.id)).toBe(true);
    expect(bundle.claims.some((claim) => claim.id.endsWith('claim-llm-optional-for-search'))).toBe(
      true,
    );
    expect(bundle.policy.abstainWhenUnsupported).toBe(true);
  });

  it('attaches an explicit personal contradiction instead of replacing a reference claim', async () => {
    const pack = await loadPack('l-note-foundations.json');
    const note = parseLocalNote({
      id: '00000000-0000-4000-8000-000000000002',
      title: 'Моё ограничение fuzzy-поиска',
      body: 'В узком словаре слишком короткие опечатки иногда не исправляются.',
      tags: ['наблюдение'],
      entityLinks: [{ packId: pack.manifest.id, itemId: 'fuzzy-search' }],
      personalClaim: {
        subject: { packId: pack.manifest.id, itemId: 'fuzzy-search' },
        predicate: 'sometimes_misses',
        value: 'очень короткие запросы',
        relationTo: {
          claim: { packId: pack.manifest.id, itemId: 'claim-fuzzy-corrects-typos' },
          relation: 'refines',
        },
      },
      createdAt: '2026-07-30T11:30:00Z',
      updatedAt: '2026-07-30T11:30:00Z',
    });
    const engine = new KnowledgeEngine({ packs: [pack], notes: [note] });
    const bundle = engine.buildEvidenceBundle('Как fuzzy search исправляет опечатки?');

    expect(bundle.personalClaims).toHaveLength(1);
    expect(bundle.personalClaims[0].relationTo.relation).toBe('refines');
  });
});
