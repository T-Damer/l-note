const TRANSFORMERS_URL = 'https://cdn.jsdelivr.net/npm/@huggingface/transformers@4.2.0';

let runtimePromise = null;
let transcriber = null;
let loadedModelId = null;

function post(requestId, type, payload = {}) {
  self.postMessage({ requestId, type, ...payload });
}

function progressPayload(progress) {
  const output = {};
  for (const key of ['status', 'name', 'file', 'progress', 'loaded', 'total']) {
    const value = progress?.[key];
    if (['string', 'number', 'boolean'].includes(typeof value)) output[key] = value;
  }
  return output;
}

async function loadRuntime() {
  runtimePromise ??= import(TRANSFORMERS_URL).then((runtime) => {
    runtime.env.allowLocalModels = false;
    runtime.env.useBrowserCache = true;
    runtime.env.useWasmCache = true;
    const wasm = runtime.env.backends?.onnx?.wasm;
    if (wasm) {
      wasm.numThreads = Math.max(1, Math.min(4, Number(self.navigator?.hardwareConcurrency ?? 2)));
    }
    return runtime;
  });
  return runtimePromise;
}

async function disposeTranscriber() {
  const current = transcriber;
  transcriber = null;
  loadedModelId = null;
  await current?.dispose?.();
}

async function loadModel(message) {
  if (transcriber && loadedModelId === message.modelId) return { modelId: loadedModelId, reused: true };
  await disposeTranscriber();
  const runtime = await loadRuntime();
  transcriber = await runtime.pipeline(
    'automatic-speech-recognition',
    message.modelId,
    {
      device: 'wasm',
      dtype: message.dtype ?? 'q8',
      progress_callback: (progress) => post(
        message.requestId,
        'progress',
        { progress: progressPayload(progress) },
      ),
    },
  );
  loadedModelId = message.modelId;
  return { modelId: loadedModelId, reused: false };
}

function whisperLanguage(language) {
  if (language === 'ru') return 'russian';
  if (language === 'en') return 'english';
  return undefined;
}

async function transcribe(message) {
  if (!transcriber || !loadedModelId) throw new Error('Speech model is not loaded.');
  const audio = message.audio instanceof Float32Array
    ? message.audio
    : new Float32Array(message.audio);
  const output = await transcriber(audio, {
    task: 'transcribe',
    language: whisperLanguage(message.language),
    chunk_length_s: 20,
    stride_length_s: 3,
    return_timestamps: false,
  });
  return {
    text: String(output?.text ?? '').trim(),
    language: message.language ?? 'auto',
  };
}

self.addEventListener('message', async (event) => {
  const message = event.data ?? {};
  try {
    let result;
    if (message.command === 'load') result = await loadModel(message);
    else if (message.command === 'transcribe') result = await transcribe(message);
    else if (message.command === 'unload') {
      await disposeTranscriber();
      result = { unloaded: true };
    } else {
      throw new Error(`Unknown speech-worker command: ${message.command}`);
    }
    post(message.requestId, 'result', { result });
  } catch (error) {
    post(message.requestId, 'error', {
      error: error instanceof Error ? error.message : String(error),
    });
  }
});
