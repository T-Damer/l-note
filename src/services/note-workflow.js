const NOTE_RELATION_VALUES = Object.freeze([
  'observation',
  'refines',
  'contradicts',
  'supports',
  'supersedes',
]);
const NOTE_RELATIONS = new Set(NOTE_RELATION_VALUES);

function textValue(value, limit) {
  return typeof value === 'string' ? value.trim().slice(0, limit) : '';
}

function timestamp(value, fallback) {
  return typeof value === 'string' && value.trim() ? value : fallback;
}

function defaultCreateId() {
  if (typeof globalThis.crypto?.randomUUID === 'function') return globalThis.crypto.randomUUID();
  throw new TypeError('createId is required when crypto.randomUUID is unavailable.');
}

export function normalizeNoteRelation(value) {
  return NOTE_RELATIONS.has(value) ? value : 'observation';
}

export function normalizeRelatedEntityIds(value) {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.filter((id) => typeof id === 'string' && id.trim()))];
}

export function normalizeNoteTarget(draft = {}) {
  const targetClaimId = textValue(draft.targetClaimId, 240) || null;
  const targetDocumentId = textValue(draft.targetDocumentId, 240) || null;
  const targetSectionId = targetDocumentId ? textValue(draft.targetSectionId, 240) || null : null;
  return { targetClaimId, targetDocumentId, targetSectionId };
}

export function createNoteRecord({
  draft = {},
  previous = null,
  relatedEntityIds = [],
  now = new Date().toISOString(),
  createId = defaultCreateId,
  relationLabel = (relation) => relation,
  preserveUpdatedAt = false,
} = {}) {
  const title = textValue(draft.title, 160);
  const body = textValue(draft.body, 12000);
  if (!title || !body) throw new TypeError('A note requires a title and body.');

  const relation = normalizeNoteRelation(draft.relation);
  const suppliedId = textValue(draft.id, 160);
  const target = normalizeNoteTarget(draft);
  return Object.freeze({
    id: previous?.id ?? (suppliedId || createId()),
    title,
    body,
    relation,
    relationLabel: relationLabel(relation),
    ...target,
    relatedEntityIds: normalizeRelatedEntityIds(relatedEntityIds),
    createdAt: timestamp(previous?.createdAt ?? draft.createdAt, now),
    updatedAt: preserveUpdatedAt ? timestamp(draft.updatedAt, now) : now,
  });
}

export function normalizeImportedNotes(payload, options = {}) {
  const notes = Array.isArray(payload) ? payload : payload?.notes;
  if (!Array.isArray(notes)) throw new TypeError('Файл не содержит массива notes.');

  const now = options.now ?? new Date().toISOString();
  const records = [];
  for (const input of notes) {
    if (!input || typeof input.title !== 'string' || typeof input.body !== 'string') continue;
    records.push(createNoteRecord({
      draft: input,
      relatedEntityIds: input.relatedEntityIds,
      now,
      createId: options.createId,
      relationLabel: options.relationLabel,
      preserveUpdatedAt: true,
    }));
  }
  return records;
}

export const noteRelations = NOTE_RELATION_VALUES;
