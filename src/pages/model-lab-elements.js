import { Button, Field } from '../ui/components.js';
import { element } from '../ui/dom.js';
import { Text } from '../ui/text.js';

function createSelect({ id, className, ariaLabel, records, defaultValue, valueKey, label }) {
  const select = element('select', { id, className, 'aria-label': ariaLabel });
  for (const record of records) {
    const value = record[valueKey];
    select.append(element('option', {
      value,
      selected: value === defaultValue,
      text: label(record),
    }));
  }
  return select;
}

function createProgressElements() {
  const text = element('span', {
    className: 'model-progress-text',
    text: 'Проверка локального хранилища…',
  });
  const percent = element('strong', { className: 'model-progress-percent', text: '0%' });
  const value = element('span', { className: 'model-progress-value' });
  const track = element('div', {
    className: 'model-progress-track',
    role: 'progressbar',
    'aria-label': 'Загрузка локальной модели',
    'aria-valuemin': '0',
    'aria-valuemax': '100',
    'aria-valuenow': '0',
  }, [value]);
  return { text, percent, value, track };
}

function createDownloadPanel(progress) {
  const stats = element('div', { className: 'model-progress-stats' });
  const error = element('p', { className: 'model-load-error hidden' });
  const button = Button({
    variant: 'primary',
    className: 'model-load-button',
    icon: 'download',
    text: 'Скачать и включить',
  });
  const panel = element('section', { className: 'model-download-panel' }, [
    element('div', { className: 'model-progress-heading' }, [progress.text, progress.percent]),
    progress.track,
    stats,
    error,
    button,
  ]);
  return { panel, stats, error, button };
}

function createActivePanel() {
  const text = Text({
    variant: 'muted',
    as: 'p',
    text: 'Модель загружена в выделенный Web Worker. Веса останутся на диске после выгрузки из памяти.',
  });
  const button = Button({
    variant: 'secondary',
    icon: 'unload',
    text: 'Выгрузить из памяти',
    className: 'model-unload-button',
  });
  return {
    text,
    button,
    panel: element('section', { className: 'model-active-panel hidden' }, [text, button]),
  };
}

export function createModelLabElements({ profiles, answerModes, defaultModelId, defaultModeId }) {
  const modelSelect = createSelect({
    id: 'local-ai-model',
    className: 'model-select',
    ariaLabel: 'Выбранная локальная модель',
    records: profiles,
    defaultValue: defaultModelId,
    valueKey: 'modelId',
    label: (profile) => `${profile.label} · ${profile.role}`,
  });
  const modeSelect = createSelect({
    id: 'local-answer-mode',
    className: 'answer-mode-select',
    ariaLabel: 'Режим локального ответа',
    records: answerModes,
    defaultValue: defaultModeId,
    valueKey: 'id',
    label: (mode) => mode.label,
  });
  const progress = createProgressElements();
  const download = createDownloadPanel(progress);
  const active = createActivePanel();
  const modelParameters = element('span', { className: 'model-compact-meta' });
  const modelSize = element('span', { className: 'model-compact-meta' });
  const modelRuntimeMemory = element('span', { className: 'model-compact-meta' });
  const modelPower = element('span', { className: 'model-power is-checking' }, [
    element('span', { className: 'model-power-dot', 'aria-hidden': 'true' }),
    document.createTextNode('Проверка'),
  ]);
  const modelProfileNote = element('p', { className: 'model-profile-note' });
  const answerModeHint = element('p', { className: 'answer-mode-hint' });
  const modelLab = element('section', { className: 'model-control-panel' }, [
    element('div', { className: 'model-compact-row' }, [
      Field({ label: 'Модель', control: modelSelect, className: 'model-picker' }),
      modelParameters,
      modelSize,
      modelRuntimeMemory,
      modelPower,
    ]),
    modelProfileNote,
    download.panel,
    active.panel,
  ]);
  const answerModePanel = element('section', { className: 'answer-mode-panel' }, [
    Field({ label: 'Режим работы', control: modeSelect, className: 'answer-mode-field' }),
    answerModeHint,
  ]);

  return {
    modelLab,
    answerModePanel,
    localAiModel: modelSelect,
    answerModeSelect: modeSelect,
    answerModeHint,
    modelParameters,
    modelSize,
    modelRuntimeMemory,
    modelPower,
    modelProfileNote,
    modelProgressText: progress.text,
    modelProgressPercent: progress.percent,
    modelProgressBar: progress.value,
    modelProgressTrack: progress.track,
    modelProgressStats: download.stats,
    modelLoadError: download.error,
    modelLoadButton: download.button,
    modelDownloadPanel: download.panel,
    modelActivePanel: active.panel,
    modelActiveText: active.text,
    modelUnloadButton: active.button,
    modelRunHistory: element('section', { className: 'answer-panel hidden', 'aria-live': 'polite' }),
  };
}
