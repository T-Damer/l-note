export const MODEL_LOAD_STATUS = Object.freeze({
  IDLE: 'idle',
  LOADING: 'loading',
  READY: 'ready',
  ERROR: 'error',
});

function clampProgress(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return 0;
  const normalized = numeric > 1 ? numeric / 100 : numeric;
  return Math.max(0, Math.min(1, normalized));
}

export function createModelLoadState(profile = null, now = Date.now()) {
  return {
    status: MODEL_LOAD_STATUS.IDLE,
    modelId: profile?.modelId ?? null,
    progress: 0,
    totalMB: Number(profile?.sizeMB ?? profile?.vramRequiredMB ?? 0),
    loadedMB: 0,
    remainingMB: Number(profile?.sizeMB ?? profile?.vramRequiredMB ?? 0),
    speedMBps: null,
    text: 'Модель выключена',
    error: null,
    startedAt: now,
    updatedAt: now,
  };
}

export function startModelLoad(previous, profile, now = Date.now()) {
  return {
    ...createModelLoadState(profile, now),
    status: MODEL_LOAD_STATUS.LOADING,
    text: 'Подготовка загрузки…',
    previousModelId: previous?.modelId ?? null,
  };
}

export function updateModelLoadProgress(previous, rawProgress, now = Date.now()) {
  const incoming = clampProgress(rawProgress?.progress);
  const progress = Math.max(previous?.progress ?? 0, incoming);
  const totalMB = Number(previous?.totalMB ?? 0);
  const loadedMB = totalMB * progress;
  const elapsedSeconds = Math.max(0.001, (now - Number(previous?.updatedAt ?? now)) / 1000);
  const deltaMB = Math.max(0, loadedMB - Number(previous?.loadedMB ?? 0));
  const instantSpeed = deltaMB > 0 ? deltaMB / elapsedSeconds : null;
  const priorSpeed = Number(previous?.speedMBps);
  const speedMBps = instantSpeed === null
    ? (Number.isFinite(priorSpeed) ? priorSpeed : null)
    : (Number.isFinite(priorSpeed) ? priorSpeed * 0.65 + instantSpeed * 0.35 : instantSpeed);
  return {
    ...previous,
    status: MODEL_LOAD_STATUS.LOADING,
    progress,
    loadedMB,
    remainingMB: Math.max(0, totalMB - loadedMB),
    speedMBps,
    text: rawProgress?.text || previous?.text || 'Загрузка модели…',
    error: null,
    updatedAt: now,
  };
}

export function completeModelLoad(previous, now = Date.now()) {
  const totalMB = Number(previous?.totalMB ?? 0);
  return {
    ...previous,
    status: MODEL_LOAD_STATUS.READY,
    progress: 1,
    loadedMB: totalMB,
    remainingMB: 0,
    text: 'Модель включена',
    error: null,
    updatedAt: now,
  };
}

export function failModelLoad(previous, error, now = Date.now()) {
  return {
    ...previous,
    status: MODEL_LOAD_STATUS.ERROR,
    text: 'Не удалось загрузить модель',
    error: error instanceof Error ? error.message : String(error),
    updatedAt: now,
  };
}
