import {
  MAX_SEARCH_ARTIFACT_BYTES,
  resolveSearchArtifactUrl,
  validateSearchArtifact,
} from '../helpers/search-artifacts.js';

function numericHeader(response, name) {
  const value = Number(response?.headers?.get?.(name));
  return Number.isFinite(value) && value > 0 ? value : null;
}

function positiveNumber(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) && numeric > 0 ? numeric : null;
}

function scaledProgress(progress, start, end) {
  return start + Math.max(0, Math.min(1, Number(progress ?? 0))) * (end - start);
}

export async function readResponseBuffer(response, {
  signal,
  expectedBytes = null,
  maxBytes = Infinity,
  progressStart = 0,
  progressEnd = 1,
  onProgress = () => {},
} = {}) {
  if (!response?.ok) throw new Error(`Ошибка загрузки: HTTP ${response?.status ?? 'unknown'}`);
  const total = numericHeader(response, 'content-length') ?? positiveNumber(expectedBytes);
  if (total && total > maxBytes) throw new Error('Загружаемый файл слишком большой.');
  const report = (update) => onProgress({
    ...update,
    progress: scaledProgress(update.progress, progressStart, progressEnd),
  });
  if (!response.body?.getReader) {
    const buffer = await response.arrayBuffer();
    if (buffer.byteLength > maxBytes) throw new Error('Загружаемый файл слишком большой.');
    report({ progress: 1, loaded: buffer.byteLength, total: total ?? buffer.byteLength, message: 'Скачано' });
    return buffer;
  }

  const reader = response.body.getReader();
  const chunks = [];
  let loaded = 0;
  try {
    while (true) {
      if (signal?.aborted) throw signal.reason ?? new DOMException('Aborted', 'AbortError');
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
      loaded += value.byteLength;
      if (loaded > maxBytes) throw new Error('Загружаемый файл слишком большой.');
      report({
        progress: total ? Math.min(.9, loaded / total * .9) : 0,
        loaded,
        total,
        message: total ? `Скачивание ${Math.round(loaded / total * 100)}%` : 'Скачивание…',
      });
    }
  } finally {
    reader.releaseLock?.();
  }
  const output = new Uint8Array(loaded);
  let offset = 0;
  for (const chunk of chunks) {
    output.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return output.buffer;
}

async function downloadSearchArtifact(pack, entryUrl, dependencies, context) {
  const artifact = pack.searchArtifact;
  if (!artifact) return null;
  const errors = validateSearchArtifact(artifact);
  if (errors.length) throw new Error(errors.join('\n'));
  const url = resolveSearchArtifactUrl({ ...artifact, sourceUrl: entryUrl }, entryUrl);
  const response = await dependencies.fetchImpl(url, { cache: 'no-cache', signal: context.signal });
  const buffer = await readResponseBuffer(response, {
    signal: context.signal,
    expectedBytes: artifact.bytes,
    maxBytes: MAX_SEARCH_ARTIFACT_BYTES,
    progressStart: .72,
    progressEnd: .94,
    onProgress: context.report,
  });
  if (buffer.byteLength !== artifact.bytes) {
    throw new Error('Размер поискового индекса не совпал с описанием пакета.');
  }
  context.report({ progress: .96, loaded: buffer.byteLength, total: buffer.byteLength, message: 'Проверка индекса…' });
  const actual = await dependencies.sha256Hex(buffer);
  if (!actual || actual !== artifact.sha256) {
    throw new Error('SHA-256 поискового индекса не совпал с описанием пакета.');
  }
  return {
    schemaVersion: artifact.schemaVersion,
    profile: artifact.profile,
    sha256: artifact.sha256,
    fingerprint: artifact.fingerprint,
    bytes: artifact.bytes,
    recordCount: artifact.recordCount,
    url,
    blob: new Blob([buffer], { type: 'application/vnd.sqlite3' }),
  };
}

export function createPackageTransferHandler({
  fetchImpl = globalThis.fetch,
  sha256Hex,
  installPack,
} = {}) {
  if (typeof fetchImpl !== 'function') throw new TypeError('Package transfer requires fetch().');
  if (typeof sha256Hex !== 'function') throw new TypeError('Package transfer requires sha256Hex().');
  if (typeof installPack !== 'function') throw new TypeError('Package transfer requires installPack().');
  const dependencies = { fetchImpl, sha256Hex, installPack };

  return async function packageTransfer(task, { signal, report }) {
    const entry = task.metadata?.entry;
    if (!entry?.url) throw new Error('Пакет не содержит URL загрузки.');
    const response = await fetchImpl(entry.url, { cache: 'no-cache', signal });
    const buffer = await readResponseBuffer(response, {
      signal,
      expectedBytes: entry.bytes,
      progressStart: 0,
      progressEnd: .68,
      onProgress: report,
    });
    if (entry.sha256) {
      report({ progress: .7, loaded: buffer.byteLength, total: buffer.byteLength, message: 'Проверка SHA-256…' });
      const actual = await sha256Hex(buffer);
      if (actual && actual !== entry.sha256) throw new Error('SHA-256 пакета не совпал с каталогом.');
    }
    const pack = JSON.parse(new TextDecoder().decode(buffer));
    const searchArtifactFile = await downloadSearchArtifact(
      pack,
      entry.url,
      dependencies,
      { signal, report },
    );
    report({ progress: .98, loaded: buffer.byteLength, total: buffer.byteLength, message: 'Проверка структуры…' });
    await installPack(pack, {
      url: entry.url,
      sha256: entry.sha256,
      sizeBytes: buffer.byteLength + (searchArtifactFile?.bytes ?? 0),
      searchArtifactFile,
    });
    report({ progress: 1, loaded: buffer.byteLength, total: buffer.byteLength, message: 'Установлено' });
    return {
      packId: pack.id,
      title: pack.title,
      bytes: buffer.byteLength,
      searchArtifactBytes: searchArtifactFile?.bytes ?? 0,
    };
  };
}
