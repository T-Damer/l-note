export const LNOTE_CONTRACT_VERSION: '0.1.0';
export const KNOWLEDGE_PACK_SCHEMA_VERSION: 1;
export const KNOWLEDGE_RESOURCE_TYPES: readonly KnowledgeResourceType[];
export const PERSONAL_NOTE_RELATIONS: readonly PersonalNoteRelation[];
export const STATEMENT_RELATION_TYPES: readonly StatementRelationType[];
export const STATEMENT_RELATION_STATUSES: readonly StatementRelationStatus[];

export type KnowledgeResourceType = 'package' | 'document' | 'concept' | 'statement' | 'note';
export type PersonalNoteRelation = 'observation' | 'supports' | 'refines' | 'contradicts' | 'supersedes';
export type StatementRelationType =
  | 'supports'
  | 'contradicts'
  | 'refines'
  | 'supersedes'
  | 'equivalent'
  | 'different_scope';
export type StatementRelationStatus = 'proposed' | 'confirmed' | 'dismissed';
export type KnowledgeAuthority = 'reference' | 'personal' | 'proposed' | string;

export interface KnowledgeSource {
  title?: string;
  url?: string;
  type?: string;
  license?: string;
  publishedAt?: string;
  date?: string;
  [key: string]: unknown;
}

export interface KnowledgeSection {
  id: string;
  title: string;
  text: string;
  entityIds?: string[];
  tags?: string[];
  [key: string]: unknown;
}

export interface KnowledgeDocument {
  id: string;
  title: string;
  summary?: string;
  authority?: KnowledgeAuthority;
  effectiveFrom?: string | null;
  tags?: string[];
  source?: KnowledgeSource;
  sections: KnowledgeSection[];
  [key: string]: unknown;
}

export interface KnowledgeConcept {
  id: string;
  name: string;
  type?: string;
  description?: string;
  aliases?: string[];
  categories?: string[];
  [key: string]: unknown;
}

export interface StatementSource {
  documentId: string;
  sectionId?: string;
  quote?: string;
  [key: string]: unknown;
}

export interface KnowledgeStatement {
  id: string;
  text: string;
  predicate?: string;
  subjectId?: string;
  objectId?: string;
  authority?: KnowledgeAuthority;
  source: StatementSource;
  runtimeId?: string;
  localId?: string;
  packId?: string;
  [key: string]: unknown;
}

export interface StatementRelation {
  id: string;
  sourceClaimId: string;
  targetClaimId: string;
  type: StatementRelationType;
  status?: StatementRelationStatus;
  reason?: string;
  detectedBy?: 'rule' | 'local-model' | 'package-author' | 'user' | string;
  confidence?: number;
  [key: string]: unknown;
}

export interface StatementSelection {
  id: string;
  groupKey: string;
  claimRefs: string[];
  preferredClaimRefs: string[];
  status?: 'confirmed';
  reason: string;
  scope?: string;
  validAt?: string;
  reviewedAt: string;
  reviewedBy: string;
  [key: string]: unknown;
}

export interface KnowledgeRelation {
  sourceId: string;
  targetId: string;
  predicate?: string;
  type?: string;
  description?: string;
  weight?: number;
  strength?: number;
  confidence?: number;
  [key: string]: unknown;
}

export interface PrebuiltSearchArtifact {
  id: string;
  kind: 'sqlite-fts5';
  formatVersion: 1;
  runtime: string;
  url: string;
  sha256: string;
  bytes: number;
  corpusFingerprint: string;
  recordCount: number;
}

export interface StoredSearchArtifactFile extends PrebuiltSearchArtifact {
  blob: Blob;
}

export interface KnowledgePack {
  schemaVersion: 1;
  id: string;
  version: string;
  title: string;
  description: string;
  language: string;
  tags?: string[];
  documents: KnowledgeDocument[];
  entities: KnowledgeConcept[];
  claims: KnowledgeStatement[];
  relations: KnowledgeRelation[];
  statementRelations?: StatementRelation[];
  statementSelections?: StatementSelection[];
  searchArtifacts?: PrebuiltSearchArtifact[];
  [key: string]: unknown;
}

export interface InstalledPackRecord {
  id: string;
  enabled: boolean;
  installedAt: string;
  sizeBytes?: number;
  sourceUrl?: string | null;
  sha256?: string | null;
  searchArtifactFiles?: StoredSearchArtifactFile[];
  pack: KnowledgePack;
}

export interface PersonalNote {
  id: string;
  title: string;
  body: string;
  relation: PersonalNoteRelation;
  relationLabel?: string;
  targetClaimId?: string | null;
  targetDocumentId?: string | null;
  targetSectionId?: string | null;
  relatedEntityIds?: string[];
  createdAt: string;
  updatedAt: string;
}

export interface SearchRecord {
  id: string;
  kind: 'section' | 'note' | string;
  title: string;
  body: string;
  packId?: string;
  packTitle?: string;
  documentId?: string | null;
  documentTitle?: string;
  sectionId?: string | null;
  aliases?: string;
  entityNames?: string;
  entityIds?: string[];
  tags?: string;
  authority?: KnowledgeAuthority;
  relation?: PersonalNoteRelation;
  effectiveFrom?: string | null;
  sourceTitle?: string;
  claimIds?: string[];
  [key: string]: unknown;
}

export interface SearchResult extends SearchRecord {
  score: number;
  relevance: number;
  queryTerms?: string[];
  expandedQuery?: string;
  matches?: Array<{ start: number; end: number }>;
}

export interface EvidenceSource {
  id: string;
  label: string;
  title: string;
  body: string;
  packId?: string;
  documentId?: string;
  sectionId?: string;
  authority?: KnowledgeAuthority;
  [key: string]: unknown;
}

export interface EvidenceEnvelope {
  schemaVersion: 1;
  query: string;
  mode: string;
  sources: EvidenceSource[];
  [key: string]: unknown;
}

export interface SearchPort {
  kind: string;
  count: number;
  async?: boolean;
  retainsRecords?: boolean;
  ready?: Promise<unknown>;
  search(query: string, options?: Record<string, unknown>): SearchResult[] | Promise<SearchResult[]>;
  suggest(query: string, limit?: number): string[] | Promise<string[]>;
  stats?(): unknown | Promise<unknown>;
  close?(): void | Promise<void>;
}

export interface StoragePort {
  getAll(store: string): Promise<unknown[]>;
  getOne(store: string, key: string): Promise<unknown>;
  putOne(store: string, value: unknown): Promise<unknown>;
  deleteOne(store: string, key: string): Promise<void>;
}

export interface AiPort {
  available?: boolean;
  load?(profile?: string): Promise<unknown>;
  unload?(): Promise<void>;
  generate(prompt: string, options?: Record<string, unknown>): Promise<string>;
}

export interface EvidenceVerifierPort {
  verify(answer: string, evidence: EvidenceEnvelope): unknown | Promise<unknown>;
}

export interface SpeechPort {
  available?: boolean;
  load?(profile?: string): Promise<unknown>;
  transcribe(audio: Float32Array, options?: Record<string, unknown>): Promise<string>;
  cancel?(): void | Promise<void>;
}
