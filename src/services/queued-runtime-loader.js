import { transferAbortError } from '../helpers/transfer-queue.js';

function clampProgress(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return null;
  const normalized = numeric > 1 ? numeric / 100 : numeric;
  return Math.max(0, Math.min(1, normalized));
}

export function normalizeRuntimeTransferProgress(input = {}) {
  const loaded = Number(input.loaded);
  const total = Number(input.total);
  const explicit = clampProgress(input.progress);
  const derived = Number.isFinite(loaded) && Number.isFinite(total) && total > 0
    ? clampProgress(loaded / total)
    : null;
  return {
    progress: explicit ?? derived ?? 0,
    loaded: Number.isFinite(loaded) ? loaded : null,
    total: Number.isFinite(total) ? total : null,
    message: String(input.text ?? input.message ?? input.status ?? 'Загрузка'),
  };
}

function taskProgress(task) {
  return {
    progress: task.progress,
    loaded: task.loaded,
    total: task.total,
    status: task.message,
    text: task.message,
  };
}

export function createQueuedRuntimeLoader({
  queue,
  kind,
  directLoad,
  cancel,
  labelFor = (resourceId) => resourceId,
  priority = 100,
  resumeOnRestore = false,
  onLoaded = () => {},
} = {}) {
  if (!queue?.register || !queue?.enqueue) throw new TypeError('Transfer queue is required.');
  if (!kind) throw new TypeError('Queued runtime loader requires a kind.');
  if (typeof directLoad !== 'function') throw new TypeError('Queued runtime loader requires directLoad().');

  const unregister = queue.register(kind, async (task, { signal, report }) => {
    const abort = () => {
      try {
        void cancel?.();
      } catch {
        // The queue still marks the task cancelled below.
      }
    };
    signal.addEventListener('abort', abort, { once: true });
    try {
      const result = await directLoad({
        modelId: task.resourceId,
        onProgress: (progress) => report(normalizeRuntimeTransferProgress(progress)),
      });
      if (signal.aborted) throw transferAbortError();
      await onLoaded(result, task);
      return result;
    } catch (error) {
      if (signal.aborted || error?.name === 'AbortError') throw transferAbortError();
      throw error;
    } finally {
      signal.removeEventListener('abort', abort);
    }
  });

  async function load(options = {}) {
    const resourceId = String(options.modelId ?? '').trim();
    if (!resourceId) throw new TypeError('A modelId is required.');
    const queued = await queue.enqueue({
      kind,
      resourceId,
      dedupeKey: `${kind}:${resourceId}`,
      label: String(labelFor(resourceId, options) ?? resourceId),
      priority,
      resumeOnRestore,
      metadata: { modelId: resourceId },
    });
    const unsubscribe = typeof options.onProgress === 'function'
      ? queue.subscribe((tasks) => {
        const current = tasks.find((task) => task.id === queued.task.id);
        if (current) options.onProgress(taskProgress(current));
      })
      : () => {};
    try {
      return await queued.completion;
    } finally {
      unsubscribe();
    }
  }

  return Object.freeze({ load, unregister });
}
