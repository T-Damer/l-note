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
