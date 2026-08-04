import { SqliteFtsRuntime } from '../src/workers/sqlite-fts-runtime.js';

const runtime = new SqliteFtsRuntime({
  databaseName: 'l-note-search-benchmark.db',
});
let commandQueue = Promise.resolve();

function postProgress(requestId, progress) {
  self.postMessage({ requestId, type: 'progress', progress });
}

async function handle(message) {
  if (message.command === 'build') {
    return runtime.build(message.records ?? [], {
      fingerprint: message.fingerprint ?? '',
      onProgress: (progress) => postProgress(message.requestId, progress),
    });
  }
  if (message.command === 'search') return runtime.search(message.query, message.options ?? {});
  if (message.command === 'suggest') return runtime.suggest(message.query, message.limit);
  if (message.command === 'clear') return runtime.clear();
  if (message.command === 'stats') return runtime.stats();
  if (message.command === 'close') {
    await runtime.close();
    return { closed: true };
  }
  throw new Error(`Unknown SQLite benchmark command: ${message.command}`);
}

async function dispatch(message) {
  try {
    self.postMessage({
      requestId: message.requestId,
      type: 'result',
      result: await handle(message),
    });
  } catch (error) {
    self.postMessage({
      requestId: message.requestId,
      type: 'error',
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

self.addEventListener('message', (event) => {
  commandQueue = commandQueue.then(() => dispatch(event.data ?? {}));
});
