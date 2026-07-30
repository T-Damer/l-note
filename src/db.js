import { flattenPack, validatePack } from './core.js';

const DexieConstructor = globalThis.Dexie;
if (!DexieConstructor) throw new Error('Dexie failed to load.');

export const db = new DexieConstructor('l-note');

db.version(1).stores({
  packs: '&id, title, installedAt, version',
  documents: '&pk, packId, id, title',
  chunks: '&pk, packId, documentId, sectionId, *entityIds',
  entities: '&pk, packId, id, name, *aliases',
  relations: '&pk, packId, from, to, predicate',
  claims: '&pk, packId, status, *subjectEntityIds',
  glossary: '&pk, packId, term, entityId',
  notes: '++id, updatedAt, relationType, linkedChunkPk, *entityIds',
  settings: '&key',
});

export async function installPack(pack, sourceUrl = null) {
  const stats = validatePack(pack);
  const packId = pack.manifest.id;
  const chunks = flattenPack(pack);
  const documents = pack.documents.map((document) => ({
    pk: `${packId}:${document.id}`,
    packId,
    id: document.id,
    title: document.title,
    summary: document.summary ?? '',
    source: document.source ?? null,
    authority: document.authority ?? 'unknown',
    sections: document.sections,
  }));
  const entities = pack.entities.map((entity) => ({
    ...entity,
    pk: `${packId}:${entity.id}`,
    packId,
    aliases: entity.aliases ?? [],
  }));
  const relations = pack.relations.map((relation) => ({
    ...relation,
    pk: `${packId}:${relation.id}`,
    packId,
  }));
  const claims = pack.claims.map((claim) => ({
    ...claim,
    pk: `${packId}:${claim.id}`,
    packId,
    subjectEntityIds: claim.subjectEntityIds ?? [],
  }));
  const glossary = pack.glossary.map((entry, index) => ({
    ...entry,
    pk: `${packId}:${entry.id ?? `glossary-${index}`}`,
    packId,
  }));

  await db.transaction(
    'rw',
    db.packs,
    db.documents,
    db.chunks,
    db.entities,
    db.relations,
    db.claims,
    db.glossary,
    async () => {
      await removePackData(packId, false);
      await db.packs.put({
        id: packId,
        title: pack.manifest.title,
        description: pack.manifest.description ?? '',
        version: pack.manifest.version,
        language: pack.manifest.language ?? 'und',
        domains: pack.manifest.domains ?? [],
        tags: pack.manifest.tags ?? [],
        license: pack.manifest.license ?? null,
        source: pack.manifest.source ?? null,
        sourceUrl,
        installedAt: new Date().toISOString(),
        stats,
      });
      if (documents.length) await db.documents.bulkPut(documents);
      if (chunks.length) await db.chunks.bulkPut(chunks);
      if (entities.length) await db.entities.bulkPut(entities);
      if (relations.length) await db.relations.bulkPut(relations);
      if (claims.length) await db.claims.bulkPut(claims);
      if (glossary.length) await db.glossary.bulkPut(glossary);
    },
  );
  return stats;
}

async function removePackData(packId, includeManifest = true) {
  await Promise.all([
    db.documents.where('packId').equals(packId).delete(),
    db.chunks.where('packId').equals(packId).delete(),
    db.entities.where('packId').equals(packId).delete(),
    db.relations.where('packId').equals(packId).delete(),
    db.claims.where('packId').equals(packId).delete(),
    db.glossary.where('packId').equals(packId).delete(),
    includeManifest ? db.packs.delete(packId) : Promise.resolve(),
  ]);
}

export async function removePack(packId) {
  await db.transaction(
    'rw',
    db.packs,
    db.documents,
    db.chunks,
    db.entities,
    db.relations,
    db.claims,
    db.glossary,
    () => removePackData(packId, true),
  );
}

export function listInstalledPacks() {
  return db.packs.orderBy('title').toArray();
}

export function getChunks(packIds = null) {
  return packIds?.length ? db.chunks.where('packId').anyOf(packIds).toArray() : db.chunks.toArray();
}

export function getEntities(packIds = null) {
  return packIds?.length ? db.entities.where('packId').anyOf(packIds).toArray() : db.entities.toArray();
}

export function getGlossary(packIds = null) {
  return packIds?.length ? db.glossary.where('packId').anyOf(packIds).toArray() : db.glossary.toArray();
}

export function getRelations(packIds = null) {
  return packIds?.length ? db.relations.where('packId').anyOf(packIds).toArray() : db.relations.toArray();
}

export function getClaims(packIds = null) {
  return packIds?.length ? db.claims.where('packId').anyOf(packIds).toArray() : db.claims.toArray();
}

export function listNotes() {
  return db.notes.orderBy('updatedAt').reverse().toArray();
}

export async function saveNote(note) {
  const record = {
    title: note.title.trim(),
    body: note.body.trim(),
    relationType: note.relationType ?? 'observation',
    linkedChunkPk: note.linkedChunkPk || null,
    entityIds: note.entityIds ?? [],
    createdAt: note.createdAt ?? new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  if (note.id) {
    await db.notes.put({ ...record, id: Number(note.id) });
    return Number(note.id);
  }
  return db.notes.add(record);
}

export function deleteNote(id) {
  return db.notes.delete(Number(id));
}

export async function getEntityContext(entityId) {
  const [entities, chunks, relations, claims, notes] = await Promise.all([
    db.entities.filter((entity) => entity.id === entityId).toArray(),
    db.chunks.where('entityIds').equals(entityId).toArray(),
    db.relations.filter((relation) => relation.from === entityId || relation.to === entityId).toArray(),
    db.claims.filter((claim) => (claim.subjectEntityIds ?? []).includes(entityId)).toArray(),
    db.notes.where('entityIds').equals(entityId).toArray(),
  ]);
  return { entity: entities[0] ?? null, chunks, relations, claims, notes };
}

export async function exportWorkspace() {
  const [packs, notes, settings] = await Promise.all([
    db.packs.toArray(),
    db.notes.toArray(),
    db.settings.toArray(),
  ]);
  return {
    format: 'l-note-workspace',
    schemaVersion: 1,
    exportedAt: new Date().toISOString(),
    packs,
    notes,
    settings,
  };
}
