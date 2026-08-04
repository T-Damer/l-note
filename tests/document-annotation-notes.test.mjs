import assert from 'node:assert/strict';
import test from 'node:test';

import { indexNoteTargets, resolveNoteDocument } from '../src/helpers/note-targets.js';
import { buildKnowledgeState, flattenKnowledge } from '../src/packs.js';

const pack = {
  schemaVersion: 1,
  id: 'pack.example',
  version: '1.0.0',
  title: 'Example',
  description: 'Example pack',
  language: 'ru',
  entities: [],
  claims: [],
  relations: [],
  documents: [{
    id: 'doc.source',
    title: 'Исходный файл',
    source: { title: 'source.bin' },
    sections: [{ id: 'attachment', title: 'Файл для ручной разметки', text: 'Metadata' }],
  }],
};

const note = {
  id: 'note-1',
  title: 'Что находится в файле',
  body: 'Ручное описание бинарного вложения.',
  relation: 'observation',
  relationLabel: 'Практическое наблюдение',
  targetClaimId: null,
  targetDocumentId: 'pack.example::doc.source',
  targetSectionId: 'attachment',
  relatedEntityIds: [],
  createdAt: '2026-08-04T10:00:00.000Z',
  updatedAt: '2026-08-04T10:00:00.000Z',
};

test('indexes document and section annotations by stable qualified targets', () => {
  const index = indexNoteTargets([note]);
  assert.deepEqual(index.byDocument.get('pack.example::doc.source'), [note]);
  assert.deepEqual(index.bySection.get('pack.example::doc.source/attachment'), [note]);
  const resolved = resolveNoteDocument([pack], note);
  assert.equal(resolved.document.title, 'Исходный файл');
  assert.equal(resolved.section.title, 'Файл для ручной разметки');
});

test('knowledge state exposes section annotations and search keeps the source context', () => {
  const state = buildKnowledgeState([pack], [note]);
  assert.deepEqual(state.sectionNotes.get('pack.example::doc.source/attachment'), [note]);
  const record = flattenKnowledge([pack], [note]).find((item) => item.id === 'note:note-1');
  assert.equal(record.documentId, 'pack.example::doc.source');
  assert.equal(record.documentTitle, 'Исходный файл');
  assert.equal(record.sectionId, 'attachment');
  assert.equal(record.sourceTitle, 'Файл для ручной разметки');
  assert.match(record.tags, /source-annotation/u);
});
