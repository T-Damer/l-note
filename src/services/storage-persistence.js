export const STORAGE_PERSISTENCE_STATUS = Object.freeze({
  UNSUPPORTED: 'unsupported',
  ALREADY_PERSISTENT: 'already-persistent',
  GRANTED: 'granted',
  DENIED: 'denied',
  ERROR: 'error',
});

export async function requestPersistentStorage(storageManager = globalThis.navigator?.storage) {
  if (!storageManager || typeof storageManager.persisted !== 'function' || typeof storageManager.persist !== 'function') {
    return { status: STORAGE_PERSISTENCE_STATUS.UNSUPPORTED, persistent: false };
  }

  try {
    if (await storageManager.persisted()) {
      return { status: STORAGE_PERSISTENCE_STATUS.ALREADY_PERSISTENT, persistent: true };
    }
    const granted = await storageManager.persist();
    return {
      status: granted ? STORAGE_PERSISTENCE_STATUS.GRANTED : STORAGE_PERSISTENCE_STATUS.DENIED,
      persistent: Boolean(granted),
    };
  } catch (error) {
    return {
      status: STORAGE_PERSISTENCE_STATUS.ERROR,
      persistent: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

export function storagePersistenceLabel(result) {
  switch (result?.status) {
    case STORAGE_PERSISTENCE_STATUS.ALREADY_PERSISTENT:
    case STORAGE_PERSISTENCE_STATUS.GRANTED:
      return 'постоянное хранилище разрешено';
    case STORAGE_PERSISTENCE_STATUS.DENIED:
      return 'браузер может очистить кэш при нехватке места';
    case STORAGE_PERSISTENCE_STATUS.ERROR:
      return 'не удалось проверить постоянное хранилище';
    default:
      return 'режим постоянного хранилища не поддерживается';
  }
}
