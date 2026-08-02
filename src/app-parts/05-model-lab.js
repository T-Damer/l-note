const defaultLocalModelProfile = localModelProfile(DEFAULT_LOCAL_MODEL_ID);

Object.assign(state, {
  selectedLocalModelId: DEFAULT_LOCAL_MODEL_ID,
  answerModeId: DEFAULT_ANSWER_MODE_ID,
  currentEvidenceModeId: null,
  lastModelLoad: null,
  localAiRuns: [],
  localModelCatalog: new Map(),
  localModelCatalogStatus: MODEL_CATALOG_STATUS.IDLE,
  localModelCatalogError: null,
  modelLoadState: createModelLoadState(defaultLocalModelProfile),
});

const modelLabView = createModelLabView({
  profiles: LOCAL_MODEL_PROFILES,
  answerModes: ANSWER_MODE_PROFILES,
  defaultModelId: DEFAULT_LOCAL_MODEL_ID,
  defaultModeId: DEFAULT_ANSWER_MODE_ID,
  controlSlot: document.querySelector('#model-control-slot'),
  workspace: document.querySelector('#model-workspace'),
  answerOutput: dom.answerOutput,
  aiStatus: dom.aiStatus,
  localAiButton: document.querySelector('[data-action="load-local-ai"]'),
});
Object.assign(dom, modelLabView.elements);

function selectedLocalModelProfile() {
  return localModelProfile(modelLabView.selectedModelId()) ?? defaultLocalModelProfile;
}

function selectedAnswerModeProfile() {
  return answerModeProfile(modelLabView.selectedModeId());
}

function modelIsReady(profile = selectedLocalModelProfile()) {
  return Boolean(state.localAiReady && state.localAi.modelId === profile.modelId);
}

function modelIsAvailable(profile = selectedLocalModelProfile()) {
  return isModelAvailable(state.localModelCatalog, profile);
}

function localModelLifecycle(profile = selectedLocalModelProfile()) {
  return resolveModelLifecycle({
    profile,
    catalog: state.localModelCatalog,
    catalogStatus: state.localModelCatalogStatus,
    activeModelId: state.localAi.modelId,
    active: state.localAiReady,
  });
}

function markLocalModelCached(modelId, cached = true) {
  const profile = localModelProfile(modelId);
  state.localModelCatalog = updateModelCachedCatalog(state.localModelCatalog, profile, cached);
  state.localModelCatalogStatus = MODEL_CATALOG_STATUS.READY;
}

function resetModelLoadState(profile = selectedLocalModelProfile()) {
  state.modelLoadState = modelIsReady(profile)
    ? completeModelLoad(createModelLoadState(profile))
    : createModelLoadState(profile);
}

function beginLocalModelLoad(profile = selectedLocalModelProfile()) {
  state.modelLoadState = startModelLoad(state.modelLoadState, profile);
  renderModelPageState();
}

function reportLocalModelProgress(progress) {
  state.modelLoadState = updateModelLoadProgress(state.modelLoadState, progress);
  renderModelPageState();
}

function finishLocalModelLoad() {
  state.modelLoadState = completeModelLoad(state.modelLoadState);
  renderModelPageState();
}

function rejectLocalModelLoad(error) {
  state.modelLoadState = failModelLoad(state.modelLoadState, error);
  renderModelPageState();
}

function syncLocalAiButton() {
  modelLabView.resetAnswerButton();
}

function renderModelPageState() {
  const profile = selectedLocalModelProfile();
  const mode = selectedAnswerModeProfile();
  const lifecycle = localModelLifecycle(profile);
  state.selectedLocalModelId = profile.modelId;
  state.answerModeId = mode.id;
  modelLabView.render({
    profile,
    mode,
    lifecycle,
    progressState: state.modelLoadState,
    catalogStatus: state.localModelCatalogStatus,
    catalogError: state.localModelCatalogError,
    runtimeAvailable: state.localAi.available,
    modelAvailable: modelIsAvailable(profile),
  });
  syncLocalAiButton();
}

function renderModelRunHistory() {
  modelLabView.renderHistory(state.localAiRuns, {
    profileById: localModelProfile,
    modeById: answerModeProfile,
  });
}

async function refreshLocalModelCatalogState() {
  state.localModelCatalogStatus = MODEL_CATALOG_STATUS.LOADING;
  state.localModelCatalogError = null;
  renderModelPageState();
  try {
    state.localModelCatalog = indexModelCatalog(await state.localAi.inspectModels());
    state.localModelCatalogStatus = MODEL_CATALOG_STATUS.READY;
  } catch (error) {
    state.localModelCatalogStatus = MODEL_CATALOG_STATUS.ERROR;
    state.localModelCatalogError = error instanceof Error ? error.message : String(error);
  }
  renderModelPageState();
}

