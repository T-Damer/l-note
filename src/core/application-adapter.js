import {
  defineDomainQueryPlannerPort,
  defineEvidenceVerifierPort,
  defineLocalModelPort,
  defineSpeechRecognitionPort,
  defineStoragePort,
} from './ports.js';
import { composeKnowledgeRuntime } from './runtime.js';

export const KNOWLEDGE_APPLICATION_ADAPTER_VERSION = '0.3.0';

function nonEmptyString(value, name) {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new TypeError(`${name} must be a non-empty string.`);
  }
  return value.trim();
}

export function defineKnowledgeApplicationAdapter(input) {
  if (!input || typeof input !== 'object') {
    throw new TypeError('Knowledge application adapter must be an object.');
  }
  if (typeof input.searchFactory !== 'function') {
    throw new TypeError('Knowledge application adapter requires searchFactory().');
  }

  const storagePort = defineStoragePort(input.storagePort);
  const domainQueryPlanners = Object.freeze(
    (input.domainQueryPlanners ?? []).map((planner) => defineDomainQueryPlannerPort(planner)),
  );
  const localModelPort = input.localModelPort
    ? defineLocalModelPort(input.localModelPort)
    : null;
  const speechRecognitionPort = input.speechRecognitionPort
    ? defineSpeechRecognitionPort(input.speechRecognitionPort)
    : null;
  const evidenceVerifierPort = input.evidenceVerifierPort
    ? defineEvidenceVerifierPort(input.evidenceVerifierPort)
    : null;

  return Object.freeze({
    adapterVersion: KNOWLEDGE_APPLICATION_ADAPTER_VERSION,
    id: nonEmptyString(input.id, 'adapter id'),
    storagePort,
    searchFactory: input.searchFactory,
    domainQueryPlanners,
    localModelPort,
    speechRecognitionPort,
    evidenceVerifierPort,
    metadata: Object.freeze({ ...(input.metadata ?? {}) }),
  });
}

export function composeKnowledgeApplicationRuntime({ adapter, packRecords = [], notes = [] }) {
  const defined = defineKnowledgeApplicationAdapter(adapter);
  const runtime = composeKnowledgeRuntime({
    packRecords,
    notes,
    searchFactory: defined.searchFactory,
    domainQueryPlanners: defined.domainQueryPlanners,
  });

  return {
    ...runtime,
    adapter: defined,
    capabilities: Object.freeze({
      ...runtime.capabilities,
      localModel: Boolean(defined.localModelPort),
      speechRecognition: Boolean(defined.speechRecognitionPort),
      evidenceVerification: Boolean(defined.evidenceVerifierPort),
    }),
  };
}
