Object.assign(state, {
  selectedLocalModelId: DEFAULT_LOCAL_MODEL_ID,
  lastModelLoad: null,
  localAiRuns: [],
});

const localAiModel = create('select', {
  id: 'local-ai-model',
  className: 'secondary-button',
  'aria-label': 'Локальная модель для теста',
});
for (const profile of LOCAL_MODEL_PROFILES) {
  localAiModel.append(
    create('option', {
      value: profile.modelId,
      selected: profile.modelId === DEFAULT_LOCAL_MODEL_ID,
      text: `${profile.label} — ${profile.role}`,
    }),
  );
}

const localAiModelDetails = create('div', { className: 'storage-summary model-storage-summary' });
const modelRunHistory = create('section', { className: 'answer-panel hidden', 'aria-live': 'polite' });
const modelLab = create('section', { className: 'answer-panel model-lab' }, [
  create('div', { className: 'panel-title-row' }, [
    Icon({ name: 'model', className: 'panel-title-icon', size: 22 }),
    Text({ variant: 'title', text: 'Локальные модели для сравнения' }),
  ]),
  Text({
    variant: 'muted',
    text: 'Три независимых семейства работают в браузере через WebGPU: лёгкая Gemma 3, рекомендуемый Qwen3 и более тяжёлая Phi-4 Mini. Первая загрузка требует сети; затем веса остаются в кэше браузера.',
  }),
  create('label', { className: 'model-selector' }, [
    Text({ variant: 'label', text: 'Выберите модель' }),
    localAiModel,
  ]),
  localAiModelDetails,
]);

const composerActions = dom.askForm.querySelector('.composer-actions');
dom.askForm.insertBefore(modelLab, composerActions);
dom.aiStatus.after(modelRunHistory);
Object.assign(dom, {
  localAiModel,
  localAiModelDetails,
  modelRunHistory,
  localAiButton: document.querySelector('[data-action="load-local-ai"]'),
});

function selectedLocalModelProfile() {
  return localModelProfile(dom.localAiModel.value) ?? localModelProfile(DEFAULT_LOCAL_MODEL_ID);
}

function formatModelDuration(value) {
  if (!Number.isFinite(value)) return '—';
  if (value < 1000) return `${Math.round(value)} мс`;
  return `${(value / 1000).toFixed(value < 10_000 ? 1 : 0)} с`;
}

function formatModelSpeed(value) {
  return Number.isFinite(value) ? `${value.toFixed(1)} ток/с` : 'скорость не сообщена';
}

function renderLocalModelDetails() {
  const profile = selectedLocalModelProfile();
  state.selectedLocalModelId = profile.modelId;
  const ready = state.localAiReady && state.localAi.modelId === profile.modelId;
  dom.localAiModelDetails.replaceChildren(
    create('span', { text: profile.role }),
    create('span', { text: `VRAM ≈ ${formatBytes(profile.vramRequiredMB * 1024 * 1024)}` }),
    create('span', { text: ready ? 'Загружена и готова' : 'Не загружена' }),
  );
  dom.localAiModelDetails.append(Text({ variant: 'muted', text: profile.description }));
}

function syncLocalAiButton() {
  const ready = state.localAiReady && state.localAi.modelId === dom.localAiModel.value;
  dom.localAiButton.textContent = ready ? 'Ответить локальной моделью' : 'Загрузить выбранную модель';
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
        text: `${profile?.label ?? run.modelId}: загрузка ${formatModelDuration(run.loadMs)}, ответ ${formatModelDuration(run.durationMs)}, ${formatModelSpeed(run.tokensPerSecond)}, ${status}.`,
      }),
    );
  }
}

dom.localAiModel.addEventListener('change', () => {
  state.selectedLocalModelId = dom.localAiModel.value;
  state.localAiReady = Boolean(state.localAi.engine && state.localAi.modelId === state.selectedLocalModelId);
  renderLocalModelDetails();
  syncLocalAiButton();
  const profile = selectedLocalModelProfile();
  dom.aiStatus.textContent = state.localAiReady
    ? `${profile.label} уже загружена. Соберите доказательства и запустите ответ.`
    : `${profile.label} выбрана, но ещё не загружена.`;
});

renderLocalModelDetails();
syncLocalAiButton();
renderModelRunHistory();
