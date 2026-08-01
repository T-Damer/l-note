import { SqliteFtsRuntime } from './sqlite-fts-runtime.js';

const runtime = new SqliteFtsRuntime();
let commandQueue = Promise.resolve();

function postProgress(requestId, progress) {
  self.postMessage({ requestId, type: 'progress', progress });
}

async function handle(message) {
  const options = message.options ?? {};
  if (message.command === 'build') {
    return runtime.build(message.records ?? [], {
      fingerprint: message.fingerprint ?? '',
      onProgress: (progress) => postProgress(message.requestId, progress),
    });
  }
  if (message.command === 'search') return runtime.search(message.query, options);
  if (message.command === 'suggest') return runtime.suggest(message.query, message.limit);
  if (message.command === 'clear') return runtime.clear();
  if (message.command === 'stats') return runtime.stats();
  if (message.command === 'close') {
    await runtime.close();
    return { closed: true };
  }
  throw new Error(`Unknown SQLite-search command: ${message.command}`);
}

async function dispatch(message) {
  try {
    const result = await handle(message);
    self.postMessage({ requestId: message.requestId, type: 'result', result });
  } catch (error) {
    self.postMessage({
      requestId: message.requestId,
      type: 'error',
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

self.addEventListener('message', (event) => {
  const message = event.data ?? {};
  commandQueue = commandQueue.then(() => dispatch(message));
});
