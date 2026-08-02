const TRANSFORMERS_JS_VERSION = '4.2.0';
const SPEECH_WORKER_URL = new URL('./workers/speech-worker.js', import.meta.url);

export const LOCAL_SPEECH_MODEL_PROFILES = Object.freeze([
  Object.freeze({
    id: 'whisper-tiny',
    modelId: 'Xenova/whisper-tiny',
    label: 'Whisper Tiny',
    parameters: '39M',
    dtype: 'q8',
    downloadSizeMB: 75,
    recommendedRamGB: 8,
    languages: Object.freeze(['auto', 'ru', 'en']),
    role: 'Быстрый голосовой поиск',
    description: 'Лёгкая многоязычная модель для коротких русских и английских запросов.',
  }),
  Object.freeze({
    id: 'whisper-base',
    modelId: 'Xenova/whisper-base',
    label: 'Whisper Base',
    parameters: '74M',
    dtype: 'q8',
    downloadSizeMB: 142,
    recommendedRamGB: 8,
    languages: Object.freeze(['auto', 'ru', 'en']),
    role: 'Повышенная точность',
    description: 'Более точный локальный профиль для устройств с дополнительным запасом CPU и памяти.',
  }),
]);

export const DEFAULT_SPEECH_MODEL_ID = LOCAL_SPEECH_MODEL_PROFILES[0].modelId;
export const SPEECH_TRANSFORMERS_RUNTIME = `@huggingface/transformers@${TRANSFORMERS_JS_VERSION}`;

export function speechModelProfile(modelId) {
  return LOCAL_SPEECH_MODEL_PROFILES.find((profile) => profile.modelId === modelId) ?? null;
}

function modelCacheNeedles(modelId) {
  const normalized = String(modelId ?? '').trim();
  return [
    normalized,
    encodeURIComponent(normalized),
    normalized.replace('/', '%2F'),
  ].filter(Boolean);
}

export async function isSpeechModelCached(
  modelId,
  cacheStorage = globalThis.caches,
) {
  if (!cacheStorage?.keys || !cacheStorage?.open) return null;
  try {
    const needles = modelCacheNeedles(modelId);
    for (const cacheName of await cacheStorage.keys()) {
      if (!/transformers|huggingface|onnx/iu.test(cacheName)) continue;
      const cache = await cacheStorage.open(cacheName);
      const requests = typeof cache.keys === 'function' ? await cache.keys() : [];
      if (requests.some((request) => needles.some((needle) => request.url.includes(needle)))) {
        return true;
      }
    }
    return false;
  } catch {
    return null;
  }
}

function abortError(message = 'Операция распознавания отменена.') {
  const error = new Error(message);
  error.name = 'AbortError';
  return error;
}

function defaultWorkerFactory() {
  if (typeof Worker !== 'function') throw new Error('Web Worker недоступен в этом окружении.');
  return new Worker(SPEECH_WORKER_URL, { type: 'module', name: 'l-note-speech' });
}

function monotonicNow() {
  return globalThis.performance?.now?.() ?? Date.now();
}

export class BrowserSpeechRecognition {
  constructor({ workerFactory = defaultWorkerFactory, cacheStorage = globalThis.caches } = {}) {
    this.workerFactory = workerFactory;
    this.cacheStorage = cacheStorage;
    this.worker = null;
    this.modelId = null;
    this.pending = new Map();
    this.nextRequestId = 1;
  }

  get available() {
    return typeof Worker === 'function' || this.workerFactory !== defaultWorkerFactory;
  }

  ensureWorker() {
    if (this.worker) return this.worker;
    const worker = this.workerFactory();
    worker.addEventListener('message', (event) => this.handleMessage(event.data));
    worker.addEventListener('error', (event) => {
      this.rejectPending(new Error(event.message || 'Speech worker failed.'));
      this.terminateWorker();
    });
    this.worker = worker;
    return worker;
  }

