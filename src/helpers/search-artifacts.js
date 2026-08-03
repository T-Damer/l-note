export const SEARCH_ARTIFACT_SCHEMA_VERSION = 1;
export const SQLITE_FTS_ARTIFACT_PROFILE = 'sqlite-fts5-idb-v1';

function text(value) {
  return String(value ?? '').trim();
}

function positiveInteger(value) {
  return Number.isInteger(value) && value > 0;
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
  if (artifact.sha256 && !/^[a-f0-9]{64}$/iu.test(artifact.sha256)) {
    errors.push(`${path}.sha256 must be a 64-character hexadecimal digest`);
  }
  if (!positiveInteger(artifact.bytes)) errors.push(`${path}.bytes must be a positive integer`);
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
  if (validateSearchArtifact(artifact).length) return null;
  if (artifact.fingerprint !== corpusFingerprint) return null;
  return Object.freeze({
    ...artifact,
    packId: record.pack.id,
    packVersion: record.pack.version,
    sourceUrl: record.sourceUrl ?? null,
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
