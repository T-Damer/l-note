import { validatePrebuiltSearchArtifacts } from '../../src/helpers/prebuilt-search-artifacts.js';
import { validateStatementRelations } from '../../src/helpers/statement-conflicts.js';
import { validateStatementSelections } from '../../src/helpers/statement-selections.js';

const PACK_SCHEMA_VERSION = 1;

function isObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function requireString(value, path, errors) {
  if (typeof value !== 'string' || value.trim().length === 0) {
    errors.push(`${path} must be a non-empty string`);
  }
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

function validationError(errors, label) {
  return new Error(`${label} validation failed:\n- ${errors.join('\n- ')}`);
}

function validateBaseShape(pack, errors) {
  if (!isObject(pack)) {
    errors.push('pack must be an object');
    return;
  }
  if (pack.schemaVersion !== PACK_SCHEMA_VERSION) {
    errors.push(`schemaVersion must be ${PACK_SCHEMA_VERSION}`);
  }
  for (const field of ['id', 'version', 'title', 'description', 'language']) {
    requireString(pack[field], field, errors);
  }
  if (!Array.isArray(pack.entities)) errors.push('entities must be an array');
  if (!Array.isArray(pack.claims)) errors.push('claims must be an array');
  if (!Array.isArray(pack.relations)) errors.push('relations must be an array');
}

function validateEntities(entities, errors) {
  const ids = new Set();
  for (const [index, entity] of entities.entries()) {
    requireString(entity?.id, `entities[${index}].id`, errors);
    requireString(entity?.name, `entities[${index}].name`, errors);
    if (entity?.id && ids.has(entity.id)) errors.push(`duplicate entity id: ${entity.id}`);
    if (entity?.id) ids.add(entity.id);
    if (entity?.aliases !== undefined && !Array.isArray(entity.aliases)) {
      errors.push(`entities[${index}].aliases must be an array`);
    }
  }
  return ids;
}

function validateClaims(claims, entityIds, errors) {
  const ids = new Set();
  for (const [index, claim] of claims.entries()) {
    requireString(claim?.id, `claims[${index}].id`, errors);
    requireString(claim?.text, `claims[${index}].text`, errors);
    if (claim?.id && ids.has(claim.id)) errors.push(`duplicate claim id: ${claim.id}`);
    if (claim?.id) ids.add(claim.id);
    if (claim?.subjectId && !entityIds.has(claim.subjectId)) {
      errors.push(`claim ${claim.id} references unknown subject ${claim.subjectId}`);
    }
    if (claim?.objectId && !entityIds.has(claim.objectId)) {
      errors.push(`claim ${claim.id} references unknown object ${claim.objectId}`);
    }
  }
  return ids;
}

function validateRelations(relations, entityIds, errors) {
  for (const [index, relation] of relations.entries()) {
    requireString(relation?.sourceId, `relations[${index}].sourceId`, errors);
    requireString(relation?.targetId, `relations[${index}].targetId`, errors);
    if (!relation?.predicate && !relation?.type) {
      errors.push(`relations[${index}].predicate must be a non-empty string`);
    }
    if (relation?.sourceId && !entityIds.has(relation.sourceId)) {
      errors.push(`relation references unknown source ${relation.sourceId}`);
    }
    if (relation?.targetId && !entityIds.has(relation.targetId)) {
      errors.push(`relation references unknown target ${relation.targetId}`);
    }
  }
}

function claimSourceIndex(claims) {
  const bySection = new Map();
  for (const claim of claims) {
    const documentId = claim?.source?.documentId;
    const sectionId = claim?.source?.sectionId;
    if (!documentId || !sectionId) continue;
    const key = `${documentId}/${sectionId}`;
    const values = bySection.get(key) ?? [];
    values.push(claim);
    bySection.set(key, values);
  }
  return bySection;
}

export function createStreamingPackValidator(pack, { label = 'Pack' } = {}) {
  const errors = [];
  validateBaseShape(pack, errors);
  const entities = Array.isArray(pack?.entities) ? pack.entities : [];
  const claims = Array.isArray(pack?.claims) ? pack.claims : [];
  const relations = Array.isArray(pack?.relations) ? pack.relations : [];
  const entityIds = validateEntities(entities, errors);
  validateClaims(claims, entityIds, errors);
  validateRelations(relations, entityIds, errors);
  errors.push(...validatePrebuiltSearchArtifacts(pack));
  errors.push(...validateStatementRelations(pack));
  errors.push(...validateStatementSelections(pack));

  const documentIds = new Set();
  const sectionIds = new Set();
  const claimsBySection = claimSourceIndex(claims);
  let documentCount = 0;

  function assertBaseValid() {
    if (errors.length) throw validationError(errors, label);
  }

  function addDocument(document, index = documentCount) {
    documentCount += 1;
    requireString(document?.id, `documents[${index}].id`, errors);
    requireString(document?.title, `documents[${index}].title`, errors);
    validateDocumentAsset(document?.asset, `documents[${index}].asset`, errors);
    if (document?.id && documentIds.has(document.id)) {
      errors.push(`duplicate document id: ${document.id}`);
    }
    if (document?.id) documentIds.add(document.id);
    if (!Array.isArray(document?.sections) || document.sections.length === 0) {
      errors.push(`documents[${index}].sections must be a non-empty array`);
      return;
    }
    for (const [sectionIndex, section] of document.sections.entries()) {
      requireString(section?.id, `documents[${index}].sections[${sectionIndex}].id`, errors);
      requireString(section?.title, `documents[${index}].sections[${sectionIndex}].title`, errors);
      requireString(section?.text, `documents[${index}].sections[${sectionIndex}].text`, errors);
      validateAssetAnchor(
        section?.assetAnchor,
        `documents[${index}].sections[${sectionIndex}].assetAnchor`,
        errors,
      );
      const key = `${document?.id}/${section?.id}`;
      if (sectionIds.has(key)) errors.push(`duplicate section id within document: ${key}`);
      sectionIds.add(key);
      if (section?.entityIds !== undefined && !Array.isArray(section.entityIds)) {
        errors.push(`documents[${index}].sections[${sectionIndex}].entityIds must be an array`);
      }
      for (const entityId of section?.entityIds ?? []) {
        if (!entityIds.has(entityId)) errors.push(`section ${key} references unknown entity ${entityId}`);
      }
      for (const claim of claimsBySection.get(key) ?? []) {
        if (typeof claim?.source?.quote === 'string'
          && typeof section?.text === 'string'
          && !section.text.includes(claim.source.quote)) {
          errors.push(`claim ${claim.id} evidence quote is not an exact substring`);
        }
      }
    }
  }

  function finalize() {
    for (const claim of claims) {
      if (!documentIds.has(claim?.source?.documentId)) {
        errors.push(`claim ${claim?.id} references unknown document`);
      }
      if (claim?.source?.documentId
        && claim?.source?.sectionId
        && !sectionIds.has(`${claim.source.documentId}/${claim.source.sectionId}`)) {
        errors.push(`claim ${claim.id} references unknown section`);
      }
    }
    if (errors.length) throw validationError(errors, label);
    return {
      valid: true,
      documents: documentCount,
      sections: sectionIds.size,
      entities: entities.length,
      claims: claims.length,
      relations: relations.length,
    };
  }

  return Object.freeze({
    addDocument,
    assertBaseValid,
    finalize,
  });
}
