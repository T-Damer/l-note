export const WELCOME_NOTE_ID = 'lnote.welcome.v1';
export const WELCOME_NOTE_SETTING = 'lnote.welcome-note-seeded.v1';

export function createWelcomeNote(now = new Date().toISOString()) {
  return {
    id: WELCOME_NOTE_ID,
    title: 'Привет, коллега',
    body: 'Это личный слой L-Note. Здесь можно фиксировать наблюдения, связывать их со справочниками, уточнять или явно перекрывать отдельные утверждения, не изменяя исходный источник.',
    relation: 'observation',
    relationLabel: 'Практическое наблюдение',
    targetClaimId: null,
    relatedEntityIds: [],
    createdAt: now,
    updatedAt: now,
    systemSeed: 'welcome-v1',
  };
}

/** Seed once per storage profile. Deleting the note later is respected. */
export async function ensureWelcomeNote(storagePort, now = new Date().toISOString()) {
  if (!storagePort?.getOne || !storagePort?.putOne) {
    throw new TypeError('ensureWelcomeNote requires a StoragePort.');
  }
  const seeded = await storagePort.getOne('settings', WELCOME_NOTE_SETTING);
  if (seeded?.value === true) return { created: false, reason: 'already-seeded' };

  const existing = await storagePort.getOne('notes', WELCOME_NOTE_ID);
  if (!existing) await storagePort.putOne('notes', createWelcomeNote(now));
  await storagePort.putOne('settings', { key: WELCOME_NOTE_SETTING, value: true });
  return { created: !existing, reason: existing ? 'already-present' : 'created' };
}
