import type { InstalledPackRecord, PersonalNote } from './contracts.js';
import type {
  DomainQueryPlannerPort,
  EvidenceVerifierPort,
  LocalModelPort,
  SearchPortFactory,
  StoragePort,
} from './ports.js';
import type { KnowledgeRuntime } from './runtime.js';

export const KNOWLEDGE_APPLICATION_ADAPTER_VERSION: '0.1.0';

export interface KnowledgeApplicationAdapter {
  readonly adapterVersion: '0.1.0';
  readonly id: string;
  readonly storagePort: StoragePort;
  readonly searchFactory: SearchPortFactory;
  readonly domainQueryPlanners: readonly DomainQueryPlannerPort[];
  readonly localModelPort: LocalModelPort | null;
  readonly evidenceVerifierPort: EvidenceVerifierPort | null;
  readonly metadata: Readonly<Record<string, unknown>>;
}

export interface KnowledgeApplicationAdapterInput {
  id: string;
  storagePort: StoragePort;
  searchFactory: SearchPortFactory;
  domainQueryPlanners?: DomainQueryPlannerPort[];
  localModelPort?: LocalModelPort | null;
  evidenceVerifierPort?: EvidenceVerifierPort | null;
  metadata?: Record<string, unknown>;
}

export interface KnowledgeApplicationRuntime extends KnowledgeRuntime {
  adapter: KnowledgeApplicationAdapter;
  capabilities: KnowledgeRuntime['capabilities'] & {
    localModel: boolean;
    evidenceVerification: boolean;
  };
}

export function defineKnowledgeApplicationAdapter(
  input: KnowledgeApplicationAdapterInput | KnowledgeApplicationAdapter,
): KnowledgeApplicationAdapter;

export function composeKnowledgeApplicationRuntime(input: {
  adapter: KnowledgeApplicationAdapterInput | KnowledgeApplicationAdapter;
  packRecords?: InstalledPackRecord[];
  notes?: PersonalNote[];
}): KnowledgeApplicationRuntime;
