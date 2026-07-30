import { ensureWelcomeNote } from './services/welcome-note.js';

const refreshStateWithoutWelcomeNote = refreshState;
let welcomeNoteResolved = false;

refreshState = async function refreshStateWithWelcomeNote() {
  if (!welcomeNoteResolved) {
    await ensureWelcomeNote(applicationAdapter.storagePort);
    welcomeNoteResolved = true;
  }
  return refreshStateWithoutWelcomeNote();
};
