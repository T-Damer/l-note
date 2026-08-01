export const TRANSFER_QUEUE_SETTING_KEY = 'transfers.queue.v1';
export const TRANSFER_QUEUE_MAX_CONCURRENT = 4;
export const TRANSFER_STATUS = Object.freeze({
  QUEUED: 'queued',
  ACTIVE: 'active',
  INTERRUPTED: 'interrupted',
  COMPLETED: 'completed',
  FAILED: 'failed',
  CANCELLED: 'cancelled',
});
export const TRANSFER_PRIORITY = Object.freeze({
  CURRENT_MODEL: 300,
  CURRENT_DOCUMENT: 200,
  DEFAULT: 100,
});
const RUNNABLE = new Set([TRANSFER_STATUS.QUEUED]);
const RETRYABLE = new Set([
  TRANSFER_STATUS.INTERRUPTED,
  TRANSFER_STATUS.FAILED,
  TRANSFER_STATUS.CANCELLED,
]);
const TERMINAL = new Set([
  TRANSFER_STATUS.COMPLETED,
  TRANSFER_STATUS.FAILED,
  TRANSFER_STATUS.CANCELLED,
]);
function abortError(message = 'Операция отменена.') {
  const error = new Error(message);
  error.name = 'AbortError';
  return error;
}
function safeMetadata(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? { ...value } : {};
}
function normalizedTask(input, now, idFactory) {
  if (!input?.kind || !input?.resourceId) {
    throw new TypeError('Transfer task requires kind and resourceId.');
  }
  const timestamp = now();
  return {
    id: String(input.id ?? idFactory()),
    kind: String(input.kind),
    resourceId: String(input.resourceId),
    dedupeKey: String(input.dedupeKey ?? `${input.kind}:${input.resourceId}`),
    label: String(input.label ?? input.resourceId),
    priority: Number.isFinite(input.priority) ? Number(input.priority) : TRANSFER_PRIORITY.DEFAULT,
    status: TRANSFER_STATUS.QUEUED,
    resumeOnRestore: input.resumeOnRestore !== false,
    createdAt: timestamp,
    updatedAt: timestamp,
    attempts: 0,
    progress: 0,
    loaded: null,
    total: null,
    message: 'В очереди',
    error: null,
    metadata: safeMetadata(input.metadata),
  };
}
function restoredTask(input, now) {
  const task = {
    ...input,
    metadata: safeMetadata(input?.metadata),
    progress: Number.isFinite(input?.progress) ? Number(input.progress) : 0,
    priority: Number.isFinite(input?.priority) ? Number(input.priority) : TRANSFER_PRIORITY.DEFAULT,
  };
  if (task.status === TRANSFER_STATUS.ACTIVE) {
    task.status = task.resumeOnRestore === false
      ? TRANSFER_STATUS.INTERRUPTED
      : TRANSFER_STATUS.QUEUED;
    task.message = task.resumeOnRestore === false
      ? 'Прервано перезапуском; можно продолжить вручную'
      : 'Восстановлено после перезапуска';
    task.error = null;
    task.updatedAt = now();
  }
  return task;
}
function taskOrder(left, right) {
  return right.priority - left.priority
    || left.createdAt.localeCompare(right.createdAt)
    || left.id.localeCompare(right.id);
}

