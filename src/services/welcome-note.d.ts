import type { PersonalNote } from '../core/contracts.js';
import type { StoragePort } from '../core/ports.js';

export const WELCOME_NOTE_SETTING_KEY: 'lnote.welcome-note.v1.seeded';
export const WELCOME_NOTE_ID: 'lnote.welcome-note.v1';

export interface WelcomeNoteOptions {
  now?: string;
  id?: string;
  title?: string;
  body?: string;
  settingKey?: string;
}

export function createWelcomeNote(options?: WelcomeNoteOptions): PersonalNote & {
  systemTemplate: 'welcome-note.v1';
};

export function ensureWelcomeNote(
  storagePort: StoragePort,
  options?: WelcomeNoteOptions,
): Promise<{
  created: boolean;
  reason: 'created' | 'already-seeded' | 'existing-notes';
  note: PersonalNote | null;
}>;
