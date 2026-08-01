import { BrowserLocalAi } from '../ai.js';
import {
  clearStore,
  deleteOne,
  getAll,
  getOne,
  getSetting,
  putOne,
  setSetting,
  storageMode,
} from '../db.js';
import { createSearchEngine } from '../search.js';
import { BrowserSpeechRecognition } from '../speech.js';
import {
  defineLocalModelPort,
  defineSearchPort,
  defineSpeechRecognitionPort,
  defineStoragePort,
} from '../core/ports.js';

export function createMiniSearchPort(records, concepts = [], options = {}) {
  return defineSearchPort(createSearchEngine(records, concepts, options));
}

export function createIndexedDbStoragePort() {
  return defineStoragePort({
    getAll,
    getOne,
    putOne,
    deleteOne,
    clearStore,
    getSetting,
    setSetting,
    mode: storageMode,
  });
}

export function createWebLlmPort() {
  return defineLocalModelPort(new BrowserLocalAi());
}

export function createBrowserSpeechRecognitionPort(options = {}) {
  return defineSpeechRecognitionPort(new BrowserSpeechRecognition(options));
}
