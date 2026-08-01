import type { SearchRecord } from '../core/contracts.js';
import type { AsyncSearchPort, AsyncSearchStats, SearchOptions, SearchResult } from '../core/ports.js';

export interface SqliteFtsSearchOptions {
  workerFactory?: () => Worker;
}

export class SqliteFtsSearchPort implements AsyncSearchPort {
  readonly kind: 'SQLite/FTS5';
  count: number;
  readonly available: boolean;
  constructor(options?: SqliteFtsSearchOptions);
  build(
    records: SearchRecord[],
    options?: { fingerprint?: string; onProgress?: (progress: unknown) => void },
  ): Promise<AsyncSearchStats>;
  search(query: string, options?: SearchOptions): Promise<SearchResult[]>;
  suggest(query: string, limit?: number): Promise<string[]>;
  clear(): Promise<AsyncSearchStats>;
  stats(): Promise<AsyncSearchStats>;
  close(): void;
}

export function createSqliteFtsSearchPort(options?: SqliteFtsSearchOptions): AsyncSearchPort;
