import type { KnowledgeConcept, SearchRecord } from '../core/contracts.js';
import type {
  LocalModelPort,
  SearchPort,
  SpeechRecognitionPort,
  StoragePort,
} from '../core/ports.js';

export function createMiniSearchPort(
  records: SearchRecord[],
  concepts?: KnowledgeConcept[],
  options?: { queryExpanders?: Array<(query: string) => string[]> },
): SearchPort;

export function createIndexedDbStoragePort(): StoragePort;
export function createWebLlmPort(): LocalModelPort;
export function createBrowserSpeechRecognitionPort(options?: Record<string, unknown>): SpeechRecognitionPort;
