const DEFAULT_TIMEOUT_MS = 120_000;

function defaultWorkerFactory() {
  return new Worker(new URL('../workers/pdf-inspector-worker.js', import.meta.url), { type: 'module' });
}

function workerError(message, detail) {
  const error = new Error(message);
  if (detail) error.cause = new Error(detail);
  return error;
}

export async function inspectBrowserPdf(file, {
  workerFactory = defaultWorkerFactory,
  timeoutMs = DEFAULT_TIMEOUT_MS,
} = {}) {
  if (!file || typeof file.arrayBuffer !== 'function') {
    throw new TypeError('Для разбора PDF нужен локальный файл.');
  }
  const worker = workerFactory();
  const id = `pdf-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const buffer = await file.arrayBuffer();

  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      worker.terminate();
      reject(workerError('PDF обрабатывается слишком долго. Попробуйте подготовить его через CLI.'));
    }, timeoutMs);
    const finish = (callback, value) => {
      clearTimeout(timer);
      worker.terminate();
      callback(value);
    };
    worker.addEventListener('error', (event) => {
      finish(reject, workerError('Не удалось запустить локальный разбор PDF.', event.message));
    }, { once: true });
    worker.addEventListener('message', (event) => {
      if (event.data?.id !== id) return;
      if (event.data.ok) finish(resolve, event.data.result);
      else finish(reject, workerError('Не удалось разобрать PDF локально.', event.data.error));
    });
    worker.postMessage({ id, buffer }, [buffer]);
  });
}
