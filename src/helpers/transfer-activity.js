const RUNNING_STATUSES = new Set(['queued', 'active']);
const ATTENTION_STATUSES = new Set(['interrupted', 'failed']);

export const TRANSFER_SECTION_BY_KIND = Object.freeze({
  package: 'library',
  document: 'library',
  model: 'ask',
  'speech-model': 'search',
});

function numericProgress(value) {
  if (value === null || value === undefined || value === '') return null;
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

function normalizedProgress(task) {
  const loaded = numericProgress(task?.loaded);
  const total = numericProgress(task?.total);
  if (loaded !== null && total !== null && total > 0) {
    return Math.max(0, Math.min(1, loaded / total));
  }
  const progress = numericProgress(task?.progress);
  return progress === null ? null : Math.max(0, Math.min(1, progress));
}

function activityLabel(tasks) {
  if (tasks.length === 1) return String(tasks[0].label ?? 'Загрузка');
  return `${tasks.length} операции загрузки`;
}

export function sectionForTransferKind(kind) {
  return TRANSFER_SECTION_BY_KIND[String(kind ?? '')] ?? null;
}

export function sectionTransferActivities(tasks = []) {
  const grouped = new Map();
  for (const task of tasks ?? []) {
    if (!RUNNING_STATUSES.has(task?.status)) continue;
    const section = sectionForTransferKind(task.kind);
    if (!section) continue;
    const values = grouped.get(section) ?? [];
    values.push(task);
    grouped.set(section, values);
  }

  const activities = {};
  for (const [section, values] of grouped) {
    const progressValues = values.map(normalizedProgress).filter((value) => value !== null);
    const progress = progressValues.length
      ? progressValues.reduce((sum, value) => sum + value, 0) / progressValues.length
      : null;
    activities[section] = Object.freeze({
      active: true,
      progress,
      label: activityLabel(values),
      taskCount: values.length,
    });
  }
  return Object.freeze(activities);
}

export function attentionTransferTasks(tasks = []) {
  return (tasks ?? []).filter((task) => ATTENTION_STATUSES.has(task?.status));
}
