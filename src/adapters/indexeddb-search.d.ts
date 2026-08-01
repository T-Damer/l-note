import type {
  AsyncSearchPort,
  AsyncSearchStats,
  SearchOptions,
} from '../core/ports.js';
import type { SearchRecord, SearchResult } from '../core/contracts.js';

export interface IndexedDbSearchPortOptions {
  workerFactory?: () => Worker;
}

export class IndexedDbSearchPort implements AsyncSearchPort {
  readonly kind: string;
  readonly available: boolean;
  count: number;
  constructor(options?: IndexedDbSearchPortOptions);
  build(
    records: SearchRecord[],
    options?: { onProgress?: (progress: unknown) => void },
  ): Promise<AsyncSearchStats>;
  search(query: string, options?: SearchOptions): Promise<SearchResult[]>;
  suggest(query: string, limit?: number): Promise<string[]>;
  clear(): Promise<void>;
  stats(): Promise<AsyncSearchStats>;
  close(): void;
}

export function createIndexedDbSearchPort(options?: IndexedDbSearchPortOptions): AsyncSearchPort;
