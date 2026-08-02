import assert from 'node:assert/strict';
import test from 'node:test';

import {
  BrowserSpeechRecognition,
  DEFAULT_SPEECH_MODEL_ID,
  LOCAL_SPEECH_MODEL_PROFILES,
  isSpeechModelCached,
} from '../src/speech.js';
import { defineSpeechRecognitionPort } from '../src/core/ports.js';

class FakeWorker {
  constructor({ deferTranscription = false } = {}) {
    this.listeners = new Map();
    this.terminated = false;
    this.deferTranscription = deferTranscription;
  }

  addEventListener(type, listener) {
    const values = this.listeners.get(type) ?? [];
    values.push(listener);
    this.listeners.set(type, values);
  }

  emit(type, data) {
    for (const listener of this.listeners.get(type) ?? []) listener({ data });
  }

  postMessage(message) {
    if (message.command === 'transcribe' && this.deferTranscription) return;
    queueMicrotask(() => {
      const result = message.command === 'transcribe'
        ? { text: 'локальный голосовой поиск', language: message.language }
        : { modelId: message.modelId, unloaded: message.command === 'unload' };
      this.emit('message', { requestId: message.requestId, type: 'result', result });
    });
  }

  terminate() {
    this.terminated = true;
  }
}

function fakeCacheStorage(urls = []) {
  return {
    async keys() {
      return ['transformers-cache'];
    },
    async open() {
      return {
        async keys() {
          return urls.map((url) => ({ url }));
        },
      };
    },
  };
}

test('defines lightweight multilingual RU/EN speech profiles', () => {
  assert.equal(LOCAL_SPEECH_MODEL_PROFILES.length, 2);
  assert.equal(LOCAL_SPEECH_MODEL_PROFILES[0].modelId, DEFAULT_SPEECH_MODEL_ID);
  for (const profile of LOCAL_SPEECH_MODEL_PROFILES) {
    assert.deepEqual(profile.languages, ['auto', 'ru', 'en']);
    assert.equal(profile.dtype, 'q8');
    assert.ok(profile.downloadSizeMB < 200);
  }
});

test('detects persisted Transformers.js model artifacts without loading inference', async () => {
  const cache = fakeCacheStorage([
    'https://huggingface.co/Xenova/whisper-tiny/resolve/main/onnx/model_quantized.onnx',
  ]);
  assert.equal(await isSpeechModelCached('Xenova/whisper-tiny', cache), true);
  assert.equal(await isSpeechModelCached('Xenova/whisper-base', cache), false);
});

test('loads one worker model and transcribes a 16 kHz Float32Array', async () => {
  const workers = [];
  const port = new BrowserSpeechRecognition({
    workerFactory() {
      const worker = new FakeWorker();
      workers.push(worker);
      return worker;
    },
    cacheStorage: fakeCacheStorage(),
  });
  assert.equal(defineSpeechRecognitionPort(port), port);
  const loaded = await port.load({ modelId: DEFAULT_SPEECH_MODEL_ID });
  assert.equal(loaded.modelId, DEFAULT_SPEECH_MODEL_ID);
  assert.equal(port.modelId, DEFAULT_SPEECH_MODEL_ID);

  const result = await port.transcribe(new Float32Array([0, .25, -.25, 0]), { language: 'ru' });
  assert.equal(result.text, 'локальный голосовой поиск');
  assert.equal(result.language, 'ru');

  const unloaded = await port.unload();
  assert.equal(unloaded.unloaded, true);
  assert.equal(workers[0].terminated, true);
  assert.equal(port.modelId, null);
});

test('cancellation terminates the active worker and rejects pending inference', async () => {
  const worker = new FakeWorker({ deferTranscription: true });
  const port = new BrowserSpeechRecognition({
    workerFactory: () => worker,
    cacheStorage: fakeCacheStorage(),
  });
  await port.load({ modelId: DEFAULT_SPEECH_MODEL_ID });
  const pending = port.transcribe(new Float32Array([0, 0, 0]), { language: 'auto' });
  await port.cancel();
  await assert.rejects(pending, (error) => error.name === 'AbortError');
  assert.equal(worker.terminated, true);
});

test('speech port fails fast when cancellation is missing', () => {
  assert.throws(
    () => defineSpeechRecognitionPort({ load() {}, transcribe() {}, unload() {} }),
    /cancel/u,
  );
});
