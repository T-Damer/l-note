const defaultLocalModelProfile = localModelProfile(DEFAULT_LOCAL_MODEL_ID);

Object.assign(state, {
  selectedLocalModelId: DEFAULT_LOCAL_MODEL_ID,
  answerModeId: DEFAULT_ANSWER_MODE_ID,
  currentEvidenceModeId: null,
  lastModelLoad: null,
  localAiRuns: [],
  localModelCatalog: new Map(),
  localModelCatalogStatus: 'idle',
  localModelCatalogError: null,
  modelLoadState: createModelLoadState(defaultLocalModelProfile),
});

const localAiModel = create('select', {
  id: 'local-ai-model',
  className: 'model-select',
  'aria-label': 'Выбранная локальная модель',
});
for (const profile of LOCAL_MODEL_PROFILES) {
  localAiModel.append(
    create('option', {
      value: profile.modelId,
      selected: profile.modelId === DEFAULT_LOCAL_MODEL_ID,
      text: `${profile.label} · ${profile.role}`,
    }),
  );
}

const modelParameters = create('span', { className: 'model-compact-meta' });
const modelSize = create('span', { className: 'model-compact-meta' });
const modelRuntimeMemory = create('span', { className: 'model-compact-meta' });
const modelPower = create('span', { className: 'model-power is-checking' }, [
  create('span', { className: 'model-power-dot', 'aria-hidden': 'true' }),
  document.createTextNode('Проверка'),
]);
const modelProfileNote = create('p', { className: 'model-profile-note' });
const modelProgressText = create('span', { className: 'model-progress-text', text: 'Проверка локального хранилища…' });
const modelProgressPercent = create('strong', { className: 'model-progress-percent', text: '0%' });
const modelProgressBar = create('span', { className: 'model-progress-value' });
const modelProgressTrack = create('div', {
  className: 'model-progress-track',
  role: 'progressbar',
  'aria-label': 'Загрузка локальной модели',
  'aria-valuemin': '0',
  'aria-valuemax': '100',
  'aria-valuenow': '0',
}, [modelProgressBar]);
const modelProgressStats = create('div', { className: 'model-progress-stats' });
const modelLoadError = create('p', { className: 'model-load-error hidden' });
const modelLoadButton = Button({
  variant: 'primary',
  className: 'model-load-button',
  children: [Icon({ name: 'download', className: 'icon' }), document.createTextNode('Скачать и включить')],
});
const modelDownloadPanel = create('section', { className: 'model-download-panel' }, [
  create('div', { className: 'model-progress-heading' }, [modelProgressText, modelProgressPercent]),
  modelProgressTrack,
  modelProgressStats,
  modelLoadError,
  modelLoadButton,
]);

const modelActiveText = Text({
  variant: 'muted',
  as: 'p',
  text: 'Модель загружена в выделенный Web Worker. Веса останутся на диске после выгрузки из памяти.',
});
const modelUnloadButton = Button({
  variant: 'secondary',
  icon: 'unload',
  text: 'Выгрузить из памяти',
  className: 'model-unload-button',
});
const modelActivePanel = create('section', { className: 'model-active-panel hidden' }, [
  modelActiveText,
  modelUnloadButton,
]);

const modelLab = create('section', { className: 'model-control-panel' }, [
  create('div', { className: 'model-compact-row' }, [
    Field({
      label: 'Модель',
      control: localAiModel,
      className: 'model-picker',
    }),
    modelParameters,
    modelSize,
    modelRuntimeMemory,
    modelPower,
  ]),
  modelProfileNote,
  modelDownloadPanel,
  modelActivePanel,
]);

