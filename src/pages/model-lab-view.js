import { formatDownloadSpeed, formatDurationMs, formatGenerationSpeed, formatGigabytesFromMegabytes, formatMegabytes } from '../helpers/model-formatters.js';
import { MODEL_CATALOG_STATUS } from '../services/model-lifecycle.js';
import { MODEL_LOAD_STATUS } from '../services/model-progress.js';
import { Button, Field } from '../ui/components.js';
import { Icon } from '../ui/icons.js';
import { Text } from '../ui/text.js';

function element(tag, attributes = {}, children = []) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(attributes)) {
    if (value === undefined || value === null || value === false) continue;
    if (key === 'className') node.className = String(value);
    else if (key === 'text') node.textContent = String(value);
    else if (key in node) node[key] = value;
    else node.setAttribute(key, value === true ? '' : String(value));
  }
  for (const child of Array.isArray(children) ? children : [children]) {
    if (child === undefined || child === null) continue;
    node.append(child instanceof Node ? child : document.createTextNode(String(child)));
  }
  return node;
}

function createModelSelect(profiles, defaultModelId) {
  const select = element('select', {
    id: 'local-ai-model',
    className: 'model-select',
    'aria-label': 'Выбранная локальная модель',
  });
  for (const profile of profiles) {
    select.append(element('option', {
      value: profile.modelId,
      selected: profile.modelId === defaultModelId,
      text: `${profile.label} · ${profile.role}`,
    }));
  }
  return select;
}

function createAnswerModeSelect(modes, defaultModeId) {
  const select = element('select', {
    id: 'local-answer-mode',
    className: 'answer-mode-select',
    'aria-label': 'Режим локального ответа',
  });
  for (const mode of modes) {
    select.append(element('option', {
      value: mode.id,
      selected: mode.id === defaultModeId,
      text: mode.label,
    }));
  }
  return select;
}

