import { validateStatementRelations } from './helpers/statement-conflicts.js';

const PACK_SCHEMA_VERSION = 1;

function isObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function requireString(value, path, errors) {
  if (typeof value !== 'string' || value.trim().length === 0) errors.push(`${path} must be a non-empty string`);
}

function requirePositiveInteger(value, path, errors) {
  if (!Number.isInteger(value) || value < 1) errors.push(`${path} must be a positive integer`);
}

function validateDocumentAsset(asset, path, errors) {
  if (asset === undefined) return;
  if (!isObject(asset)) {
    errors.push(`${path} must be an object`);
    return;
  }
  requireString(asset.url, `${path}.url`, errors);
  requireString(asset.mimeType, `${path}.mimeType`, errors);
  if (asset.title !== undefined) requireString(asset.title, `${path}.title`, errors);
  if (asset.page !== undefined) requirePositiveInteger(asset.page, `${path}.page`, errors);
}

function validateAssetAnchor(anchor, path, errors) {
  if (anchor === undefined) return;
  if (!isObject(anchor)) {
    errors.push(`${path} must be an object`);
    return;
  }
  requirePositiveInteger(anchor.page, `${path}.page`, errors);
}

export function validatePack(pack) {
  const errors = [];
  if (!isObject(pack)) return { valid: false, errors: ['pack must be an object'] };
  if (pack.schemaVersion !== PACK_SCHEMA_VERSION) errors.push(`schemaVersion must be ${PACK_SCHEMA_VERSION}`);
  for (const field of ['id', 'version', 'title', 'description', 'language']) requireString(pack[field], field, errors);
  if (!Array.isArray(pack.documents)) errors.push('documents must be an array');
  if (!Array.isArray(pack.entities)) errors.push('entities must be an array');
  if (!Array.isArray(pack.claims)) errors.push('claims must be an array');
  if (!Array.isArray(pack.relations)) errors.push('relations must be an array');

  const documentIds = new Set();
  const sectionIds = new Set();
  const entityIds = new Set();
  const claimIds = new Set();

  for (const [index, entity] of (pack.entities ?? []).entries()) {
    requireString(entity?.id, `entities[${index}].id`, errors);
    requireString(entity?.name, `entities[${index}].name`, errors);
    if (entity?.id && entityIds.has(entity.id)) errors.push(`duplicate entity id: ${entity.id}`);
    if (entity?.id) entityIds.add(entity.id);
    if (entity?.aliases !== undefined && !Array.isArray(entity.aliases)) errors.push(`entities[${index}].aliases must be an array`);
  }

  for (const [index, document] of (pack.documents ?? []).entries()) {
    requireString(document?.id, `documents[${index}].id`, errors);
    requireString(document?.title, `documents[${index}].title`, errors);
    validateDocumentAsset(document?.asset, `documents[${index}].asset`, errors);
    if (document?.id && documentIds.has(document.id)) errors.push(`duplicate document id: ${document.id}`);
    if (document?.id) documentIds.add(document.id);
    if (!Array.isArray(document?.sections) || document.sections.length === 0) {
      errors.push(`documents[${index}].sections must be a non-empty array`);
      continue;
    }
    for (const [sectionIndex, section] of document.sections.entries()) {
      requireString(section?.id, `documents[${index}].sections[${sectionIndex}].id`, errors);
      requireString(section?.title, `documents[${index}].sections[${sectionIndex}].title`, errors);
      requireString(section?.text, `documents[${index}].sections[${sectionIndex}].text`, errors);
      validateAssetAnchor(section?.assetAnchor, `documents[${index}].sections[${sectionIndex}].assetAnchor`, errors);
      const key = `${document.id}/${section?.id}`;
      if (sectionIds.has(key)) errors.push(`duplicate section id within document: ${key}`);
      sectionIds.add(key);
      if (section?.entityIds !== undefined && !Array.isArray(section.entityIds)) {
        errors.push(`documents[${index}].sections[${sectionIndex}].entityIds must be an array`);
      }
      for (const entityId of section?.entityIds ?? []) {
        if (!entityIds.has(entityId)) errors.push(`section ${key} references unknown entity ${entityId}`);
      }
    }
  }

  for (const [index, claim] of (pack.claims ?? []).entries()) {
    requireString(claim?.id, `claims[${index}].id`, errors);
    requireString(claim?.text, `claims[${index}].text`, errors);
    if (claim?.id && claimIds.has(claim.id)) errors.push(`duplicate claim id: ${claim.id}`);
    if (claim?.id) claimIds.add(claim.id);
    if (claim?.subjectId && !entityIds.has(claim.subjectId)) errors.push(`claim ${claim.id} references unknown subject ${claim.subjectId}`);
    if (claim?.objectId && !entityIds.has(claim.objectId)) errors.push(`claim ${claim.id} references unknown object ${claim.objectId}`);
    if (!documentIds.has(claim?.source?.documentId)) errors.push(`claim ${claim.id} references unknown document`);
    if (claim?.source?.documentId && claim?.source?.sectionId && !sectionIds.has(`${claim.source.documentId}/${claim.source.sectionId}`)) {
      errors.push(`claim ${claim.id} references unknown section`);
    }
    if (typeof claim?.source?.quote === 'string') {
      const document = (pack.documents ?? []).find((item) => item.id === claim.source.documentId);
      const section = document?.sections?.find((item) => item.id === claim.source.sectionId);
      if (section && !section.text.includes(claim.source.quote)) errors.push(`claim ${claim.id} evidence quote is not an exact substring`);
    }
  }

  for (const [index, relation] of (pack.relations ?? []).entries()) {
    requireString(relation?.sourceId, `relations[${index}].sourceId`, errors);
    requireString(relation?.targetId, `relations[${index}].targetId`, errors);
    if (!relation?.predicate && !relation?.type) errors.push(`relations[${index}].predicate must be a non-empty string`);
    if (relation?.sourceId && !entityIds.has(relation.sourceId)) errors.push(`relation references unknown source ${relation.sourceId}`);
    if (relation?.targetId && !entityIds.has(relation.targetId)) errors.push(`relation references unknown target ${relation.targetId}`);
  }

  errors.push(...validateStatementRelations(pack));
  return { valid: errors.length === 0, errors };
}