  handleMessage(message) {
    const pending = this.pending.get(message?.requestId);
    if (!pending) return;
    if (message.type === 'progress') {
      pending.onProgress?.(message.progress);
      return;
    }
    this.pending.delete(message.requestId);
    if (message.type === 'error') {
      pending.reject(new Error(message.error || 'Speech worker failed.'));
      return;
    }
    pending.resolve(message.result);
  }

  rejectPending(error = abortError()) {
    for (const pending of this.pending.values()) pending.reject(error);
    this.pending.clear();
  }

  terminateWorker(error = null) {
    if (error) this.rejectPending(error);
    this.worker?.terminate?.();
    this.worker = null;
    this.modelId = null;
  }

  request(command, payload = {}, { transfer = [], onProgress } = {}) {
    const worker = this.ensureWorker();
    const requestId = this.nextRequestId;
    this.nextRequestId += 1;
    return new Promise((resolve, reject) => {
      this.pending.set(requestId, { resolve, reject, onProgress });
      worker.postMessage({ requestId, command, ...payload }, transfer);
    });
  }

  async inspectModels({ includeCache = true } = {}) {
    return Promise.all(LOCAL_SPEECH_MODEL_PROFILES.map(async (profile) => ({
      ...profile,
      available: this.available,
      cached: includeCache
        ? await isSpeechModelCached(profile.modelId, this.cacheStorage)
        : null,
    })));
  }

  isModelCached(modelId) {
    return isSpeechModelCached(modelId, this.cacheStorage);
  }

  async load({ modelId = DEFAULT_SPEECH_MODEL_ID, onProgress } = {}) {
    const profile = speechModelProfile(modelId);
    if (!profile) throw new Error(`Неизвестная модель распознавания: ${modelId}.`);
    if (!this.available) throw new Error('Локальное распознавание речи недоступно в этом браузере.');
    if (this.worker && this.modelId === modelId) {
      return { modelId, profile, loadMs: 0, reused: true, cachedBeforeLoad: true, runtime: 'web-worker' };
    }
    if (this.worker) await this.unload();

    const cachedBeforeLoad = await this.isModelCached(modelId);
    const startedAt = monotonicNow();
    try {
      await this.request('load', {
        modelId,
        dtype: profile.dtype,
        runtimeVersion: TRANSFORMERS_JS_VERSION,
      }, { onProgress });
      this.modelId = modelId;
      return {
        modelId,
        profile,
        loadMs: monotonicNow() - startedAt,
        reused: false,
        cachedBeforeLoad,
        runtime: 'transformers.js-worker',
      };
    } catch (error) {
      this.terminateWorker();
      throw error;
    }
  }

  async transcribe(audio, { language = 'auto' } = {}) {
    if (!this.worker || !this.modelId) throw new Error('Сначала загрузите модель распознавания речи.');
    if (!(audio instanceof Float32Array) || audio.length === 0) {
      throw new TypeError('Для распознавания нужен непустой Float32Array с аудио 16 кГц.');
    }
    const samples = audio.byteOffset === 0 && audio.byteLength === audio.buffer.byteLength
      ? audio
      : audio.slice();
    const startedAt = monotonicNow();
    const result = await this.request('transcribe', {
      audio: samples,
      language: ['ru', 'en'].includes(language) ? language : 'auto',
    }, { transfer: [samples.buffer] });
    return {
      text: String(result?.text ?? '').trim(),
      modelId: this.modelId,
      language: result?.language ?? language,
      durationMs: monotonicNow() - startedAt,
    };
  }

  async cancel() {
    const cancelled = Boolean(this.worker || this.pending.size);
    this.terminateWorker(abortError());
    return { cancelled };
  }

  async unload() {
    const modelId = this.modelId;
    const hadWorker = Boolean(this.worker);
    if (this.worker) {
      try {
        await this.request('unload');
      } catch {
        // Termination below is the final cleanup path.
      }
    }
    this.terminateWorker();
    return { modelId, unloaded: hadWorker };
  }
}
