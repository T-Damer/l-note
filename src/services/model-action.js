export const LOCAL_MODEL_ACTION = Object.freeze({
  LOAD: 'load',
  ANSWER: 'answer',
  COLLECT_AND_ANSWER: 'collect-and-answer',
  NEEDS_QUESTION: 'needs-question',
});

/**
 * Loading the selected model is independent from retrieval. Evidence is required
 * only after a loaded model is asked to generate an answer.
 */
export function resolveLocalModelAction({ modelReady = false, hasEvidence = false, hasQuestion = false } = {}) {
  if (!modelReady) return LOCAL_MODEL_ACTION.LOAD;
  if (hasEvidence) return LOCAL_MODEL_ACTION.ANSWER;
  if (hasQuestion) return LOCAL_MODEL_ACTION.COLLECT_AND_ANSWER;
  return LOCAL_MODEL_ACTION.NEEDS_QUESTION;
}
