export const PREBUILT_SQLITE_ARTIFACT_KIND = 'sqlite-fts5';
export const PREBUILT_SEARCH_ARTIFACT_VERSION = 1;
export const MAX_PREBUILT_SEARCH_ARTIFACT_BYTES = 256 * 1024 * 1024;

const SHA256_HEX = /^[a-f0-9]{64}$/u;

function isObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function nonEmpty(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function positiveInteger(value) {
  return Number.isInteger(value) && value > 0;
}

export function validatePrebuiltSearchArtifacts(pack) {
  const errors = [];
  if (pack?.searchArtifacts === undefined) return errors;
  if (!Array.isArray(pack.searchArtifacts)) return ['searchArtifacts must be an array'];

  const ids = new Set();
  for (const [index, artifact] of pack.searchArtifacts.entries()) {
    const path = `searchArtifacts[${index}]`;
    if (!isObject(artifact)) {
      errors.push(`${path} must be an object`);
      continue;
    }
    if (!nonEmpty(artifact.id)) errors.push(`${path}.id must be a non-empty string`);
    if (artifact.id && ids.has(artifact.id)) errors.push(`duplicate search artifact id: ${artifact.id}`);
    if (artifact.id) ids.add(artifact.id);
    if (artifact.kind !== PREBUILT_SQLITE_ARTIFACT_KIND) {
      errors.push(`${path}.kind must be ${PREBUILT_SQLITE_ARTIFACT_KIND}`);
    }
    if (artifact.formatVersion !== PREBUILT_SEARCH_ARTIFACT_VERSION) {
      errors.push(`${path}.formatVersion must be ${PREBUILT_SEARCH_ARTIFACT_VERSION}`);
    }
    for (const field of ['runtime', 'url', 'corpusFingerprint']) {
      if (!nonEmpty(artifact[field])) errors.push(`${path}.${field} must be a non-empty string`);
    }
    if (!SHA256_HEX.test(String(artifact.sha256 ?? ''))) {
      errors.push(`${path}.sha256 must be a lowercase SHA-256 hex digest`);
    }
    if (!positiveInteger(artifact.bytes) || artifact.bytes > MAX_PREBUILT_SEARCH_ARTIFACT_BYTES) {
      errors.push(`${path}.bytes must be a positive integer not greater than ${MAX_PREBUILT_SEARCH_ARTIFACT_BYTES}`);
    }
    if (!positiveInteger(artifact.recordCount)) {
      errors.push(`${path}.recordCount must be a positive integer`);
    }
  }
  return errors;
}

function matchingStoredFile(record, descriptor) {
  return (record.searchArtifactFiles ?? []).find((file) => (
    file?.id === descriptor.id
    && file?.sha256 === descriptor.sha256
    && file?.corpusFingerprint === descriptor.corpusFingerprint
    && file?.blob
    && typeof file.blob.arrayBuffer === 'function'
  ));
}

export function selectPrebuiltSearchArtifact({
  packRecords = [],
  notes = [],
  corpusFingerprint = '',
} = {}) {
  const records = (packRecords ?? [])
    .filter((record) => record?.enabled !== false && record?.pack);
  if (records.length !== 1 || (notes?.length ?? 0) !== 0 || !corpusFingerprint) return null;
  const record = records[0];
  const descriptor = (record.pack.searchArtifacts ?? []).find((artifact) => (
    artifact?.kind === PREBUILT_SQLITE_ARTIFACT_KIND
    && artifact?.formatVersion === PREBUILT_SEARCH_ARTIFACT_VERSION
    && artifact?.corpusFingerprint === corpusFingerprint
  ));
  if (!descriptor) return null;
  const stored = matchingStoredFile(record, descriptor);
  if (!stored) return null;
  return Object.freeze({
    ...descriptor,
    blob: stored.blob,
  });
}

export function resolvePrebuiltSearchArtifactUrl(descriptor, sourceUrl, fallbackBase) {
  const raw = String(descriptor?.url ?? '').trim();
  if (!raw) return '';
  try {
    const fallback = fallbackBase ?? globalThis.location?.href;
    const base = sourceUrl ? new URL(sourceUrl, fallback) : new URL(fallback);
    return new URL(raw, base).href;
  } catch {
    return raw;
  }
}
