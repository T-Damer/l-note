import { defineKnowledgeApplicationAdapter } from '../core/application-adapter.js';

export const MINIMED_ADAPTER_CONTRACT_VERSION = '0.1.0';

const MEDICAL_POLICY_METHODS = Object.freeze([
  'analyzeQuery',
  'rankResults',
  'verifyClinicalAnswer',
  'verifyDose',
  'shouldAbstain',
]);

function defineMedicalPolicy(candidate) {
  if (!candidate || typeof candidate !== 'object') {
    throw new TypeError('MiniMed adapter requires a medicalPolicy object.');
  }
  for (const method of MEDICAL_POLICY_METHODS) {
    if (typeof candidate[method] !== 'function') {
      throw new TypeError(`MiniMed medicalPolicy is missing ${method}().`);
    }
  }
  if (typeof candidate.benchmarkSuiteId !== 'string' || !candidate.benchmarkSuiteId.trim()) {
    throw new TypeError('MiniMed medicalPolicy requires benchmarkSuiteId.');
  }
  return Object.freeze(candidate);
}

/**
 * Compatibility boundary only. The medical policy remains implemented and
 * tested in MiniMed; L-Note supplies the generic knowledge runtime and ports.
 */
export function defineMiniMedAdapter(input) {
  if (!input || typeof input !== 'object') {
    throw new TypeError('MiniMed adapter must be an object.');
  }
  const core = defineKnowledgeApplicationAdapter(input.core);
  if (core.domainQueryPlanners.length === 0) {
    throw new TypeError('MiniMed adapter requires at least one medical DomainQueryPlannerPort.');
  }
  if (!core.evidenceVerifierPort) {
    throw new TypeError('MiniMed adapter requires an EvidenceVerifierPort.');
  }

  return Object.freeze({
    contractVersion: MINIMED_ADAPTER_CONTRACT_VERSION,
    id: 'minimed',
    core,
    medicalPolicy: defineMedicalPolicy(input.medicalPolicy),
  });
}

export function inspectMiniMedAdapter(input) {
  try {
    const adapter = defineMiniMedAdapter(input);
    return {
      compatible: true,
      contractVersion: adapter.contractVersion,
      coreAdapterVersion: adapter.core.adapterVersion,
      benchmarkSuiteId: adapter.medicalPolicy.benchmarkSuiteId,
      missing: [],
    };
  } catch (error) {
    return {
      compatible: false,
      contractVersion: MINIMED_ADAPTER_CONTRACT_VERSION,
      coreAdapterVersion: input?.core?.adapterVersion ?? null,
      benchmarkSuiteId: input?.medicalPolicy?.benchmarkSuiteId ?? null,
      missing: [error instanceof Error ? error.message : String(error)],
    };
  }
}

export const minimedMedicalPolicyMethods = MEDICAL_POLICY_METHODS;
