import type {
  KnowledgeApplicationAdapter,
  KnowledgeApplicationAdapterInput,
} from '../core/application-adapter.js';
import type { EvidenceEnvelope, SearchResult } from '../core/contracts.js';
import type { LocalModelAnswer } from '../core/ports.js';

export const MINIMED_ADAPTER_CONTRACT_VERSION: '0.1.0';

export interface MiniMedMedicalPolicy {
  readonly benchmarkSuiteId: string;
  analyzeQuery(query: string): unknown;
  rankResults(input: {
    query: string;
    analysis: unknown;
    results: SearchResult[];
  }): SearchResult[] | Promise<SearchResult[]>;
  verifyClinicalAnswer(
    answer: LocalModelAnswer | string,
    evidence: EvidenceEnvelope,
  ): unknown | Promise<unknown>;
  verifyDose(input: unknown): unknown | Promise<unknown>;
  shouldAbstain(input: unknown): boolean | Promise<boolean>;
}

export interface MiniMedAdapter {
  readonly contractVersion: '0.1.0';
  readonly id: 'minimed';
  readonly core: KnowledgeApplicationAdapter;
  readonly medicalPolicy: MiniMedMedicalPolicy;
}

export function defineMiniMedAdapter(input: {
  core: KnowledgeApplicationAdapterInput | KnowledgeApplicationAdapter;
  medicalPolicy: MiniMedMedicalPolicy;
}): MiniMedAdapter;

export function inspectMiniMedAdapter(input: unknown): {
  compatible: boolean;
  contractVersion: '0.1.0';
  coreAdapterVersion: string | null;
  benchmarkSuiteId: string | null;
  missing: string[];
};

export const minimedMedicalPolicyMethods: readonly string[];
