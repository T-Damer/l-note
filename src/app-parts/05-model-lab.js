const defaultLocalModelProfile = localModelProfile(DEFAULT_LOCAL_MODEL_ID);
Object.assign(state, {
  selectedLocalModelId: DEFAULT_LOCAL_MODEL_ID,
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
      text: profile.label,
    }),
  );
}

const modelParameters = create('span', { className: 'model-compact-meta' });
const modelSize = create('span', { className: 'model-compact-meta' });
const modelPower = create('span', { className: 'model-power is-off' }, [
  create('span', { className: 'model-power-dot', 'aria-hidden': 'true' }),
  document.createTextNode('Выкл'),
]);
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
    modelPower,
  ]),
  modelDownloadPanel,
]);

const modelControlSlot = document.querySelector('#model-control-slot');
const modelWorkspace = document.querySelector('#model-workspace');
const modelRunHistory = create('section', { className: 'answer-panel hidden', 'aria-live': 'polite' });
modelControlSlot?.replaceChildren(modelLab);
dom.aiStatus.after(modelRunHistory);
Object.assign(dom, {
  localAiModel,
  modelParameters,
  modelSize,
  modelPower,
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
  dom.modelSize.textContent = `≈${(profile.sizeMB / 1024).toFixed(1)} ГБ`;
  dom.modelPower.className = `model-power ${ready ? 'is-on' : 'is-off'}`;
  dom.modelPower.replaceChildren(
    create('span', { className: 'model-power-dot', 'aria-hidden': 'true' }),
    document.createTextNode(ready ? 'Вкл' : 'Выкл'),
  );
}

function renderModelProgress() {
  const progressState = state.modelLoadState;
  const percent = Math.round(Math.max(0, Math.min(1, progressState.progress ?? 0)) * 100);
  dom.modelProgressText.textContent = progressState.text;
  dom.modelProgressPercent.textContent = `${percent}%`;
  dom.modelProgressBar.style.width = `${percent}%`;
  dom.modelProgressTrack.setAttribute('aria-valuenow', String(percent));
  dom.modelProgressStats.replaceChildren(
    create('span', { text: `≈${formatBytes(progressState.loadedMB * 1024 * 1024)} / ${formatBytes(progressState.totalMB * 1024 * 1024)}` }),
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
  renderModelProgress();
  dom.localAiModel.disabled = loading;
  dom.modelLoadButton.disabled = loading || !state.localAi.available;
  dom.modelDownloadPanel.classList.toggle('hidden', ready);
  dom.modelWorkspace?.classList.toggle('hidden', !ready);
  dom.answerOutput.classList.toggle('hidden', !ready);
  if (!state.localAi.available && !ready) {
    dom.modelProgressText.textContent = 'WebGPU недоступен';
    dom.modelLoadError.classList.remove('hidden');
    dom.modelLoadError.textContent = 'Этот браузер не может запустить локальную WebLLM-модель. Поиск по базе остаётся доступен на отдельной странице.';
  }
  if (ready) {
    dom.aiStatus.textContent = `${profile.label} ${profile.parameters} включена. Сформулируйте вопрос и соберите локальные источники.`;
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
    const status = run.grounded ? 'ссылки валидны' : 'нужна ручная проверка';
    dom.modelRunHistory.append(
      Text({
        variant: 'muted',
        text: `${profile?.label ?? run.modelId}: загрузка ${formatModelDuration(run.loadMs)}, ответ ${formatModelDuration(run.durationMs)}, ${formatGenerationSpeed(run.tokensPerSecond)}, ${status}.`,
      }),
    );
  }
}

dom.modelLoadButton.addEventListener('click', () => loadOrRunLocalAi(dom.modelLoadButton));
dom.localAiModel.addEventListener('change', () => {
  state.selectedLocalModelId = dom.localAiModel.value;
  state.localAiReady = Boolean(state.localAi.engine && state.localAi.modelId === state.selectedLocalModelId);
  resetModelLoadState();
  renderModelPageState();
});

resetModelLoadState();
renderModelPageState();
renderModelRunHistory();
