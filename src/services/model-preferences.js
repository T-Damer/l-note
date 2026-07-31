export const MODEL_SELECTION_SETTING_KEY = 'lnote.local-model.selected.v1';
export const ANSWER_MODE_SETTING_KEY = 'lnote.local-model.answer-mode.v1';

export function resolveLocalModelPreferences({
  storedModelId,
  storedModeId,
  modelProfiles,
  answerModes,
  defaultModelId,
  defaultModeId,
} = {}) {
  const profiles = Array.isArray(modelProfiles) ? modelProfiles : [];
  const modes = Array.isArray(answerModes) ? answerModes : [];
  const selectedModel = profiles.find((profile) => profile.modelId === storedModelId)
    ?? profiles.find((profile) => profile.modelId === defaultModelId)
    ?? profiles[0]
    ?? null;
  const selectedModeId = modes.some((mode) => mode.id === storedModeId)
    ? storedModeId
    : selectedModel?.recommendedModeId && modes.some((mode) => mode.id === selectedModel.recommendedModeId)
      ? selectedModel.recommendedModeId
      : defaultModeId;
  return {
    modelId: selectedModel?.modelId ?? defaultModelId,
    modeId: selectedModeId,
  };
}

export function modeAfterModelChange({ currentModeId, previousProfile, nextProfile } = {}) {
  if (!nextProfile?.recommendedModeId) return currentModeId;
  if (!previousProfile?.recommendedModeId || currentModeId === previousProfile.recommendedModeId) {
    return nextProfile.recommendedModeId;
  }
  return currentModeId;
}
