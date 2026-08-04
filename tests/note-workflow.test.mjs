import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createNoteRecord,
  normalizeImportedNotes,
  normalizeNoteRelation,
  normalizeNoteTarget,
  normalizeRelatedEntityIds,
} from '../src/services/note-workflow.js';

test('normalizes note relations, entity identifiers and source targets', () => {
  assert.equal(normalizeNoteRelation('supports'), 'supports');
  assert.equal(normalizeNoteRelation('invented'), 'observation');
  assert.deepEqual(normalizeRelatedEntityIds(['a', 'a', '', null, 'b']), ['a', 'b']);
  assert.deepEqual(normalizeNoteTarget({
    targetClaimId: ' claim-1 ',
    targetDocumentId: ' pack::doc-1 ',
    targetSectionId: ' section-1 ',
  }), {
    targetClaimId: 'claim-1',
    targetDocumentId: 'pack::doc-1',
    targetSectionId: 'section-1',
  });
  assert.equal(normalizeNoteTarget({ targetSectionId: 'orphan' }).targetSectionId, null);
});

test('creates a bounded note record without losing the original creation time', () => {
  const note = createNoteRecord({
    draft: {
      title: '  Наблюдение  ',
      body: '  Текст заметки  ',
      relation: 'invented',
      targetClaimId: ' claim-1 ',
      targetDocumentId: ' pack::doc-1 ',
      targetSectionId: ' section-1 ',
    },
    previous: { id: 'note-1', createdAt: '2026-01-01T00:00:00.000Z' },
    relatedEntityIds: ['entity-1', 'entity-1', 'entity-2'],
    now: '2026-07-31T12:00:00.000Z',
    relationLabel: (relation) => `label:${relation}`,
  });

  assert.deepEqual(note, {
    id: 'note-1',
    title: 'Наблюдение',
    body: 'Текст заметки',
    relation: 'observation',
    relationLabel: 'label:observation',
    targetClaimId: 'claim-1',
    targetDocumentId: 'pack::doc-1',
    targetSectionId: 'section-1',
    relatedEntityIds: ['entity-1', 'entity-2'],
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-07-31T12:00:00.000Z',
  });
});

test('normalizes imported notes and preserves source targets plus timestamps', () => {
  let id = 0;
  const records = normalizeImportedNotes({
    notes: [
      {
        title: 'Импорт',
        body: 'Содержимое',
        relation: 'supports',
        targetDocumentId: 'pack::doc-1',
        targetSectionId: 'content',
        relatedEntityIds: ['entity-1'],
        createdAt: '2025-01-01T00:00:00.000Z',
        updatedAt: '2025-02-01T00:00:00.000Z',
      },
      { title: 42, body: 'ignored' },
    ],
  }, {
    now: '2026-07-31T12:00:00.000Z',
    createId: () => `generated-${++id}`,
    relationLabel: (relation) => relation.toUpperCase(),
  });

  assert.equal(records.length, 1);
  assert.deepEqual(records[0], {
    id: 'generated-1',
    title: 'Импорт',
    body: 'Содержимое',
    relation: 'supports',
    relationLabel: 'SUPPORTS',
    targetClaimId: null,
    targetDocumentId: 'pack::doc-1',
    targetSectionId: 'content',
    relatedEntityIds: ['entity-1'],
    createdAt: '2025-01-01T00:00:00.000Z',
    updatedAt: '2025-02-01T00:00:00.000Z',
  });
});

test('rejects incomplete notes and malformed import payloads', () => {
  assert.throws(() => createNoteRecord({ draft: { title: '', body: 'body' } }), /title and body/u);
  assert.throws(() => normalizeImportedNotes({ notes: null }), /массив/u);
});
