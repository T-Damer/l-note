import {
  MAX_PREBUILT_SEARCH_ARTIFACT_BYTES,
  PREBUILT_SEARCH_ARTIFACT_VERSION,
  PREBUILT_SQLITE_ARTIFACT_KIND,
} from '../helpers/prebuilt-search-artifacts.js';
import { SQLITE_FTS_RUNTIME_VERSION } from '../helpers/sqlite-fts.js';

const SQLITE_HEADER_BYTES = 32;
const SQLITE_MAGIC = new TextEncoder().encode('SQLite format 3\0');

function firstValue(row) {
  return row ? Object.values(row)[0] : null;
}

async function sha256Hex(buffer) {
  const digest = await crypto.subtle.digest('SHA-256', buffer);
  return [...new Uint8Array(digest)]
    .map((value) => value.toString(16).padStart(2, '0'))
    .join('');
}

function sqliteFileLayout(buffer) {
  const bytes = new Uint8Array(buffer);
  if (bytes.byteLength < SQLITE_HEADER_BYTES) throw new Error('Prebuilt search file is truncated.');
  for (let index = 0; index < SQLITE_MAGIC.length; index += 1) {
    if (bytes[index] !== SQLITE_MAGIC[index]) throw new Error('Prebuilt search file is not SQLite.');
  }
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const rawPageSize = view.getUint16(16);
  const pageSize = rawPageSize === 1 ? 65_536 : rawPageSize;
  const pageCount = view.getUint32(28);
  const databaseBytes = pageSize * pageCount;
  if (!pageSize || !pageCount || databaseBytes !== bytes.byteLength) {
    throw new Error('Prebuilt search file has an invalid SQLite page layout.');
  }
  return { bytes, pageSize, pageCount };
}

export function sqliteImportStream(buffer) {
  const { bytes, pageSize, pageCount } = sqliteFileLayout(buffer);
  return new ReadableStream({
    start(controller) {
      // sqlite-wasm 1.3.1 verifies a separate 32-byte header and then reads
      // every complete page. Supplying both prevents its reader from dropping
      // the remainder of the first browser stream chunk.
      controller.enqueue(bytes.slice(0, SQLITE_HEADER_BYTES));
      for (let page = 0; page < pageCount; page += 1) {
        const offset = page * pageSize;
        controller.enqueue(bytes.slice(offset, offset + pageSize));
      }
      controller.close();
    },
  });
}

async function artifactBuffer(artifact, onProgress) {
  if (!artifact?.blob || typeof artifact.blob.arrayBuffer !== 'function') {
    throw new Error('Prebuilt search file is not stored on this device.');
  }
  if (
    artifact.bytes > MAX_PREBUILT_SEARCH_ARTIFACT_BYTES
    || artifact.blob.size > MAX_PREBUILT_SEARCH_ARTIFACT_BYTES
  ) {
    throw new Error('Prebuilt search file exceeds the supported size limit.');
  }
  if (artifact.blob.size !== artifact.bytes) {
    throw new Error('Prebuilt search file size does not match its manifest.');
  }
  onProgress({ stage: 'artifact-read', completed: 0, total: artifact.bytes });
  const buffer = await artifact.blob.arrayBuffer();
  onProgress({ stage: 'artifact-checksum', completed: buffer.byteLength, total: buffer.byteLength });
  const actual = await sha256Hex(buffer);
  if (actual !== artifact.sha256) {
    throw new Error('Prebuilt search file checksum does not match its manifest.');
  }
  return buffer;
}

async function validateImportedDatabase(runtime, artifact) {
  const quickRows = await runtime.rows('PRAGMA quick_check;');
  if (String(firstValue(quickRows[0]) ?? '').toLowerCase() !== 'ok') {
    throw new Error('Imported database failed integrity checking.');
  }
  const names = new Set((await runtime.rows(`
    SELECT name FROM sqlite_master
    WHERE name IN ('records_fts', 'records_vocab', 'search_meta')
  `)).map((row) => row.name));
  for (const required of ['records_fts', 'records_vocab', 'search_meta']) {
    if (!names.has(required)) throw new Error(`Imported database is missing ${required}.`);
  }
  const formatVersion = Number(await runtime.meta('artifactFormatVersion'));
  const kind = await runtime.meta('artifactKind');
  const runtimeVersion = await runtime.meta('artifactRuntime');
  const fingerprint = await runtime.meta('fingerprint');
  const recordCount = Number(await runtime.meta('recordCount'));
  if (formatVersion !== PREBUILT_SEARCH_ARTIFACT_VERSION) {
    throw new Error('Imported search format is unsupported.');
  }
  if (kind !== PREBUILT_SQLITE_ARTIFACT_KIND) {
    throw new Error('Imported search kind is unsupported.');
  }
  if (runtimeVersion !== SQLITE_FTS_RUNTIME_VERSION || artifact.runtime !== runtimeVersion) {
    throw new Error('Imported search runtime is incompatible.');
  }
  if (fingerprint !== artifact.corpusFingerprint || recordCount !== artifact.recordCount) {
    throw new Error('Imported search file does not match the active corpus.');
  }
}

export async function importSqliteSearchArtifact(runtime, artifact, {
  onProgress = () => {},
} = {}) {
  const buffer = await artifactBuffer(artifact, onProgress);
  onProgress({ stage: 'artifact-import', completed: 0, total: buffer.byteLength });
  await runtime.reopenFromFile(sqliteImportStream(buffer));
  onProgress({ stage: 'artifact-validate', completed: buffer.byteLength, total: buffer.byteLength });
  await validateImportedDatabase(runtime, artifact);
  return {
    ...(await runtime.stats()),
    reused: true,
    imported: true,
    artifactId: artifact.id,
    artifactBytes: buffer.byteLength,
  };
}

export async function resetSqliteSearchStorage(runtime) {
  await runtime.reset();
}
