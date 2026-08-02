import {
  formatDownloadSpeed,
  formatDurationMs,
  formatGenerationSpeed,
  formatGigabytesFromMegabytes,
  formatMegabytes,
} from '../helpers/model-formatters.js';
import { MODEL_CATALOG_STATUS } from '../services/model-lifecycle.js';
import { MODEL_LOAD_STATUS } from '../services/model-progress.js';
import { Icon } from '../ui/icons.js';
import { element } from '../ui/dom.js';
import { Text } from '../ui/text.js';
import { createModelLabElements } from './model-lab-elements.js';

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

  renderProgressStats(elements, { profile, progressState, loading, hasError, cachedIdle, checking });
  renderProgressError(elements, { progressState, catalogStatus, catalogError });
  renderLoadButton(elements, { progressState, cachedIdle });
}

function renderProgressStats(elements, { profile, progressState, loading, hasError, cachedIdle, checking }) {
  if (cachedIdle) {
    elements.modelProgressStats.replaceChildren(
      element('span', { text: `на диске ≈${formatGigabytesFromMegabytes(profile.downloadSizeMB)}` }),
      element('span', { text: 'повторное скачивание не требуется' }),
      element('span', { text: 'после включения работает один Web Worker' }),
    );
    return;
  }
  if (!loading && !hasError) {
    elements.modelProgressStats.replaceChildren(
      element('span', { text: `загрузка ≈${formatGigabytesFromMegabytes(profile.downloadSizeMB)}` }),
      element('span', { text: `активная память ≈${formatGigabytesFromMegabytes(profile.runtimeMemoryMB)}` }),
      element('span', { text: checking ? 'чтение состояния кэша' : 'первая загрузка требует сеть' }),
    );
    return;
  }
  elements.modelProgressStats.replaceChildren(
    element('span', { text: `на диск ≈${formatMegabytes(progressState.loadedMB)} / ${formatMegabytes(progressState.totalMB)}` }),
    element('span', { text: `осталось ≈${formatMegabytes(progressState.remainingMB)}` }),
    element('span', { text: formatDownloadSpeed(progressState.speedMBps) }),
  );
}

function renderProgressError(elements, { progressState, catalogStatus, catalogError }) {
  const hasError = progressState.status === MODEL_LOAD_STATUS.ERROR && progressState.error;
  const catalogFailed = catalogStatus === MODEL_CATALOG_STATUS.ERROR;
  elements.modelLoadError.classList.toggle('hidden', !hasError && !catalogFailed);
  elements.modelLoadError.textContent = hasError
    ? progressState.error
    : catalogFailed
      ? `Не удалось проверить дисковый кэш: ${catalogError ?? 'неизвестная ошибка'}. Модель всё равно можно загрузить.`
      : '';
}

function renderLoadButton(elements, { progressState, cachedIdle }) {
  const retry = progressState.status === MODEL_LOAD_STATUS.ERROR;
  elements.modelLoadButton.replaceChildren(
    Icon({ name: retry ? 'retry' : cachedIdle ? 'model' : 'download', className: 'icon' }),
    document.createTextNode(retry ? 'Повторить загрузку' : cachedIdle ? 'Включить из кэша' : 'Скачать и включить'),
  );
}

function renderRuntimeAvailability(elements, { runtimeAvailable, modelAvailable, ready }) {
  if (!runtimeAvailable && !ready) {
    elements.modelProgressText.textContent = 'WebGPU или Web Worker недоступен';
    elements.modelLoadError.classList.remove('hidden');
    elements.modelLoadError.textContent = 'Этот браузер не может запустить локальную WebLLM-модель. Поиск по базе остаётся доступен на отдельной странице.';
    return;
  }
  if (!modelAvailable) {
    elements.modelLoadError.classList.remove('hidden');
    elements.modelLoadError.textContent = 'Выбранная модель отсутствует во встроенном каталоге закреплённой версии WebLLM.';
  }
}

function renderLifecycleStatus(elements, { profile, mode, lifecycle, aiStatus }) {
  if (lifecycle.id === 'loaded') {
    elements.modelActiveText.textContent = `${profile.label} работает в выделенном Web Worker. В памяти находится только эта модель; её веса останутся на диске после ручной выгрузки.`;
    if (aiStatus) aiStatus.textContent = `${profile.label} включена. Режим «${mode.label}». Веса остаются в браузерном дисковом кэше.`;
  } else if (lifecycle.id === 'cached' && aiStatus) {
    aiStatus.textContent = `${profile.label}: веса найдены на диске. Включите модель, чтобы открыть форму вопроса.`;
  } else if (lifecycle.id === 'missing' && aiStatus) {
    aiStatus.textContent = `${profile.label}: сначала скачайте и включите модель. Поиск по базе работает отдельно без LLM.`;
  }
}

function renderHistory(elements, runs, { profileById, modeById }) {
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
  const elements = createModelLabElements({ profiles, answerModes, defaultModelId, defaultModeId });
  controlSlot?.replaceChildren(elements.modelLab);
  workspace?.prepend(elements.answerModePanel);
  aiStatus?.after(elements.modelRunHistory);

  return {
    elements: { ...elements, modelWorkspace: workspace, localAiButton },
    selectedModelId: () => elements.localAiModel.value,
    selectedModeId: () => elements.answerModeSelect.value,
    setSelections({ modelId, modeId }) {
      if (modelId) elements.localAiModel.value = modelId;
      if (modeId) elements.answerModeSelect.value = modeId;
    },
    render({ profile, mode, lifecycle, progressState, catalogStatus, catalogError, runtimeAvailable, modelAvailable }) {
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
      renderRuntimeAvailability(elements, { runtimeAvailable, modelAvailable, ready });
      renderLifecycleStatus(elements, { profile, mode, lifecycle, aiStatus });
    },
    renderHistory: (runs, resolvers) => renderHistory(elements, runs, resolvers),
    resetAnswerButton() {
      localAiButton?.replaceChildren(
        Icon({ name: 'model', className: 'icon' }),
        document.createTextNode('Ответить локальной моделью'),
      );
    },
  };
}
