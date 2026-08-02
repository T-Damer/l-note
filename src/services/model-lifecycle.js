export const MODEL_CATALOG_STATUS = Object.freeze({
  IDLE: 'idle',
  LOADING: 'loading',
  READY: 'ready',
  ERROR: 'error',
});

export const MODEL_LIFECYCLE = Object.freeze({
  LOADED: Object.freeze({ id: 'loaded', label: 'В памяти', className: 'is-on' }),
  CACHED: Object.freeze({ id: 'cached', label: 'На диске', className: 'is-cached' }),
  CHECKING: Object.freeze({ id: 'checking', label: 'Проверка', className: 'is-checking' }),
  UNAVAILABLE: Object.freeze({ id: 'unavailable', label: 'Недоступна', className: 'is-off' }),
  UNKNOWN: Object.freeze({ id: 'unknown', label: 'Статус неизвестен', className: 'is-off' }),
  MISSING: Object.freeze({ id: 'missing', label: 'Не скачана', className: 'is-off' }),
});

export function modelCatalogRecord(catalog, modelId) {
  return catalog instanceof Map ? catalog.get(modelId) ?? null : null;
}

export function isModelCached(catalog, profile) {
  return modelCatalogRecord(catalog, profile?.modelId)?.cached === true;
}

export function isModelAvailable(catalog, profile) {
  return modelCatalogRecord(catalog, profile?.modelId)?.available !== false;
}

export function resolveModelLifecycle({
  profile,
  catalog,
  catalogStatus = MODEL_CATALOG_STATUS.IDLE,
  activeModelId = null,
  active = false,
} = {}) {
  if (active && profile?.modelId === activeModelId) return MODEL_LIFECYCLE.LOADED;
  if (isModelCached(catalog, profile)) return MODEL_LIFECYCLE.CACHED;
  if (catalogStatus === MODEL_CATALOG_STATUS.LOADING) return MODEL_LIFECYCLE.CHECKING;
  if (!isModelAvailable(catalog, profile)) return MODEL_LIFECYCLE.UNAVAILABLE;
  if (catalogStatus === MODEL_CATALOG_STATUS.ERROR) return MODEL_LIFECYCLE.UNKNOWN;
  return MODEL_LIFECYCLE.MISSING;
}

export function markModelCached(catalog, profile, cached = true) {
  const next = new Map(catalog instanceof Map ? catalog : []);
  if (!profile?.modelId) return next;
  const previous = next.get(profile.modelId) ?? { ...profile, available: true };
  next.set(profile.modelId, { ...previous, cached: Boolean(cached) });
  return next;
}

export function indexModelCatalog(records = []) {
  return new Map(records.map((record) => [record.modelId, record]));
}