const answerModeSelect = create('select', {
  id: 'local-answer-mode',
  className: 'answer-mode-select',
  'aria-label': 'Режим локального ответа',
});
for (const mode of ANSWER_MODE_PROFILES) {
  answerModeSelect.append(create('option', {
    value: mode.id,
    selected: mode.id === DEFAULT_ANSWER_MODE_ID,
    text: mode.label,
  }));
}
const answerModeHint = create('p', { className: 'answer-mode-hint' });
const answerModePanel = create('section', { className: 'answer-mode-panel' }, [
  Field({
    label: 'Режим работы',
    control: answerModeSelect,
    className: 'answer-mode-field',
  }),
  answerModeHint,
]);

const modelControlSlot = document.querySelector('#model-control-slot');
const modelWorkspace = document.querySelector('#model-workspace');
const modelRunHistory = create('section', { className: 'answer-panel hidden', 'aria-live': 'polite' });
modelControlSlot?.replaceChildren(modelLab);
modelWorkspace?.prepend(answerModePanel);
dom.aiStatus.after(modelRunHistory);
Object.assign(dom, {
  localAiModel,
  answerModeSelect,
  answerModeHint,
  modelParameters,
  modelSize,
  modelRuntimeMemory,
  modelPower,
  modelProfileNote,
  modelProgressText,
  modelProgressPercent,
  modelProgressBar,
  modelProgressTrack,
  modelProgressStats,
  modelLoadError,
  modelLoadButton,
  modelDownloadPanel,
  modelActivePanel,
  modelActiveText,
  modelUnloadButton,
  modelWorkspace,
  modelRunHistory,
  localAiButton: document.querySelector('[data-action="load-local-ai"]'),
});

function selectedLocalModelProfile() {
  return localModelProfile(dom.localAiModel.value) ?? defaultLocalModelProfile;
}

function selectedAnswerModeProfile() {
  return answerModeProfile(dom.answerModeSelect.value);
}

function selectedLocalModelRecord(profile = selectedLocalModelProfile()) {
  return state.localModelCatalog.get(profile.modelId) ?? null;
}

function formatModelDuration(value) {
  if (!Number.isFinite(value)) return '—';
  if (value < 1000) return `${Math.round(value)} мс`;
  return `${(value / 1000).toFixed(value < 10_000 ? 1 : 0)} с`;
}

function formatDownloadSpeed(value) {
  return Number.isFinite(value) ? `${value.toFixed(1)} МБ/с` : 'скорость определяется';
}

function formatGenerationSpeed(value) {
  return Number.isFinite(value) ? `${value.toFixed(1)} ток/с` : 'скорость не сообщена';
}

function formatModelGigabytes(value) {
  return `${(Number(value ?? 0) / 1024).toFixed(1)} ГБ`;
}

function modelIsReady(profile = selectedLocalModelProfile()) {
  return Boolean(state.localAiReady && state.localAi.modelId === profile.modelId);
}

function modelIsCached(profile = selectedLocalModelProfile()) {
  return selectedLocalModelRecord(profile)?.cached === true;
}

function modelIsAvailable(profile = selectedLocalModelProfile()) {
  return selectedLocalModelRecord(profile)?.available !== false;
}

function localModelLifecycle(profile = selectedLocalModelProfile()) {
  if (modelIsReady(profile)) return { id: 'loaded', label: 'В памяти', className: 'is-on' };
  if (modelIsCached(profile)) return { id: 'cached', label: 'На диске', className: 'is-cached' };
  if (state.localModelCatalogStatus === 'loading') return { id: 'checking', label: 'Проверка', className: 'is-checking' };
  if (!modelIsAvailable(profile)) return { id: 'unavailable', label: 'Недоступна', className: 'is-off' };
  if (state.localModelCatalogStatus === 'error') return { id: 'unknown', label: 'Статус неизвестен', className: 'is-off' };
  return { id: 'missing', label: 'Не скачана', className: 'is-off' };
}

