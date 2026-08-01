import type { KnowledgeConcept, SearchRecord } from '../core/contracts.js';
import type { AsyncSearchPort, SearchPort } from '../core/ports.js';

export const DISK_SEARCH_RECORD_THRESHOLD: number;
export const DISK_SEARCH_BYTE_THRESHOLD: number;

export interface AdaptiveSearchOptions {
  queryExpanders?: Array<(query: string) => string[]>;
  corpusFingerprint?: string;
  forceDisk?: boolean;
  recordThreshold?: number;
  byteThreshold?: number;
  onProgress?: (progress: unknown) => void;
  sqliteFactory?: (options?: unknown) => AsyncSearchPort;
  sqliteOptions?: unknown;
  diskFactory?: (options?: unknown) => AsyncSearchPort;
  diskOptions?: unknown;
}

export function estimateSearchCorpusBytes(records: SearchRecord[]): number;
export function shouldUseDiskSearch(records: SearchRecord[], options?: AdaptiveSearchOptions): boolean;
export function createAdaptiveSearchPort(
  records: SearchRecord[],
  entities?: KnowledgeConcept[],
  options?: AdaptiveSearchOptions,
): SearchPort & {
  readonly async: boolean;
  readonly retainsRecords: boolean;
  readonly ready: Promise<unknown>;
  readonly backendErrors?: Array<{ backend: string; error: string }>;
  stats?(): Promise<unknown>;
  close?(): void;
};
