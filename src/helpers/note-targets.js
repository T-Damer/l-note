import { qualifyDocumentId } from './statement-conflicts.js';

function text(value) {
  return typeof value === 'string' ? value.trim() : '';
}

export function noteDocumentRef(note) {
  return text(note?.targetDocumentId);
}

export function noteSectionRef(note) {
  const documentRef = noteDocumentRef(note);
  const sectionId = documentRef ? text(note?.targetSectionId) : '';
  return documentRef && sectionId ? `${documentRef}/${sectionId}` : '';
}

function append(map, key, value) {
  if (!key) return;
  const values = map.get(key) ?? [];
  values.push(value);
  map.set(key, values);
}

export function indexNoteTargets(notes = []) {
  const byDocument = new Map();
  const bySection = new Map();
  for (const note of notes) {
    append(byDocument, noteDocumentRef(note), note);
    append(bySection, noteSectionRef(note), note);
  }
  return Object.freeze({ byDocument, bySection });
}

export function resolveNoteDocument(packs, note) {
  const requested = noteDocumentRef(note);
  if (!requested) return null;
  const qualified = requested.includes('::');
  for (const pack of packs ?? []) {
    const localId = qualified && requested.startsWith(`${pack.id}::`)
      ? requested.slice(pack.id.length + 2)
      : requested;
    const document = (pack.documents ?? []).find((item) => item.id === localId);
    if (!document) continue;
    const runtimeId = qualifyDocumentId(pack.id, document.id);
    if (qualified && runtimeId !== requested) continue;
    const section = note.targetSectionId
      ? (document.sections ?? []).find((item) => item.id === note.targetSectionId) ?? null
      : null;
    return Object.freeze({ pack, document, section, runtimeId });
  }
  return null;
}
