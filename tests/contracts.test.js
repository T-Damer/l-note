import { readFile } from 'node:fs/promises';

import { describe, expect, it } from 'vitest';

import { parseKnowledgePack, parseKnowledgePackCatalog } from '../packages/contracts/src/index.js';

const readJson = async (path) => JSON.parse(await readFile(new URL(path, import.meta.url), 'utf8'));

describe('knowledge pack contracts', () => {
  it('accepts the published demo packs and catalog', async () => {
    const catalog = parseKnowledgePackCatalog(await readJson('../public/packs/catalog.json'));
    const packs = await Promise.all(
      catalog.packs.map((entry) => readJson(`../public/${entry.url}`).then(parseKnowledgePack)),
    );

    expect(packs).toHaveLength(2);
    expect(packs[0].claims.length).toBeGreaterThan(0);
    expect(packs[0].entities.length).toBeGreaterThan(0);
  });

  it('rejects a claim whose quote is not present in its chunk', async () => {
    const pack = await readJson('../public/packs/l-note-foundations.json');
    pack.claims[0].evidence[0].quote = 'Этой цитаты в источнике нет.';

    expect(() => parseKnowledgePack(pack)).toThrow(/exact substring/u);
  });
});
