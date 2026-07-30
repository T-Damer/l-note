import type {
  InstalledPackRecord,
  KnowledgeConcept,
  KnowledgeDocument,
  KnowledgePack,
  KnowledgeRelation,
  KnowledgeSection,
  KnowledgeStatement,
  PersonalNote,
  SearchRecord,
} from './contracts.js';
import type { DomainQueryPlannerPort, SearchPort, SearchPortFactory } from './ports.js';

export interface KnowledgeState {
  packs: KnowledgePack[];
  notes: PersonalNote[];
  documents: Map<string, KnowledgeDocument & { packId: string; packTitle: string }>;
  sections: Map<string, KnowledgeSection & { documentId: string; packId: string }>;
  entities: Map<string, KnowledgeConcept & { packIds: string[] }>;
  claims: Map<string, KnowledgeStatement & { packId: string }>;
  relations: Array<KnowledgeRelation & { packId: string }>;
  entityMentions: Map<string, Array<{ packId: string; documentId: string; sectionId: string }>>;
  claimNotes: Map<string, PersonalNote[]>;
}

export interface KnowledgeRuntimeCapabilities {
  search: true;
  fuzzySearch: true;
  personalOverlay: true;
  domainQueryPlannerIds: readonly string[];
}

export interface KnowledgeRuntime {
  enabledPacks: KnowledgePack[];
  knowledge: KnowledgeState;
  records: SearchRecord[];
  search: SearchPort;
  capabilities: KnowledgeRuntimeCapabilities;
}

export function composeKnowledgeRuntime(input: {
  packRecords?: InstalledPackRecord[];
  notes?: PersonalNote[];
  searchFactory: SearchPortFactory;
  domainQueryPlanners?: DomainQueryPlannerPort[];
}): KnowledgeRuntime;
