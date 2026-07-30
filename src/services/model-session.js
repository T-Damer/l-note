export const LOCAL_MODEL_ACTIONS = Object.freeze({
  LOAD: 'load',
  ANSWER: 'answer',
  COLLECT_AND_ANSWER: 'collect-and-answer',
  AWAIT_QUESTION: 'await-question',
});

/**
 * Keep model installation independent from the Ask form. A model may be downloaded
 * before the user has entered a question; evidence is required only for generation.
 */
export function resolveLocalModelAction({ ready = false, hasEvidence = false, hasQuestion = false } = {}) {
  if (!ready) return LOCAL_MODEL_ACTIONS.LOAD;
  if (hasEvidence) return LOCAL_MODEL_ACTIONS.ANSWER;
  if (hasQuestion) return LOCAL_MODEL_ACTIONS.COLLECT_AND_ANSWER;
  return LOCAL_MODEL_ACTIONS.AWAIT_QUESTION;
}