async function restoreLocalModelPreferences() {
  const [storedModelId, storedModeId] = await Promise.all([
    storagePort.getSetting(MODEL_SELECTION_SETTING_KEY, DEFAULT_LOCAL_MODEL_ID),
    storagePort.getSetting(ANSWER_MODE_SETTING_KEY, DEFAULT_ANSWER_MODE_ID),
  ]);
  const preferences = resolveLocalModelPreferences({
    storedModelId,
    storedModeId,
    modelProfiles: LOCAL_MODEL_PROFILES,
    answerModes: ANSWER_MODE_PROFILES,
    defaultModelId: DEFAULT_LOCAL_MODEL_ID,
    defaultModeId: DEFAULT_ANSWER_MODE_ID,
  });
  modelLabView.setSelections(preferences);
  state.selectedLocalModelId = preferences.modelId;
  state.answerModeId = preferences.modeId;
}

async function persistLocalModelPreferences() {
  await Promise.all([
    storagePort.setSetting(MODEL_SELECTION_SETTING_KEY, modelLabView.selectedModelId()),
    storagePort.setSetting(ANSWER_MODE_SETTING_KEY, modelLabView.selectedModeId()),
  ]);
}

async function unloadActiveLocalModel() {
  if (!modelIsReady()) return;
  dom.modelUnloadButton.disabled = true;
  dom.localAiModel.disabled = true;
  dom.aiStatus.textContent = 'Выгрузка модели из памяти…';
  try {
    const unloadedModelId = state.localAi.modelId;
    await state.localAi.unload();
    state.localAiReady = false;
    state.lastModelLoad = null;
    if (unloadedModelId) markLocalModelCached(unloadedModelId, true);
    resetModelLoadState();
    renderModelPageState();
    toast('Модель выгружена из памяти. Загруженные веса сохранены на диске.');
  } catch (error) {
    toast(error instanceof Error ? error.message : String(error), 'error');
  } finally {
    dom.localAiModel.disabled = false;
    dom.modelUnloadButton.disabled = false;
  }
}

async function handleLocalModelChange() {
  const nextModelId = modelLabView.selectedModelId();
  const previousProfile = localModelProfile(state.selectedLocalModelId);
  const nextProfile = selectedLocalModelProfile();
  const activeModelId = state.localAi.modelId;
  const nextModeId = modeAfterModelChange({
    currentModeId: modelLabView.selectedModeId(),
    previousProfile,
    nextProfile,
  });

  state.selectedLocalModelId = nextModelId;
  state.localAiReady = false;
  if (activeModelId && activeModelId !== nextModelId) {
    dom.localAiModel.disabled = true;
    dom.modelProgressText.textContent = 'Выгрузка предыдущей модели…';
    try {
      await state.localAi.unload();
      markLocalModelCached(activeModelId, true);
    } catch (error) {
      toast(error instanceof Error ? error.message : String(error), 'error');
    }
  }

  if (nextModeId && nextModeId !== modelLabView.selectedModeId()) {
    modelLabView.setSelections({ modeId: nextModeId });
    state.answerModeId = nextModeId;
    state.currentEvidenceModeId = null;
  }
  await persistLocalModelPreferences();
  resetModelLoadState();
  renderModelPageState();
}

async function handleAnswerModeChange() {
  state.answerModeId = selectedAnswerModeProfile().id;
  state.currentEvidenceModeId = null;
  await storagePort.setSetting(ANSWER_MODE_SETTING_KEY, state.answerModeId);
  renderModelPageState();
  if (modelIsReady()) {
    dom.aiStatus.textContent = `Режим изменён на «${selectedAnswerModeProfile().label}». Источники будут собраны заново при следующем ответе.`;
  }
}

dom.modelLoadButton.addEventListener('click', () => loadOrRunLocalAi(dom.modelLoadButton));
dom.modelUnloadButton.addEventListener('click', unloadActiveLocalModel);
dom.localAiModel.addEventListener('change', handleLocalModelChange);
dom.answerModeSelect.addEventListener('change', handleAnswerModeChange);

resetModelLoadState();
renderModelPageState();
renderModelRunHistory();

Promise.all([restoreLocalModelPreferences(), refreshLocalModelCatalogState()])
  .then(() => {
    resetModelLoadState();
    renderModelPageState();
  })
  .catch((error) => {
    state.localModelCatalogStatus = MODEL_CATALOG_STATUS.ERROR;
    state.localModelCatalogError = error instanceof Error ? error.message : String(error);
    renderModelPageState();
  });
