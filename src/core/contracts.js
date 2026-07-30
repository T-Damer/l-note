export const LNOTE_CONTRACT_VERSION = '0.1.0';
export const KNOWLEDGE_PACK_SCHEMA_VERSION = 1;

export const KNOWLEDGE_RESOURCE_TYPES = Object.freeze([
  'package',
  'document',
  'concept',
  'statement',
  'note',
]);

export const PERSONAL_NOTE_RELATIONS = Object.freeze([
  'observation',
  'supports',
  'refines',
  'contradicts',
  'supersedes',
]);

export function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function requireString(value, path, errors) {
  if (typeof value !== 'string' || value.trim().length === 0) {
    errors.push(`${path} must be a non-empty string`);
  }
}

/**
 * Fast public-boundary validation. Referential integrity and exact evidence
 * checks remain in the pack compiler/runtime validator.
 */
export function validateKnowledgePackContract(pack) {
  const errors = [];
  if (!isRecord(pack)) return { valid: false, errors: ['pack must be an object'] };
  if (pack.schemaVersion !== KNOWLEDGE_PACK_SCHEMA_VERSION) {
    errors.push(`schemaVersion must be ${KNOWLEDGE_PACK_SCHEMA_VERSION}`);
  }
  for (const field of ['id', 'version', 'title', 'description', 'language']) {
    requireString(pack[field], field, errors);
  }
  for (const field of ['documents', 'entities', 'claims', 'relations']) {
    if (!Array.isArray(pack[field])) errors.push(`${field} must be an array`);
  }
  return { valid: errors.length === 0, errors };
}

export function validateSearchResultContract(result) {
  const errors = [];
  if (!isRecord(result)) return { valid: false, errors: ['search result must be an object'] };
  for (const field of ['id', 'kind', 'title', 'body']) requireString(result[field], field, errors);
  if (result.relevance !== undefined) {
    if (!Number.isInteger(result.relevance) || result.relevance < 0 || result.relevance > 100) {
      errors.push('relevance must be an integer from 0 to 100');
    }
  }
  return { valid: errors.length === 0, errors };
}

export function createEvidenceEnvelope({ query, sources = [], relatedNotes = [], conflicts = [] }) {
  if (typeof query !== 'string' || query.trim().length === 0) {
    throw new TypeError('Evidence query must be a non-empty string.');
  }
  for (const [name, value] of Object.entries({ sources, relatedNotes, conflicts })) {
    if (!Array.isArray(value)) throw new TypeError(`Evidence ${name} must be an array.`);
  }
  return {
    contractVersion: LNOTE_CONTRACT_VERSION,
    query: query.trim(),
    sources,
    relatedNotes,
    conflicts,
  };
}
