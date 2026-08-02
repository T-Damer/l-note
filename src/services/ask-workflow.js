import { collectQuestionEvidence, evidenceMatchesRequest } from './evidence-query.js';
import { loadSelectedLocalModel } from './local-model-loader.js';
import { LOCAL_MODEL_ACTION, resolveLocalModelAction } from './model-action.js';

export const ASK_WORKFLOW_RESULT = Object.freeze({
  UNAVAILABLE: 'unavailable',
  LOADED: 'loaded',
  NEEDS_QUESTION: 'needs-question',
  ANSWERED: 'answered',
});

function queryText(value) {
  return String(value ?? '').trim();
}

function requireFunction(value, label) {
  if (typeof value !== 'function') throw new TypeError(`${label} must be a function.`);
  return value;
}

function mergeUnique(left = [], right = []) {
  return [...new Set([...left, ...right])];
}

async function verifyGeneratedAnswer(answer, evidence, verifier) {
  if (!verifier) return answer;
  const verification = await verifier.verify(answer, evidence);
  return Object.freeze({
    ...answer,
    grounded: answer.grounded !== false && Boolean(verification.supported),
    validCitations: [...new Set(answer.validCitations ?? [])],
    invalidCitations: mergeUnique(answer.invalidCitations, verification.invalidCitations),
    unsupportedStatements: [...(verification.unsupportedStatements ?? [])],
    supportVerification: verification,
  });
}

export function createAskWorkflow({
  modelPort,
  evidenceVerifier = null,
  getSearchPort,
  getKnowledgeState,
  getSelectedProfile,
  getSelectedMode,
  isModelReady,
  getEvidenceSnapshot,
  setEvidenceSnapshot,
  collectEvidence,
  requestPersistence,
} = {}) {
  if (!modelPort?.answer || !modelPort?.load) throw new TypeError('modelPort is incomplete.');
  if (evidenceVerifier && typeof evidenceVerifier.verify !== 'function') {
    throw new TypeError('evidenceVerifier must expose verify().');
  }
  requireFunction(getSearchPort, 'getSearchPort');
  requireFunction(getKnowledgeState, 'getKnowledgeState');
  requireFunction(getSelectedProfile, 'getSelectedProfile');
  requireFunction(getSelectedMode, 'getSelectedMode');
  requireFunction(isModelReady, 'isModelReady');
  requireFunction(getEvidenceSnapshot, 'getEvidenceSnapshot');
  requireFunction(setEvidenceSnapshot, 'setEvidenceSnapshot');
  requireFunction(collectEvidence, 'collectEvidence');
  requireFunction(requestPersistence, 'requestPersistence');

  async function collect(query) {
    const normalized = queryText(query);
    if (!normalized) throw new TypeError('Question is required.');
    const mode = getSelectedMode();
    const collected = await collectQuestionEvidence({
      query: normalized,
      mode,
      searchPort: getSearchPort(),
      knowledgeState: getKnowledgeState(),
      collectEvidence,
    });
    setEvidenceSnapshot({ evidence: collected.evidence, modeId: collected.modeId });
    return Object.freeze({ ...collected, mode });
  }

  function plan(query) {
    const normalized = queryText(query);
    const profile = getSelectedProfile();
    const mode = getSelectedMode();
    if (!modelPort.available) {
      return Object.freeze({ kind: ASK_WORKFLOW_RESULT.UNAVAILABLE, query: normalized, profile, mode });
    }
    const snapshot = getEvidenceSnapshot();
    const action = resolveLocalModelAction({
      modelReady: isModelReady(profile),
      hasEvidence: evidenceMatchesRequest(
        snapshot.evidence,
        normalized,
        snapshot.modeId,
        mode.id,
      ),
      hasQuestion: Boolean(normalized),
    });
    return Object.freeze({ kind: 'action', action, query: normalized, profile, mode });
  }

  async function execute(prepared, { onProgress, onEvidence } = {}) {
    if (prepared.kind === ASK_WORKFLOW_RESULT.UNAVAILABLE) return prepared;
    if (prepared.action === LOCAL_MODEL_ACTION.LOAD) {
      const result = await loadSelectedLocalModel({
        modelPort,
        modelId: prepared.profile.modelId,
        onProgress,
        requestPersistence,
      });
      return Object.freeze({
        kind: ASK_WORKFLOW_RESULT.LOADED,
        profile: prepared.profile,
        mode: prepared.mode,
        ...result,
      });
    }
    if (prepared.action === LOCAL_MODEL_ACTION.NEEDS_QUESTION) {
      return Object.freeze({
        kind: ASK_WORKFLOW_RESULT.NEEDS_QUESTION,
        profile: prepared.profile,
        mode: prepared.mode,
      });
    }

    let collected = null;
    if (prepared.action === LOCAL_MODEL_ACTION.COLLECT_AND_ANSWER) {
      collected = await collect(prepared.query);
      if (typeof onEvidence === 'function') onEvidence(collected.evidence);
    }
    const snapshot = getEvidenceSnapshot();
    if (!snapshot.evidence) throw new Error('Evidence is required before local generation.');
    const generated = await modelPort.answer(
      snapshot.evidence.query,
      snapshot.evidence,
      { modeId: prepared.mode.id },
    );
    const answer = await verifyGeneratedAnswer(
      generated,
      snapshot.evidence,
      evidenceVerifier,
    );
    return Object.freeze({
      kind: ASK_WORKFLOW_RESULT.ANSWERED,
      profile: prepared.profile,
      mode: prepared.mode,
      answer,
      collected: Boolean(collected),
    });
  }

  return Object.freeze({ collect, execute, plan });
}