function buildView({ profiles, answerModes, defaultModelId, defaultModeId }) {
  const localAiModel = createModelSelect(profiles, defaultModelId);
  const answerModeSelect = createAnswerModeSelect(answerModes, defaultModeId);
  const modelParameters = element('span', { className: 'model-compact-meta' });
  const modelSize = element('span', { className: 'model-compact-meta' });
  const modelRuntimeMemory = element('span', { className: 'model-compact-meta' });
  const modelPower = element('span', { className: 'model-power is-checking' }, [
    element('span', { className: 'model-power-dot', 'aria-hidden': 'true' }),
    document.createTextNode('Проверка'),
  ]);
  const modelProfileNote = element('p', { className: 'model-profile-note' });
  const modelProgressText = element('span', { className: 'model-progress-text', text: 'Проверка локального хранилища…' });
  const modelProgressPercent = element('strong', { className: 'model-progress-percent', text: '0%' });
  const modelProgressBar = element('span', { className: 'model-progress-value' });
  const modelProgressTrack = element('div', {
    className: 'model-progress-track',
    role: 'progressbar',
    'aria-label': 'Загрузка локальной модели',
    'aria-valuemin': '0',
    'aria-valuemax': '100',
    'aria-valuenow': '0',
  }, [modelProgressBar]);
  const modelProgressStats = element('div', { className: 'model-progress-stats' });
  const modelLoadError = element('p', { className: 'model-load-error hidden' });
  const modelLoadButton = Button({
    variant: 'primary',
    className: 'model-load-button',
    icon: 'download',
    text: 'Скачать и включить',
  });
  const modelDownloadPanel = element('section', { className: 'model-download-panel' }, [
    element('div', { className: 'model-progress-heading' }, [modelProgressText, modelProgressPercent]),
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
  const modelActivePanel = element('section', { className: 'model-active-panel hidden' }, [
    modelActiveText,
    modelUnloadButton,
  ]);
  const modelLab = element('section', { className: 'model-control-panel' }, [
    element('div', { className: 'model-compact-row' }, [
      Field({ label: 'Модель', control: localAiModel, className: 'model-picker' }),
      modelParameters,
      modelSize,
      modelRuntimeMemory,
      modelPower,
    ]),
    modelProfileNote,
    modelDownloadPanel,
    modelActivePanel,
  ]);
  const answerModeHint = element('p', { className: 'answer-mode-hint' });
  const answerModePanel = element('section', { className: 'answer-mode-panel' }, [
    Field({ label: 'Режим работы', control: answerModeSelect, className: 'answer-mode-field' }),
    answerModeHint,
  ]);
  const modelRunHistory = element('section', { className: 'answer-panel hidden', 'aria-live': 'polite' });

  return {
    modelLab,
    answerModePanel,
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
    modelRunHistory,
  };
}

function renderProgress(elements, { profile, lifecycle, progressState, catalogStatus, catalogError }) {
  const loading = progressState.status === MODEL_LOAD_STATUS.LOADING;
  const hasError = progressState.status === MODEL_LOAD_STATUS.ERROR && progressState.error;
  const cachedIdle = lifecycle.id === 'cached' && !loading && !hasError;
  const checking = lifecycle.id === 'checking' && !loading;
  const progress = cachedIdle ? 1 : Math.max(0, Math.min(1, progressState.progress ?? 0));
  const percent = Math.round(progress * 100);

  elements.modelProgressText.textContent = cachedIdle
    ? 'Веса уже сохранены на устройстве'
    : checking
      ? 'Проверка локального хранилища…'
      : progressState.status === MODEL_LOAD_STATUS.IDLE
        ? 'Модель ещё не скачана'
        : progressState.text;
  elements.modelProgressPercent.textContent = `${percent}%`;
  elements.modelProgressBar.style.width = `${percent}%`;
  elements.modelProgressTrack.setAttribute('aria-valuenow', String(percent));
  elements.modelDownloadPanel.classList.toggle('is-cached', cachedIdle);

  if (cachedIdle) {
    elements.modelProgressStats.replaceChildren(
      element('span', { text: `на диске ≈${formatGigabytesFromMegabytes(profile.downloadSizeMB)}` }),
      element('span', { text: 'повторное скачивание не требуется' }),
      element('span', { text: 'после включения работает один Web Worker' }),
    );
  } else if (!loading && !hasError) {
    elements.modelProgressStats.replaceChildren(
      element('span', { text: `загрузка ≈${formatGigabytesFromMegabytes(profile.downloadSizeMB)}` }),
      element('span', { text: `активная память ≈${formatGigabytesFromMegabytes(profile.runtimeMemoryMB)}` }),
      element('span', { text: checking ? 'чтение состояния кэша' : 'первая загрузка требует сеть' }),
    );
  } else {
    elements.modelProgressStats.replaceChildren(
      element('span', { text: `на диск ≈${formatMegabytes(progressState.loadedMB)} / ${formatMegabytes(progressState.totalMB)}` }),
      element('span', { text: `осталось ≈${formatMegabytes(progressState.remainingMB)}` }),
      element('span', { text: formatDownloadSpeed(progressState.speedMBps) }),
    );
  }

  const catalogFailed = catalogStatus === MODEL_CATALOG_STATUS.ERROR;
  elements.modelLoadError.classList.toggle('hidden', !hasError && !catalogFailed);
  elements.modelLoadError.textContent = hasError
    ? progressState.error
    : catalogFailed
      ? `Не удалось проверить дисковый кэш: ${catalogError ?? 'неизвестная ошибка'}. Модель всё равно можно загрузить.`
      : '';
  const retry = progressState.status === MODEL_LOAD_STATUS.ERROR;
  elements.modelLoadButton.replaceChildren(
    Icon({ name: retry ? 'retry' : cachedIdle ? 'model' : 'download', className: 'icon' }),
    document.createTextNode(retry ? 'Повторить загрузку' : cachedIdle ? 'Включить из кэша' : 'Скачать и включить'),
  );
}

export function createModelLabView({
  profiles,
  answerModes,
  defaultModelId,
  defaultModeId,
  controlSlot,
  workspace,
  answerOutput,
  aiStatus,
  localAiButton,
} = {}) {
  const elements = buildView({ profiles, answerModes, defaultModelId, defaultModeId });
  controlSlot?.replaceChildren(elements.modelLab);
  workspace?.prepend(elements.answerModePanel);
  aiStatus?.after(elements.modelRunHistory);

  function setSelections({ modelId, modeId }) {
    if (modelId) elements.localAiModel.value = modelId;
    if (modeId) elements.answerModeSelect.value = modeId;
  }

  function render({
    profile,
    mode,
    lifecycle,
    progressState,
    catalogStatus,
    catalogError,
    runtimeAvailable,
    modelAvailable,
  }) {
    const ready = lifecycle.id === 'loaded';
    const loading = progressState.status === MODEL_LOAD_STATUS.LOADING;
    elements.modelParameters.textContent = profile.parameters;
    elements.modelSize.textContent = `веса ≈${formatGigabytesFromMegabytes(profile.downloadSizeMB)}`;
    elements.modelRuntimeMemory.textContent = `память ≈${formatGigabytesFromMegabytes(profile.runtimeMemoryMB)}`;
    elements.modelPower.className = `model-power ${lifecycle.className}`;
    elements.modelPower.replaceChildren(
      element('span', { className: 'model-power-dot', 'aria-hidden': 'true' }),
      document.createTextNode(lifecycle.label),
    );
    elements.modelProfileNote.textContent = `${profile.role} · ${profile.recommendedRamGB} ГБ+ общей памяти · ${profile.quantization} · контекст ${profile.contextWindow / 1024}K. ${profile.description}`;
    elements.answerModeHint.textContent = `${mode.description} Используется приблизительный символьный бюджет, без предварительной токенизации документов.`;
    renderProgress(elements, { profile, lifecycle, progressState, catalogStatus, catalogError });

    elements.localAiModel.disabled = loading;
    elements.modelLoadButton.disabled = loading || !runtimeAvailable || !modelAvailable;
    elements.modelDownloadPanel.classList.toggle('hidden', ready);
    elements.modelActivePanel.classList.toggle('hidden', !ready);
    elements.modelUnloadButton.disabled = !ready || loading;
    workspace?.classList.toggle('hidden', !ready);
    answerOutput?.classList.toggle('hidden', !ready);

    if (!runtimeAvailable && !ready) {
      elements.modelProgressText.textContent = 'WebGPU или Web Worker недоступен';
      elements.modelLoadError.classList.remove('hidden');
      elements.modelLoadError.textContent = 'Этот браузер не может запустить локальную WebLLM-модель. Поиск по базе остаётся доступен на отдельной странице.';
    } else if (!modelAvailable) {
      elements.modelLoadError.classList.remove('hidden');
      elements.modelLoadError.textContent = 'Выбранная модель отсутствует во встроенном каталоге закреплённой версии WebLLM.';
    }

    if (ready) {
      elements.modelActiveText.textContent = `${profile.label} работает в выделенном Web Worker. В памяти находится только эта модель; её веса останутся на диске после ручной выгрузки.`;
      if (aiStatus) aiStatus.textContent = `${profile.label} включена. Режим «${mode.label}». Веса остаются в браузерном дисковом кэше.`;
    } else if (lifecycle.id === 'cached') {
      if (aiStatus) aiStatus.textContent = `${profile.label}: веса найдены на диске. Включите модель, чтобы открыть форму вопроса.`;
    } else if (lifecycle.id === 'missing') {
      if (aiStatus) aiStatus.textContent = `${profile.label}: сначала скачайте и включите модель. Поиск по базе работает отдельно без LLM.`;
    }
  }

  function renderHistory(runs, { profileById, modeById }) {
    elements.modelRunHistory.replaceChildren();
    elements.modelRunHistory.classList.toggle('hidden', runs.length === 0);
    if (!runs.length) return;
    elements.modelRunHistory.append(element('div', { className: 'panel-title-row' }, [
      Icon({ name: 'model', className: 'panel-title-icon', size: 20 }),
      Text({ variant: 'title', text: 'Последние тесты моделей' }),
    ]));
    for (const run of runs.slice(0, 6)) {
      const profile = profileById(run.modelId);
      const mode = modeById(run.modeId);
      const status = run.grounded ? 'ссылки валидны' : 'нужна ручная проверка';
      elements.modelRunHistory.append(Text({
        variant: 'muted',
        text: `${profile?.label ?? run.modelId} · ${mode.label}: загрузка ${formatDurationMs(run.loadMs)}, ответ ${formatDurationMs(run.durationMs)}, ${formatGenerationSpeed(run.tokensPerSecond)}, ${status}.`,
      }));
    }
  }

  function resetAnswerButton() {
    localAiButton?.replaceChildren(
      Icon({ name: 'model', className: 'icon' }),
      document.createTextNode('Ответить локальной моделью'),
    );
  }

  return {
    elements: {
      ...elements,
      modelWorkspace: workspace,
      localAiButton,
    },
    selectedModelId: () => elements.localAiModel.value,
    selectedModeId: () => elements.answerModeSelect.value,
    setSelections,
    render,
    renderHistory,
    resetAnswerButton,
  };
}