function markLocalModelCached(modelId, cached = true) {
  const profile = localModelProfile(modelId);
  const previous = state.localModelCatalog.get(modelId) ?? (profile ? { ...profile, available: true } : null);
  if (!previous) return;
  state.localModelCatalog.set(modelId, { ...previous, cached: Boolean(cached) });
  state.localModelCatalogStatus = 'ready';
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

function renderLocalModelDetails() {
  const profile = selectedLocalModelProfile();
  const lifecycle = localModelLifecycle(profile);
  state.selectedLocalModelId = profile.modelId;
  dom.modelParameters.textContent = profile.parameters;
  dom.modelSize.textContent = `веса ≈${formatModelGigabytes(profile.downloadSizeMB)}`;
  dom.modelRuntimeMemory.textContent = `память ≈${formatModelGigabytes(profile.runtimeMemoryMB)}`;
  dom.modelPower.className = `model-power ${lifecycle.className}`;
  dom.modelPower.replaceChildren(
    create('span', { className: 'model-power-dot', 'aria-hidden': 'true' }),
    document.createTextNode(lifecycle.label),
  );
  dom.modelProfileNote.textContent = `${profile.role} · ${profile.recommendedRamGB} ГБ+ общей памяти · ${profile.quantization} · контекст ${profile.contextWindow / 1024}K. ${profile.description}`;
}

function renderAnswerModeDetails() {
  const mode = selectedAnswerModeProfile();
  state.answerModeId = mode.id;
  dom.answerModeHint.textContent = `${mode.description} Используется приблизительный символьный бюджет, без предварительной токенизации документов.`;
}

function renderModelProgress() {
  const profile = selectedLocalModelProfile();
  const progressState = state.modelLoadState;
  const lifecycle = localModelLifecycle(profile);
  const loading = progressState.status === MODEL_LOAD_STATUS.LOADING;
  const hasError = progressState.status === MODEL_LOAD_STATUS.ERROR && progressState.error;
  const cachedIdle = lifecycle.id === 'cached' && !loading && !hasError;
  const checking = lifecycle.id === 'checking' && !loading;
  const progress = cachedIdle ? 1 : Math.max(0, Math.min(1, progressState.progress ?? 0));
  const percent = Math.round(progress * 100);

  if (cachedIdle) dom.modelProgressText.textContent = 'Веса уже сохранены на устройстве';
  else if (checking) dom.modelProgressText.textContent = 'Проверка локального хранилища…';
  else if (progressState.status === MODEL_LOAD_STATUS.IDLE) dom.modelProgressText.textContent = 'Модель ещё не скачана';
  else dom.modelProgressText.textContent = progressState.text;

  dom.modelProgressPercent.textContent = `${percent}%`;
  dom.modelProgressBar.style.width = `${percent}%`;
  dom.modelProgressTrack.setAttribute('aria-valuenow', String(percent));
  dom.modelDownloadPanel.classList.toggle('is-cached', cachedIdle);

  if (cachedIdle) {
    dom.modelProgressStats.replaceChildren(
      create('span', { text: `на диске ≈${formatModelGigabytes(profile.downloadSizeMB)}` }),
      create('span', { text: 'повторное скачивание не требуется' }),
      create('span', { text: 'после включения работает один Web Worker' }),
    );
  } else if (!loading && !hasError) {
    dom.modelProgressStats.replaceChildren(
      create('span', { text: `загрузка ≈${formatModelGigabytes(profile.downloadSizeMB)}` }),
      create('span', { text: `активная память ≈${formatModelGigabytes(profile.runtimeMemoryMB)}` }),
      create('span', { text: checking ? 'чтение состояния кэша' : 'первая загрузка требует сеть' }),
    );
  } else {
    dom.modelProgressStats.replaceChildren(
      create('span', { text: `на диск ≈${formatBytes(progressState.loadedMB * 1024 * 1024)} / ${formatBytes(progressState.totalMB * 1024 * 1024)}` }),
      create('span', { text: `осталось ≈${formatBytes(progressState.remainingMB * 1024 * 1024)}` }),
      create('span', { text: formatDownloadSpeed(progressState.speedMBps) }),
    );
  }

  dom.modelLoadError.classList.toggle('hidden', !hasError && state.localModelCatalogStatus !== 'error');
  dom.modelLoadError.textContent = hasError
    ? progressState.error
    : state.localModelCatalogStatus === 'error'
      ? `Не удалось проверить дисковый кэш: ${state.localModelCatalogError ?? 'неизвестная ошибка'}. Модель всё равно можно загрузить.`
      : '';

  const retry = progressState.status === MODEL_LOAD_STATUS.ERROR;
  const buttonLabel = retry
    ? 'Повторить загрузку'
    : cachedIdle
      ? 'Включить из кэша'
      : 'Скачать и включить';
  dom.modelLoadButton.replaceChildren(
    Icon({ name: retry ? 'retry' : cachedIdle ? 'model' : 'download', className: 'icon' }),
    document.createTextNode(buttonLabel),
  );
}

function syncLocalAiButton() {
  dom.localAiButton.replaceChildren(
    Icon({ name: 'model', className: 'icon' }),
    document.createTextNode('Ответить локальной моделью'),
  );
}

function renderModelPageState() {
  const profile = selectedLocalModelProfile();
  const lifecycle = localModelLifecycle(profile);
  const ready = lifecycle.id === 'loaded';
  const loading = state.modelLoadState.status === MODEL_LOAD_STATUS.LOADING;
  renderLocalModelDetails();
  renderAnswerModeDetails();
  renderModelProgress();
  dom.localAiModel.disabled = loading;
  dom.modelLoadButton.disabled = loading || !state.localAi.available || !modelIsAvailable(profile);
  dom.modelDownloadPanel.classList.toggle('hidden', ready);
  dom.modelActivePanel.classList.toggle('hidden', !ready);
  dom.modelUnloadButton.disabled = !ready || loading;
  dom.modelWorkspace?.classList.toggle('hidden', !ready);
  dom.answerOutput.classList.toggle('hidden', !ready);

  if (!state.localAi.available && !ready) {
    dom.modelProgressText.textContent = 'WebGPU или Web Worker недоступен';
    dom.modelLoadError.classList.remove('hidden');
    dom.modelLoadError.textContent = 'Этот браузер не может запустить локальную WebLLM-модель. Поиск по базе остаётся доступен на отдельной странице.';
  } else if (!modelIsAvailable(profile)) {
    dom.modelLoadError.classList.remove('hidden');
    dom.modelLoadError.textContent = 'Выбранная модель отсутствует во встроенном каталоге закреплённой версии WebLLM.';
  }

  if (ready) {
    const mode = selectedAnswerModeProfile();
    dom.modelActiveText.textContent = `${profile.label} работает в выделенном Web Worker. В памяти находится только эта модель; её веса останутся на диске после ручной выгрузки.`;
    dom.aiStatus.textContent = `${profile.label} включена. Режим «${mode.label}». Веса остаются в браузерном дисковом кэше.`;
  } else if (lifecycle.id === 'cached') {
    dom.aiStatus.textContent = `${profile.label}: веса найдены на диске. Включите модель, чтобы открыть форму вопроса.`;
  } else if (lifecycle.id === 'missing') {
    dom.aiStatus.textContent = `${profile.label}: сначала скачайте и включите модель. Поиск по базе работает отдельно без LLM.`;
  }
  syncLocalAiButton();
}

function renderModelRunHistory() {
  dom.modelRunHistory.replaceChildren();
  dom.modelRunHistory.classList.toggle('hidden', state.localAiRuns.length === 0);
  if (!state.localAiRuns.length) return;
  dom.modelRunHistory.append(
    create('div', { className: 'panel-title-row' }, [
      Icon({ name: 'model', className: 'panel-title-icon', size: 20 }),
      Text({ variant: 'title', text: 'Последние тесты моделей' }),
    ]),
  );
  for (const run of state.localAiRuns.slice(0, 6)) {
    const profile = localModelProfile(run.modelId);
    const mode = answerModeProfile(run.modeId);
    const status = run.grounded ? 'ссылки валидны' : 'нужна ручная проверка';
    dom.modelRunHistory.append(
      Text({
        variant: 'muted',
        text: `${profile?.label ?? run.modelId} · ${mode.label}: загрузка ${formatModelDuration(run.loadMs)}, ответ ${formatModelDuration(run.durationMs)}, ${formatGenerationSpeed(run.tokensPerSecond)}, ${status}.`,
      }),
    );
  }
}

async function refreshLocalModelCatalogState() {
  state.localModelCatalogStatus = 'loading';
  state.localModelCatalogError = null;
  renderModelPageState();
  try {
    const records = await state.localAi.inspectModels();
    state.localModelCatalog = new Map(records.map((record) => [record.modelId, record]));
    state.localModelCatalogStatus = 'ready';
  } catch (error) {
    state.localModelCatalogStatus = 'error';
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
  dom.localAiModel.value = preferences.modelId;
  dom.answerModeSelect.value = preferences.modeId;
  state.selectedLocalModelId = preferences.modelId;
  state.answerModeId = preferences.modeId;
}

async function persistLocalModelPreferences() {
  await Promise.all([
    storagePort.setSetting(MODEL_SELECTION_SETTING_KEY, dom.localAiModel.value),
    storagePort.setSetting(ANSWER_MODE_SETTING_KEY, dom.answerModeSelect.value),
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

dom.modelLoadButton.addEventListener('click', () => loadOrRunLocalAi(dom.modelLoadButton));
dom.modelUnloadButton.addEventListener('click', unloadActiveLocalModel);
dom.localAiModel.addEventListener('change', async () => {
  const nextModelId = dom.localAiModel.value;
  const previousSelectedProfile = localModelProfile(state.selectedLocalModelId);
  const nextProfile = selectedLocalModelProfile();
  const previousModelId = state.localAi.modelId;
  const nextModeId = modeAfterModelChange({
    currentModeId: dom.answerModeSelect.value,
    previousProfile: previousSelectedProfile,
    nextProfile,
  });
  state.selectedLocalModelId = nextModelId;
  state.localAiReady = false;
  if (previousModelId && previousModelId !== nextModelId) {
    dom.localAiModel.disabled = true;
    dom.modelProgressText.textContent = 'Выгрузка предыдущей модели…';
    try {
      await state.localAi.unload();
      markLocalModelCached(previousModelId, true);
    } catch (error) {
      toast(error instanceof Error ? error.message : String(error), 'error');
    }
  }
  if (nextModeId && nextModeId !== dom.answerModeSelect.value) {
    dom.answerModeSelect.value = nextModeId;
    state.answerModeId = nextModeId;
    state.currentEvidenceModeId = null;
  }
  await persistLocalModelPreferences();
  resetModelLoadState();
  renderModelPageState();
});
dom.answerModeSelect.addEventListener('change', async () => {
  state.answerModeId = selectedAnswerModeProfile().id;
  state.currentEvidenceModeId = null;
  await storagePort.setSetting(ANSWER_MODE_SETTING_KEY, state.answerModeId);
  renderAnswerModeDetails();
  if (modelIsReady()) {
    dom.aiStatus.textContent = `Режим изменён на «${selectedAnswerModeProfile().label}». Источники будут собраны заново при следующем ответе.`;
  }
});

resetModelLoadState();
renderModelPageState();
renderModelRunHistory();

Promise.all([
  restoreLocalModelPreferences(),
  refreshLocalModelCatalogState(),
]).then(() => {
  resetModelLoadState();
  renderModelPageState();
}).catch((error) => {
  state.localModelCatalogStatus = 'error';
  state.localModelCatalogError = error instanceof Error ? error.message : String(error);
  renderModelPageState();
});
