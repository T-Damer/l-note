function numericHeader(response, name) {
  const value = Number(response?.headers?.get?.(name));
  return Number.isFinite(value) && value > 0 ? value : null;
}

export async function readResponseBuffer(response, {
  signal,
  expectedBytes = null,
  onProgress = () => {},
} = {}) {
  if (!response?.ok) throw new Error(`Ошибка загрузки: HTTP ${response?.status ?? 'unknown'}`);
  const total = numericHeader(response, 'content-length') ?? Number(expectedBytes) || null;
  if (!response.body?.getReader) {
    const buffer = await response.arrayBuffer();
    onProgress({ progress: 1, loaded: buffer.byteLength, total: total ?? buffer.byteLength, message: 'Скачано' });
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
      onProgress({
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

export function createPackageTransferHandler({
  fetchImpl = globalThis.fetch,
  sha256Hex,
  installPack,
} = {}) {
  if (typeof fetchImpl !== 'function') throw new TypeError('Package transfer requires fetch().');
  if (typeof sha256Hex !== 'function') throw new TypeError('Package transfer requires sha256Hex().');
  if (typeof installPack !== 'function') throw new TypeError('Package transfer requires installPack().');

  return async function packageTransfer(task, { signal, report }) {
    const entry = task.metadata?.entry;
    if (!entry?.url) throw new Error('Пакет не содержит URL загрузки.');
    const response = await fetchImpl(entry.url, { cache: 'no-cache', signal });
    const buffer = await readResponseBuffer(response, {
      signal,
      expectedBytes: entry.bytes,
      onProgress: report,
    });
    if (entry.sha256) {
      report({ progress: .94, loaded: buffer.byteLength, total: buffer.byteLength, message: 'Проверка SHA-256…' });
      const actual = await sha256Hex(buffer);
      if (actual && actual !== entry.sha256) throw new Error('SHA-256 пакета не совпал с каталогом.');
    }
    report({ progress: .97, loaded: buffer.byteLength, total: buffer.byteLength, message: 'Проверка структуры…' });
    const pack = JSON.parse(new TextDecoder().decode(buffer));
    await installPack(pack, {
      url: entry.url,
      sha256: entry.sha256,
      sizeBytes: buffer.byteLength,
    });
    report({ progress: 1, loaded: buffer.byteLength, total: buffer.byteLength, message: 'Установлено' });
    return { packId: pack.id, title: pack.title, bytes: buffer.byteLength };
  };
}
