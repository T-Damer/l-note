import Dexie from 'dexie';

import { parseKnowledgeCatalog, parseKnowledgePack, UserNoteSchema } from './pack-schema.js';
import { sha256Hex } from './utils.js';

export const db = new Dexie('l-note-v1');

db.version(1).stores({
  packs: '&id, version, installedAt, updatedAt',
  records: '&key, packId, documentId, kind, updatedAt, *entityIds, *tags',
  entities: '&key, packId, id, name, *aliases, *tags',
  relations: '&key, packId, from, to, predicate, recordId',
  notes: '&id, updatedAt, relationType, linkedRecordKey, *entityIds, *tags',
  settings: '&key'
});

function recordKey(packId, recordId) {
  return `${packId}::record::${recordId}`;
}

function entityKey(packId, entityId) {
  return `${packId}::entity::${entityId}`;
}

function relationKey(packId, relationId) {
  return `${packId}::relation::${relationId}`;
}

export async function installKnowledgePack(rawPack, installation = {}) {
  const pack = parseKnowledgePack(rawPack);
  const now = new Date().toISOString();
  const packRow = {
    id: pack.id,
    version: pack.version,
    title: pack.title,
    description: pack.description,
    language: pack.language,
    createdAt: pack.createdAt,
    installedAt: installation.installedAt ?? now,
    updatedAt: now,
    source: pack.source,
    disclaimer: pack.disclaimer,
    tags: pack.tags,
    metadata: pack.metadata,
    artifact: installation.artifact ?? null,
    recordCount: pack.records.length,
    entityCount: pack.entities.length,
    relationCount: pack.relations.length
  };

  const records = pack.records.map((record) => ({
    ...record,
    key: recordKey(pack.id, record.id),
    packId: pack.id,
    packVersion: pack.version,
    packTitle: pack.title
  }));
  const entities = pack.entities.map((entity) => ({
    ...entity,
    key: entityKey(pack.id, entity.id),
    packId: pack.id,
    packVersion: pack.version,
    packTitle: pack.title
  }));
  const relations = pack.relations.map((relation) => ({
    ...relation,
    key: relationKey(pack.id, relation.id),
    packId: pack.id,
    packVersion: pack.version,
    packTitle: pack.title
  }));

  await db.transaction('rw', db.packs, db.records, db.entities, db.relations, async () => {
    await Promise.all([
      db.records.where('packId').equals(pack.id).delete(),
      db.entities.where('packId').equals(pack.id).delete(),
      db.relations.where('packId').equals(pack.id).delete()
    ]);
    await db.packs.put(packRow);
    if (records.length > 0) await db.records.bulkPut(records);
    if (entities.length > 0) await db.entities.bulkPut(entities);
    if (relations.length > 0) await db.relations.bulkPut(relations);
  });

  return packRow;
}

export async function removeKnowledgePack(packId) {
  await db.transaction('rw', db.packs, db.records, db.entities, db.relations, async () => {
    await Promise.all([
      db.packs.delete(packId),
      db.records.where('packId').equals(packId).delete(),
      db.entities.where('packId').equals(packId).delete(),
      db.relations.where('packId').equals(packId).delete()
    ]);
  });
}

export async function listInstalledPacks() {
  return db.packs.orderBy('installedAt').reverse().toArray();
}

export async function loadKnowledgeSnapshot() {
  const [packs, records, entities, relations, notes] = await Promise.all([
    db.packs.toArray(),
    db.records.toArray(),
    db.entities.toArray(),
    db.relations.toArray(),
    db.notes.toArray()
  ]);
  return { packs, records, entities, relations, notes };
}

export async function getRecord(recordKeyValue) {
  return db.records.get(recordKeyValue);
}

export async function getEntity(entityKeyValue) {
  return db.entities.get(entityKeyValue);
}

export async function getLinkedNotes(recordKeyValue) {
  if (!recordKeyValue) return [];
  return db.notes.where('linkedRecordKey').equals(recordKeyValue).reverse().sortBy('updatedAt');
}

export async function saveNote(rawNote) {
  const note = UserNoteSchema.parse(rawNote);
  await db.notes.put(note);
  return note;
}

