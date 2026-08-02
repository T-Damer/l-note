export const WELCOME_NOTE_SETTING_KEY = 'lnote.welcome-note.v1.seeded';
export const WELCOME_NOTE_ID = 'lnote.welcome-note.v1';

export function createWelcomeNote({
  now = new Date().toISOString(),
  id = WELCOME_NOTE_ID,
  title = 'Привет, коллега',
  body = 'Это личный слой L-Note. Здесь можно фиксировать наблюдения, связывать их со справочными понятиями и явно отмечать, поддерживают, уточняют или опровергают они источник.',
} = {}) {
  return {
    id,
    title,
    body,
    relation: 'observation',
    relationLabel: 'Практическое наблюдение',
    targetClaimId: null,
    relatedEntityIds: [],
    createdAt: now,
    updatedAt: now,
    systemTemplate: 'welcome-note.v1',
  };
}

export async function ensureWelcomeNote(storagePort, options = {}) {
  if (!storagePort || typeof storagePort.getAll !== 'function' || typeof storagePort.putOne !== 'function') {
    throw new TypeError('ensureWelcomeNote requires a StoragePort.');
  }
  const settingKey = options.settingKey ?? WELCOME_NOTE_SETTING_KEY;
  const seeded = await storagePort.getSetting(settingKey, false);
  if (seeded) return { created: false, reason: 'already-seeded', note: null };

  const notes = await storagePort.getAll('notes');
  let note = null;
  if (notes.length === 0) {
    note = createWelcomeNote(options);
    await storagePort.putOne('notes', note);
  }
  await storagePort.setSetting(settingKey, true);
  return {
    created: Boolean(note),
    reason: note ? 'created' : 'existing-notes',
    note,
  };
}