export function createTransferQueue({
  storagePort,
  settingKey = TRANSFER_QUEUE_SETTING_KEY,
  maxConcurrent = TRANSFER_QUEUE_MAX_CONCURRENT,
  now = () => new Date().toISOString(),
  idFactory = () => globalThis.crypto?.randomUUID?.() ?? `transfer-${Date.now()}-${Math.random()}`,
} = {}) {
  if (!storagePort?.getSetting || !storagePort?.setSetting) {
    throw new TypeError('Transfer queue requires a StoragePort.');
  }
  const concurrency = Math.max(1, Math.min(TRANSFER_QUEUE_MAX_CONCURRENT, Math.floor(maxConcurrent)));
  const tasks = new Map();
  const handlers = new Map();
  const controllers = new Map();
  const waiters = new Map();
  const subscribers = new Set();
  let initialized = false;
  let persistChain = Promise.resolve();

  function snapshot() {
    return [...tasks.values()].sort(taskOrder).map((task) => Object.freeze({ ...task, metadata: { ...task.metadata } }));
  }

  function emit() {
    const value = snapshot();
    for (const subscriber of subscribers) subscriber(value);
  }

  function persist() {
    const value = snapshot().slice(-100);
    persistChain = persistChain.then(() => storagePort.setSetting(settingKey, value));
    return persistChain;
  }

  function update(id, patch) {
    const current = tasks.get(id);
    if (!current) return null;
    const next = { ...current, ...patch, updatedAt: now() };
    tasks.set(id, next);
    persist();
    emit();
    return next;
  }

  function settleWaiters(id, method, value) {
    for (const waiter of waiters.get(id) ?? []) waiter[method](value);
    waiters.delete(id);
  }

  function completionFor(id) {
    return new Promise((resolve, reject) => {
      const task = tasks.get(id);
      if (task?.status === TRANSFER_STATUS.COMPLETED) {
        resolve(task);
        return;
      }
      const values = waiters.get(id) ?? [];
      values.push({ resolve, reject });
      waiters.set(id, values);
    });
  }

  function activeCount() {
    return controllers.size;
  }

  function nextRunnable() {
    return [...tasks.values()]
      .filter((task) => RUNNABLE.has(task.status) && handlers.has(task.kind))
      .sort(taskOrder)[0] ?? null;
  }

  function report(id, progress = {}) {
    const numeric = Number(progress.progress);
    update(id, {
      progress: Number.isFinite(numeric) ? Math.max(0, Math.min(1, numeric)) : tasks.get(id)?.progress ?? 0,
      loaded: Number.isFinite(progress.loaded) ? Number(progress.loaded) : tasks.get(id)?.loaded ?? null,
      total: Number.isFinite(progress.total) ? Number(progress.total) : tasks.get(id)?.total ?? null,
      message: String(progress.message ?? progress.status ?? tasks.get(id)?.message ?? 'Выполняется'),
    });
  }

  async function run(task) {
    const handler = handlers.get(task.kind);
    if (!handler || controllers.has(task.id)) return;
    const controller = new AbortController();
    controllers.set(task.id, controller);
    update(task.id, {
      status: TRANSFER_STATUS.ACTIVE,
      attempts: Number(task.attempts ?? 0) + 1,
      message: 'Выполняется',
      error: null,
    });
    try {
      const result = await handler(tasks.get(task.id), {
        signal: controller.signal,
        report: (progress) => report(task.id, progress),
      });
      if (controller.signal.aborted) throw abortError();
      const completed = update(task.id, {
        status: TRANSFER_STATUS.COMPLETED,
        progress: 1,
        message: 'Готово',
        error: null,
      });
      settleWaiters(task.id, 'resolve', result ?? completed);
    } catch (error) {
      const cancelled = controller.signal.aborted || error?.name === 'AbortError';
      const failed = update(task.id, {
        status: cancelled ? TRANSFER_STATUS.CANCELLED : TRANSFER_STATUS.FAILED,
        message: cancelled ? 'Отменено' : 'Ошибка',
        error: cancelled ? null : error instanceof Error ? error.message : String(error),
      });
      settleWaiters(task.id, 'reject', cancelled ? abortError() : error ?? new Error(failed.error));
    } finally {
      controllers.delete(task.id);
      queueMicrotask(pump);
    }
  }

  function pump() {
    if (!initialized) return;
    while (activeCount() < concurrency) {
      const task = nextRunnable();
      if (!task) break;
      run(task);
    }
  }

  async function init() {
    if (initialized) return snapshot();
    const stored = await storagePort.getSetting(settingKey, []);
    for (const input of Array.isArray(stored) ? stored : []) {
      if (!input?.id || !input?.kind || !input?.resourceId) continue;
      tasks.set(input.id, restoredTask(input, now));
    }
    initialized = true;
    await persist();
    emit();
    pump();
    return snapshot();
  }

  function register(kind, handler) {
    if (typeof handler !== 'function') throw new TypeError('Transfer handler must be a function.');
    handlers.set(String(kind), handler);
    pump();
    return () => handlers.delete(String(kind));
  }

  async function enqueue(input) {
    await init();
    const candidate = normalizedTask(input, now, idFactory);
    const existing = [...tasks.values()].find((task) => (
      task.dedupeKey === candidate.dedupeKey && !TERMINAL.has(task.status)
    ));
    const task = existing ?? candidate;
    if (!existing) tasks.set(task.id, task);
    else if (RETRYABLE.has(existing.status)) update(existing.id, { status: TRANSFER_STATUS.QUEUED, error: null });
    await persist();
    emit();
    pump();
    return Object.freeze({ task: { ...tasks.get(task.id) }, completion: completionFor(task.id) });
  }

  async function cancel(id) {
    await init();
    const task = tasks.get(id);
    if (!task || TERMINAL.has(task.status)) return false;
    controllers.get(id)?.abort();
    if (!controllers.has(id)) {
      update(id, { status: TRANSFER_STATUS.CANCELLED, message: 'Отменено', error: null });
      settleWaiters(id, 'reject', abortError());
      pump();
    }
    return true;
  }

  async function retry(id) {
    await init();
    const task = tasks.get(id);
    if (!task || !RETRYABLE.has(task.status)) return false;
    update(id, { status: TRANSFER_STATUS.QUEUED, message: 'В очереди', error: null });
    pump();
    return true;
  }

  async function remove(id) {
    await cancel(id);
    tasks.delete(id);
    await persist();
    emit();
  }

  return Object.freeze({
    init,
    register,
    enqueue,
    cancel,
    retry,
    remove,
    list: snapshot,
    activeCount,
    subscribe(listener) {
      subscribers.add(listener);
      listener(snapshot());
      return () => subscribers.delete(listener);
    },
    wait: completionFor,
    get maxConcurrent() {
      return concurrency;
    },
  });
}
