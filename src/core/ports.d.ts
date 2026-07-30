import type {
  EvidenceEnvelope,
  InstalledPackRecord,
  KnowledgeConcept,
  KnowledgePack,
  PersonalNote,
  SearchRecord,
  SearchResult,
} from './contracts.js';

export interface SearchOptions {
  limit?: number;
  personalPriority?: boolean;
}

export interface SearchPort {
  readonly kind: string;
  readonly count: number;
  search(query: string, options?: SearchOptions): SearchResult[];
  suggest(query: string, limit?: number): string[];
}

export type StorageStoreName = 'packs' | 'notes' | 'settings';

export interface StoragePort {
  getAll<T = unknown>(storeName: StorageStoreName): Promise<T[]>;
  getOne<T = unknown>(storeName: StorageStoreName, key: string): Promise<T | undefined>;
  putOne<T = unknown>(storeName: StorageStoreName, value: T): Promise<T>;
  deleteOne(storeName: StorageStoreName, key: string): Promise<void>;
  clearStore(storeName: StorageStoreName): Promise<void>;
  getSetting<T = unknown>(key: string, fallback: T): Promise<T>;
  setSetting<T = unknown>(key: string, value: T): Promise<unknown>;
  mode(): 'persistent' | 'memory';
}

export interface DomainQueryPlannerPort {
  readonly id: string;
  appliesToPack(pack: KnowledgePack): boolean;
  expandQuery(query: string): string[];
}

export interface LocalModelLoadResult {
  modelId: string;
  profile?: unknown;
  loadMs: number;
  reused: boolean;
}

export interface LocalModelAnswer {
  text: string;
  modelId: string;
  durationMs: number;
  completionTokens: number | null;
  tokensPerSecond: number | null;
  grounded: boolean;
  validCitations: string[];
  invalidCitations: string[];
  usage?: unknown;
}

export interface LocalModelPort {
  readonly available: boolean;
  readonly modelId?: string | null;
  readonly engine?: unknown;
  inspectModels?(): Promise<unknown[]>;
  load(options?: { modelId?: string; onProgress?: (progress: unknown) => void }): Promise<LocalModelLoadResult>;
  answer(query: string, evidence: EvidenceEnvelope): Promise<LocalModelAnswer>;
}

export type SearchPortFactory = (
  records: SearchRecord[],
  concepts: KnowledgeConcept[],
  options?: { queryExpanders?: Array<(query: string) => string[]> },
) => SearchPort;

export function defineSearchPort<T extends SearchPort>(candidate: T): T;
export function defineStoragePort<T extends StoragePort>(candidate: T): T;
export function defineDomainQueryPlannerPort<T extends DomainQueryPlannerPort>(candidate: T): T;
export function defineLocalModelPort<T extends LocalModelPort>(candidate: T): T;
export function activeDomainQueryExpanders(
  planners: DomainQueryPlannerPort[],
  packs: KnowledgePack[],
): Array<(query: string) => string[]>;

export const portMethods: Readonly<Record<string, readonly string[]>>;

export type RuntimePackRecords = InstalledPackRecord[];
export type RuntimeNotes = PersonalNote[];