export function packByteSize(pack) {
  return new TextEncoder().encode(JSON.stringify(pack)).byteLength;
}

export function buildKnowledgeState(packs, notes = []) {
  const documents = new Map();
  const sections = new Map();
  const entities = new Map();
  const claims = new Map();
  const relations = [];
  const entityMentions = new Map();
  const claimNotes = new Map();

  for (const pack of packs) {
    for (const entity of pack.entities ?? []) {
      const existing = entities.get(entity.id);
      if (!existing) entities.set(entity.id, { ...entity, packIds: [pack.id] });
      else {
        existing.packIds = [...new Set([...existing.packIds, pack.id])];
        existing.aliases = [...new Set([...(existing.aliases ?? []), ...(entity.aliases ?? [])])];
        if (!existing.description && entity.description) existing.description = entity.description;
      }
    }
    for (const document of pack.documents ?? []) {
      const enrichedDocument = { ...document, packId: pack.id, packTitle: pack.title };
      documents.set(document.id, enrichedDocument);
      for (const section of document.sections ?? []) {
        const sectionKey = `${document.id}/${section.id}`;
        sections.set(sectionKey, { ...section, documentId: document.id, packId: pack.id });
        for (const entityId of section.entityIds ?? []) {
          const mentions = entityMentions.get(entityId) ?? [];
          mentions.push({ packId: pack.id, documentId: document.id, sectionId: section.id });
          entityMentions.set(entityId, mentions);
        }
      }
    }
    for (const claim of pack.claims ?? []) claims.set(claim.id, { ...claim, packId: pack.id });
    for (const relation of pack.relations ?? []) relations.push({ ...relation, packId: pack.id });
  }

  for (const note of notes) {
    if (!note.targetClaimId) continue;
    const linked = claimNotes.get(note.targetClaimId) ?? [];
    linked.push(note);
    claimNotes.set(note.targetClaimId, linked);
  }

  return { packs, notes, documents, sections, entities, claims, relations, entityMentions, claimNotes };
}

export function flattenKnowledge(packs, notes = []) {
  const records = [];
  for (const pack of packs) {
    const entityById = new Map((pack.entities ?? []).map((entity) => [entity.id, entity]));
    const claimsBySection = new Map();
    for (const claim of pack.claims ?? []) {
      const key = `${claim.source?.documentId}/${claim.source?.sectionId}`;
      const values = claimsBySection.get(key) ?? [];
      values.push(claim.id);
      claimsBySection.set(key, values);
    }
    for (const document of pack.documents ?? []) {
      for (const section of document.sections ?? []) {
        const entities = (section.entityIds ?? []).map((id) => entityById.get(id)).filter(Boolean);
        records.push({
          id: `section:${pack.id}:${document.id}:${section.id}`,
          kind: 'section',
          packId: pack.id,
          packTitle: pack.title,
          documentId: document.id,
          documentTitle: document.title,
          sectionId: section.id,
          title: section.title,
          body: section.text,
          aliases: entities.flatMap((entity) => [entity.name, ...(entity.aliases ?? [])]).join(' '),
          entityNames: entities.map((entity) => entity.name).join(' '),
          entityIds: section.entityIds ?? [],
          tags: [...(pack.tags ?? []), ...(document.tags ?? []), ...(section.tags ?? [])].join(' '),
          authority: document.authority ?? 'reference',
          effectiveFrom: document.effectiveFrom ?? null,
          sourceTitle: document.source?.title ?? document.title,
          claimIds: claimsBySection.get(`${document.id}/${section.id}`) ?? [],
        });
      }
    }
  }

  for (const note of notes) {
    records.push({
      id: `note:${note.id}`,
      kind: 'note',
      noteId: note.id,
      packId: 'personal',
      packTitle: 'Личные заметки',
      documentTitle: note.relationLabel ?? 'Личная заметка',
      title: note.title,
      body: note.body,
      aliases: '',
      entityNames: '',
      entityIds: note.relatedEntityIds ?? [],
      tags: `personal ${note.relation ?? 'observation'}`,
      authority: 'personal',
      relation: note.relation ?? 'observation',
      effectiveFrom: note.updatedAt,
      sourceTitle: 'Локальная заметка',
      claimIds: note.targetClaimId ? [note.targetClaimId] : [],
    });
  }
  return records;
}

export function findDocumentForSection(state, record) {
  return record.documentId ? state.documents.get(record.documentId) : undefined;
}

export function relationLabel(relation) {
  return {
    observation: 'Практическое наблюдение',
    refines: 'Уточняет справочник',
    contradicts: 'Противоречит справочнику',
    supports: 'Поддерживает справочник',
    supersedes: 'Локально заменяет',
  }[relation] ?? 'Практическое наблюдение';
}

export function safePackFilename(pack) {
  return `${pack.id.replace(/[^a-z0-9._-]+/giu, '-')}-${pack.version.replace(/[^a-z0-9._-]+/giu, '-')}.json`;
}
