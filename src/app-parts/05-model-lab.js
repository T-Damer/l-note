const defaultLocalModelProfile = localModelProfile(DEFAULT_LOCAL_MODEL_ID);
Object.assign(state, {
  selectedLocalModelId: DEFAULT_LOCAL_MODEL_ID,
  answerModeId: DEFAULT_ANSWER_MODE_ID,
  currentEvidenceModeId: null,
  lastModelLoad: null,
  localAiRuns: [],
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
const modelPower = create('span', { className: 'model-power is-off' }, [
  create('span', { className: 'model-power-dot', 'aria-hidden': 'true' }),
  document.createTextNode('Выкл'),
]);
const modelProfileNote = create('p', { className: 'model-profile-note' });
const modelProgressText = create('span', { className: 'model-progress-text', text: 'Модель выключена' });
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
  children: [Icon({ name: 'download', className: 'icon' }), document.createTextNode('Загрузить и включить')],
});
const modelDownloadPanel = create('section', { className: 'model-download-panel' }, [
  create('div', { className: 'model-progress-heading' }, [modelProgressText, modelProgressPercent]),
  modelProgressTrack,
  modelProgressStats,
  modelLoadError,
  modelLoadButton,
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
  state.selectedLocalModelId = profile.modelId;
  const ready = modelIsReady(profile);
  dom.modelParameters.textContent = profile.parameters;
  dom.modelSize.textContent = `веса ≈${formatModelGigabytes(profile.downloadSizeMB)}`;
  dom.modelRuntimeMemory.textContent = `память ≈${formatModelGigabytes(profile.runtimeMemoryMB)}`;
  dom.modelPower.className = `model-power ${ready ? 'is-on' : 'is-off'}`;
  dom.modelPower.replaceChildren(
    create('span', { className: 'model-power-dot', 'aria-hidden': 'true' }),
    document.createTextNode(ready ? 'Вкл' : 'Выкл'),
  );
  dom.modelProfileNote.textContent = `${profile.role} · ${profile.recommendedRamGB} ГБ+ общей памяти · ${profile.quantization} · контекст ${profile.contextWindow / 1024}K. ${profile.description}`;
}

function renderAnswerModeDetails() {
  const mode = selectedAnswerModeProfile();
  state.answerModeId = mode.id;
  dom.answerModeHint.textContent = `${mode.description} Используется приблизительный символьный бюджет, без предварительной токенизации документов.`;
}

function renderModelProgress() {
  const progressState = state.modelLoadState;
  const percent = Math.round(Math.max(0, Math.min(1, progressState.progress ?? 0)) * 100);
  dom.modelProgressText.textContent = progressState.text;
  dom.modelProgressPercent.textContent = `${percent}%`;
  dom.modelProgressBar.style.width = `${percent}%`;
  dom.modelProgressTrack.setAttribute('aria-valuenow', String(percent));
  dom.modelProgressStats.replaceChildren(
    create('span', { text: `на диск ≈${formatBytes(progressState.loadedMB * 1024 * 1024)} / ${formatBytes(progressState.totalMB * 1024 * 1024)}` }),
    create('span', { text: `осталось ≈${formatBytes(progressState.remainingMB * 1024 * 1024)}` }),
    create('span', { text: formatDownloadSpeed(progressState.speedMBps) }),
  );
  const hasError = progressState.status === MODEL_LOAD_STATUS.ERROR && progressState.error;
  dom.modelLoadError.classList.toggle('hidden', !hasError);
  dom.modelLoadError.textContent = hasError ? progressState.error : '';
  dom.modelLoadButton.replaceChildren(
    Icon({ name: progressState.status === MODEL_LOAD_STATUS.ERROR ? 'retry' : 'download', className: 'icon' }),
    document.createTextNode(progressState.status === MODEL_LOAD_STATUS.ERROR ? 'Повторить загрузку' : 'Загрузить и включить'),
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
  const ready = modelIsReady(profile);
  const loading = state.modelLoadState.status === MODEL_LOAD_STATUS.LOADING;
  renderLocalModelDetails();
  renderAnswerModeDetails();
  renderModelProgress();
  dom.localAiModel.disabled = loading;
  dom.modelLoadButton.disabled = loading || !state.localAi.available;
  dom.modelDownloadPanel.classList.toggle('hidden', ready);
  dom.modelWorkspace?.classList.toggle('hidden', !ready);
  dom.answerOutput.classList.toggle('hidden', !ready);
  if (!state.localAi.available && !ready) {
    dom.modelProgressText.textContent = 'WebGPU или Web Worker недоступен';
    dom.modelLoadError.classList.remove('hidden');
    dom.modelLoadError.textContent = 'Этот браузер не может запустить локальную WebLLM-модель. Поиск по базе остаётся доступен на отдельной странице.';
  }
  if (ready) {
    const mode = selectedAnswerModeProfile();
    dom.aiStatus.textContent = `${profile.label} включена в Web Worker. Режим «${mode.label}». Веса остаются в браузерном дисковом кэше.`;
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

dom.modelLoadButton.addEventListener('click', () => loadOrRunLocalAi(dom.modelLoadButton));
dom.localAiModel.addEventListener('change', async () => {
  const nextModelId = dom.localAiModel.value;
  const previousModelId = state.localAi.modelId;
  state.selectedLocalModelId = nextModelId;
  state.localAiReady = false;
  if (previousModelId && previousModelId !== nextModelId) {
    dom.localAiModel.disabled = true;
    dom.modelProgressText.textContent = 'Выгрузка предыдущей модели…';
    try {
      await state.localAi.unload();
    } catch (error) {
      toast(error instanceof Error ? error.message : String(error), 'error');
    }
  }
  resetModelLoadState();
  renderModelPageState();
});
dom.answerModeSelect.addEventListener('change', () => {
  state.answerModeId = selectedAnswerModeProfile().id;
  state.currentEvidenceModeId = null;
  renderAnswerModeDetails();
  if (modelIsReady()) {
    dom.aiStatus.textContent = `Режим изменён на «${selectedAnswerModeProfile().label}». Источники будут собраны заново при следующем ответе.`;
  }
});

resetModelLoadState();
renderModelPageState();
renderModelRunHistory();