export async function deleteNote(noteId) {
  await db.notes.delete(noteId);
}

export async function listNotes() {
  return db.notes.orderBy('updatedAt').reverse().toArray();
}

export async function getSetting(key, fallback = null) {
  const row = await db.settings.get(key);
  return row?.value ?? fallback;
}

export async function setSetting(key, value) {
  await db.settings.put({ key, value, updatedAt: new Date().toISOString() });
}

export async function fetchCatalog(catalogUrl = new URL('./catalog.json', window.location.href)) {
  const response = await fetch(catalogUrl, { cache: 'no-cache' });
  if (!response.ok) {
    throw new Error(`Не удалось загрузить каталог: HTTP ${response.status}`);
  }
  return {
    catalog: parseKnowledgeCatalog(await response.json()),
    catalogUrl: response.url || String(catalogUrl)
  };
}

export async function installPackFromCatalogEntry(entry, catalogUrl, onProgress = () => {}) {
  const artifactUrl = new URL(entry.artifact.url, catalogUrl);
  onProgress({ phase: 'download', message: 'Загрузка пакета…', progress: 0 });
  const response = await fetch(artifactUrl);
  if (!response.ok) {
    throw new Error(`Не удалось загрузить пакет: HTTP ${response.status}`);
  }

  const contentLength = Number(response.headers.get('content-length')) || entry.artifact.sizeBytes || null;
  let bytes;
  if (response.body && contentLength) {
    const reader = response.body.getReader();
    const chunks = [];
    let received = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
      received += value.length;
      onProgress({
        phase: 'download',
        message: 'Загрузка пакета…',
        progress: Math.min(1, received / contentLength),
        received,
        total: contentLength
      });
    }
    bytes = new Uint8Array(received);
    let offset = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.length;
    }
  } else {
    bytes = new Uint8Array(await response.arrayBuffer());
  }

  onProgress({ phase: 'verify', message: 'Проверка целостности…', progress: 1 });
  const digest = await sha256Hex(bytes);
  if (entry.artifact.sha256 && digest !== entry.artifact.sha256) {
    throw new Error('Контрольная сумма пакета не совпадает с каталогом. Установка остановлена.');
  }

  let rawPack;
  try {
    rawPack = JSON.parse(new TextDecoder().decode(bytes));
  } catch (error) {
    throw new Error(`Пакет содержит некорректный JSON: ${error.message}`);
  }
  if (rawPack.id !== entry.id || rawPack.version !== entry.version) {
    throw new Error('Идентификатор или версия пакета не совпадает с записью каталога.');
  }

  onProgress({ phase: 'install', message: 'Запись в локальную базу…', progress: 1 });
  return installKnowledgePack(rawPack, {
    artifact: {
      url: artifactUrl.href,
      sha256: digest,
      sizeBytes: bytes.byteLength
    }
  });
}

export async function importKnowledgePackFile(file) {
  const text = await file.text();
  let rawPack;
  try {
    rawPack = JSON.parse(text);
  } catch (error) {
    throw new Error(`Файл не является корректным JSON: ${error.message}`);
  }
  const digest = await sha256Hex(text);
  return installKnowledgePack(rawPack, {
    artifact: {
      url: null,
      sha256: digest,
      sizeBytes: file.size,
      importedName: file.name
    }
  });
}

export async function requestPersistentStorage() {
  if (!navigator.storage?.persist) return { supported: false, persisted: false };
  const alreadyPersisted = await navigator.storage.persisted();
  const persisted = alreadyPersisted || (await navigator.storage.persist());
  return { supported: true, persisted };
}

export async function getStorageEstimate() {
  if (!navigator.storage?.estimate) return null;
  return navigator.storage.estimate();
}

export async function clearAllLocalData() {
  await db.transaction(
    'rw',
    db.packs,
    db.records,
    db.entities,
    db.relations,
    db.notes,
    db.settings,
    async () => {
      await Promise.all([
        db.packs.clear(),
        db.records.clear(),
        db.entities.clear(),
        db.relations.clear(),
        db.notes.clear(),
        db.settings.clear()
      ]);
    }
  );
}
