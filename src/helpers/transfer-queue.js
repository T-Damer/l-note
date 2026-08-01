export function transferAbortError(message = 'Операция отменена.') {
  const error = new Error(message);
  error.name = 'AbortError';
  return error;
}

export function transferMetadata(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? { ...value } : {};
}

export function transferTaskOrder(left, right) {
  return right.priority - left.priority
    || left.createdAt.localeCompare(right.createdAt)
    || left.id.localeCompare(right.id);
}

export function normalizeTransferTask(input, {
  now,
  idFactory,
  queuedStatus,
  defaultPriority,
} = {}) {
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
    priority: Number.isFinite(input.priority) ? Number(input.priority) : defaultPriority,
    status: queuedStatus,
    resumeOnRestore: input.resumeOnRestore !== false,
    createdAt: timestamp,
    updatedAt: timestamp,
    attempts: 0,
    progress: 0,
    loaded: null,
    total: null,
    message: 'В очереди',
    error: null,
    metadata: transferMetadata(input.metadata),
  };
}

export function restoreTransferTask(input, {
  now,
  activeStatus,
  queuedStatus,
  interruptedStatus,
  defaultPriority,
} = {}) {
  const task = {
    ...input,
    metadata: transferMetadata(input?.metadata),
    progress: Number.isFinite(input?.progress) ? Number(input.progress) : 0,
    priority: Number.isFinite(input?.priority) ? Number(input.priority) : defaultPriority,
  };
  if (task.status !== activeStatus) return task;
  task.status = task.resumeOnRestore === false ? interruptedStatus : queuedStatus;
  task.message = task.resumeOnRestore === false
    ? 'Прервано перезапуском; можно продолжить вручную'
    : 'Восстановлено после перезапуска';
  task.error = null;
  task.updatedAt = now();
  return task;
}
