import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import { KnowledgePackSchema } from '../src/pack-schema.js';

test('custom example is a valid portable pack', async () => {
  const raw = JSON.parse(await readFile(new URL('../examples/custom-pack.source.json', import.meta.url), 'utf8'));
  const parsed = KnowledgePackSchema.parse({
    format: 'l-note-pack',
    schemaVersion: 1,
    ...raw
  });
  assert.equal(parsed.records.length, 2);
  assert.equal(parsed.entities.length, 2);
  assert.equal(parsed.relations.length, 1);
});

test('relations cannot point to an unknown entity', () => {
  const result = KnowledgePackSchema.safeParse({
    format: 'l-note-pack',
    schemaVersion: 1,
    id: 'broken.pack',
    version: '1',
    title: 'Broken',
    description: 'Broken relation',
    language: 'ru',
    createdAt: '2026-07-30T00:00:00Z',
    source: { name: 'test', url: null, license: null, contentMode: null },
    disclaimer: null,
    tags: [],
    records: [
      {
        id: 'record.one',
        documentId: 'document.one',
        kind: 'reference',
        title: 'One',
        section: null,
        body: 'Body',
        aliases: [],
        tags: [],
        entityIds: [],
        claims: [],
        source: null,
        updatedAt: null,
        metadata: {}
      }
    ],
    entities: [],
    relations: [
      {
        id: 'relation.broken',
        from: 'missing.one',
        predicate: 'related',
        to: 'missing.two',
        recordId: null,
        description: null,
        weight: 1,
        metadata: {}
      }
    ],
    metadata: {}
  });
  assert.equal(result.success, false);
});
