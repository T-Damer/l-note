export const SEARCH_ARTIFACT_SCHEMA_VERSION = 1;
export const SQLITE_FTS_ARTIFACT_PROFILE = 'sqlite-fts5-idb-v1';
export const MAX_SEARCH_ARTIFACT_BYTES = 256 * 1024 * 1024;

function text(value) {
  return String(value ?? '').trim();
}

function positiveInteger(value) {
  return Number.isInteger(value) && value > 0;
}

function storedArtifactFile(record, artifact) {
  const file = record?.searchArtifactFile;
  if (!file?.blob || typeof file.blob.arrayBuffer !== 'function') return null;
  if (file.sha256 !== artifact.sha256 || file.fingerprint !== artifact.fingerprint) return null;
  return file;
}

export function validateSearchArtifact(artifact, path = 'searchArtifact') {
  if (artifact === undefined) return [];
  if (!artifact || typeof artifact !== 'object' || Array.isArray(artifact)) {
    return [`${path} must be an object`];
  }
  const errors = [];
  if (artifact.schemaVersion !== SEARCH_ARTIFACT_SCHEMA_VERSION) {
    errors.push(`${path}.schemaVersion must be ${SEARCH_ARTIFACT_SCHEMA_VERSION}`);
  }
  if (artifact.profile !== SQLITE_FTS_ARTIFACT_PROFILE) {
    errors.push(`${path}.profile is unsupported`);
  }
  for (const field of ['url', 'sha256', 'fingerprint']) {
    if (!text(artifact[field])) errors.push(`${path}.${field} must be a non-empty string`);
  }
  if (artifact.sha256 && !/^[a-f0-9]{64}$/u.test(artifact.sha256)) {
    errors.push(`${path}.sha256 must be a lowercase SHA-256 digest`);
  }
  if (!positiveInteger(artifact.bytes) || artifact.bytes > MAX_SEARCH_ARTIFACT_BYTES) {
    errors.push(`${path}.bytes must be a positive integer not greater than ${MAX_SEARCH_ARTIFACT_BYTES}`);
  }
  if (!positiveInteger(artifact.recordCount)) {
    errors.push(`${path}.recordCount must be a positive integer`);
  }
  return errors;
}

export function selectSearchArtifact(packRecords = [], notes = [], corpusFingerprint = '') {
  const enabled = packRecords.filter((record) => record?.enabled !== false && record?.pack);
  if (enabled.length !== 1 || notes.length !== 0) return null;
  const record = enabled[0];
  const artifact = record.pack.searchArtifact;
  if (validateSearchArtifact(artifact).length || artifact.fingerprint !== corpusFingerprint) return null;
  const file = storedArtifactFile(record, artifact);
  if (!file) return null;
  return Object.freeze({
    ...artifact,
    sourceUrl: record.sourceUrl ?? null,
    blob: file.blob,
  });
}

export function resolveSearchArtifactUrl(artifact, fallbackBase = globalThis.location?.href) {
  const raw = text(artifact?.url);
  if (!raw) return '';
  try {
    const sourceBase = artifact?.sourceUrl
      ? new URL(artifact.sourceUrl, fallbackBase)
      : new URL(fallbackBase);
    return new URL(raw, sourceBase).href;
  } catch {
    return raw;
  }
}
