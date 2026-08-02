import { LOCAL_SPEECH_MODEL_PROFILES } from '../speech.js';
import { Button, Field } from '../ui/components.js';
import { element } from '../ui/dom.js';
import { Text } from '../ui/text.js';

function formatMegabytes(value) {
  return Number.isFinite(value) ? `${Math.round(value)} МБ` : '—';
}

export function normalizeSpeechLanguage(value) {
  return ['ru', 'en'].includes(value) ? value : 'auto';
}

export function voiceProgressPercent(progress) {
  const explicit = Number(progress?.progress);
  if (Number.isFinite(explicit)) return Math.max(0, Math.min(100, explicit));
  const loaded = Number(progress?.loaded);
  const total = Number(progress?.total);
  if (Number.isFinite(loaded) && Number.isFinite(total) && total > 0) {
    return Math.max(0, Math.min(100, loaded / total * 100));
  }
  return 0;
}

export function voiceProgressLabel(progress, percent) {
  const file = progress?.file ? ` · ${progress.file}` : '';
  if (progress?.status === 'ready') return 'Модель распознавания готова.';
  return `Загрузка модели ${Math.round(percent)}%${file}`;
}

function createModelSelect() {
  return element('select', {}, LOCAL_SPEECH_MODEL_PROFILES.map((profile) => (
    element('option', { value: profile.modelId, text: `${profile.label} · ${profile.parameters}` })
  )));
}

function createLanguageSelect() {
  return element('select', {}, [
    element('option', { value: 'auto', text: 'Авто: русский / English' }),
    element('option', { value: 'ru', text: 'Русский' }),
    element('option', { value: 'en', text: 'English' }),
  ]);
}

function setButtonText(button, value) {
  const label = button.querySelector('.text--label');
  if (label) label.textContent = value;
}

export function createVoiceSearchElements({ trigger, slot, input }) {
  const elements = {
    trigger,
    slot,
    input,
    model: createModelSelect(),
    language: createLanguageSelect(),
    status: Text({ variant: 'muted', text: 'Проверка локального кэша…' }),
    summary: Text({ variant: 'caption', text: '' }),
    progress: element('progress', { max: 100, value: 0, hidden: true }),
    load: Button({ variant: 'primary', icon: 'download', text: 'Загрузить модель' }),
    record: Button({ variant: 'primary', icon: 'microphone', text: 'Начать запись' }),
    cancel: Button({ variant: 'secondary', icon: 'close', text: 'Отмена', hidden: true }),
    unload: Button({ variant: 'ghost', icon: 'unload', text: 'Выгрузить из памяти', hidden: true }),
  };
  elements.panel = element('section', { className: 'voice-search-panel', hidden: true }, [
    element('header', { className: 'voice-search-heading' }, [
      element('div', {}, [
        Text({ variant: 'eyebrow', text: 'Локально на устройстве' }),
        Text({ variant: 'heading', as: 'h2', text: 'Голосовой поиск' }),
      ]),
      elements.unload,
    ]),
    Text({
      variant: 'muted',
      text: 'Первая загрузка требует сети. После этого русские и английские запросы распознаются офлайн в отдельном Web Worker.',
    }),
    element('div', { className: 'voice-search-settings' }, [
      Field({ label: 'Модель', control: elements.model }),
      Field({ label: 'Язык', control: elements.language }),
    ]),
    elements.summary,
    elements.progress,
    elements.status,
    element('div', { className: 'voice-search-actions' }, [
      elements.load,
      elements.record,
      elements.cancel,
    ]),
  ]);
  slot.replaceChildren(elements.panel);
  return elements;
}

export function renderVoiceSearchElements({
  elements,
  profile,
  cached,
  loaded,
  operation,
  recorderAvailable,
  panelOpen,
}) {
  const busy = ['loading', 'transcribing'].includes(operation);
  const recording = operation === 'recording';
  elements.summary.textContent = [
    profile.label,
    profile.parameters,
    `около ${formatMegabytes(profile.downloadSizeMB)} на диске`,
    cached === true ? 'веса на диске' : cached === false ? 'ещё не загружена' : 'кэш неизвестен',
    loaded ? 'включена' : 'выключена',
  ].join(' · ');
  elements.model.disabled = busy || recording;
  elements.language.disabled = busy || recording;
  elements.load.hidden = loaded || recording;
  elements.load.disabled = busy;
  setButtonText(elements.load, cached ? 'Включить модель' : 'Загрузить модель');
  elements.record.hidden = !loaded;
  elements.record.disabled = busy || !recorderAvailable;
  setButtonText(elements.record, recording ? 'Остановить и распознать' : 'Начать запись');
  elements.cancel.hidden = !busy && !recording;
  elements.unload.hidden = !loaded || busy || recording;
  elements.progress.hidden = operation !== 'loading';
  elements.panel.hidden = !panelOpen;
  elements.trigger.classList.toggle('is-recording', recording);
  elements.trigger.setAttribute('aria-pressed', String(recording));
  elements.trigger.setAttribute('aria-expanded', String(panelOpen));
  elements.trigger.setAttribute(
    'aria-label',
    recording ? 'Остановить голосовой поиск' : 'Открыть голосовой поиск',
  );
}
