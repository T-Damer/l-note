import {
  DEFAULT_SPEECH_MODEL_ID,
  LOCAL_SPEECH_MODEL_PROFILES,
  speechModelProfile,
} from '../speech.js';
import {
  MAX_VOICE_SEARCH_DURATION_MS,
  createBrowserAudioRecorder,
} from '../services/audio-recorder.js';
import { requestPersistentStorage } from '../services/storage-persistence.js';
import { Button, Field } from '../ui/components.js';
import { element } from '../ui/dom.js';
import { Text } from '../ui/text.js';

export const VOICE_MODEL_SETTING_KEY = 'voice.model';
export const VOICE_LANGUAGE_SETTING_KEY = 'voice.language';

function requireElement(value, name) {
  if (!(value instanceof HTMLElement)) throw new TypeError(`${name} must be an HTML element.`);
  return value;
}

function formatMegabytes(value) {
  return Number.isFinite(value) ? `${Math.round(value)} МБ` : '—';
}

function progressPercent(progress) {
  const explicit = Number(progress?.progress);
  if (Number.isFinite(explicit)) return Math.max(0, Math.min(100, explicit));
  const loaded = Number(progress?.loaded);
  const total = Number(progress?.total);
  if (Number.isFinite(loaded) && Number.isFinite(total) && total > 0) {
    return Math.max(0, Math.min(100, loaded / total * 100));
  }
  return 0;
}

function progressLabel(progress, percent) {
  const file = progress?.file ? ` · ${progress.file}` : '';
  if (progress?.status === 'ready') return 'Модель распознавания готова.';
  return `Загрузка модели ${Math.round(percent)}%${file}`;
}

function selectedLanguage(value) {
  return ['ru', 'en'].includes(value) ? value : 'auto';
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

export function createVoiceSearchController({
  trigger,
  slot,
  input,
  speechPort,
  storagePort,
  audioRecorder = createBrowserAudioRecorder(),
  onTranscript,
  onError = () => {},
} = {}) {
  const elements = {
    trigger: requireElement(trigger, 'trigger'),
    slot: requireElement(slot, 'slot'),
    input: requireElement(input, 'input'),
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
  const cacheState = new Map();
  let operation = 'idle';
  let autoStopTimer = null;
  let panelOpen = false;

  const panel = element('section', { className: 'voice-search-panel', hidden: true }, [
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
  elements.slot.replaceChildren(panel);

  function currentProfile() {
    return speechModelProfile(elements.model.value)
      ?? speechModelProfile(DEFAULT_SPEECH_MODEL_ID);
  }

  function isLoaded() {
    return speechPort.modelId === currentProfile()?.modelId;
  }

  function cachedLabel(profile) {
    const cached = cacheState.get(profile.modelId);
    if (cached === true) return 'веса на диске';
    if (cached === false) return 'ещё не загружена';
    return 'состояние кэша неизвестно';
  }

  function setStatus(message, type = 'info') {
    elements.status.textContent = message;
    elements.status.classList.toggle('is-error', type === 'error');
    elements.status.classList.toggle('is-success', type === 'success');
  }

  function render() {
    const profile = currentProfile();
    const loaded = isLoaded();
    const busy = ['loading', 'transcribing'].includes(operation);
    const recording = operation === 'recording';
    elements.summary.textContent = [
      profile.label,
      profile.parameters,
      `около ${formatMegabytes(profile.downloadSizeMB)} на диске`,
      cachedLabel(profile),
      loaded ? 'включена' : 'выключена',
    ].join(' · ');
    elements.model.disabled = busy || recording;
    elements.language.disabled = busy || recording;
    elements.load.hidden = loaded || recording;
    elements.load.disabled = busy;
    elements.load.querySelector('.text')?.replaceChildren(
      document.createTextNode(cacheState.get(profile.modelId) ? 'Включить модель' : 'Загрузить модель'),
    );
    elements.record.hidden = !loaded;
    elements.record.disabled = busy || !audioRecorder.available;
    elements.record.querySelector('.text')?.replaceChildren(
      document.createTextNode(recording ? 'Остановить и распознать' : 'Начать запись'),
    );
    elements.cancel.hidden = !busy && !recording;
    elements.unload.hidden = !loaded || busy || recording;
    elements.progress.hidden = operation !== 'loading';
    elements.trigger.classList.toggle('is-recording', recording);
    elements.trigger.setAttribute('aria-pressed', String(recording));
    elements.trigger.setAttribute('aria-expanded', String(panelOpen));
    elements.trigger.setAttribute(
      'aria-label',
      recording ? 'Остановить голосовой поиск' : 'Открыть голосовой поиск',
    );
  }

  function setPanelOpen(open) {
    panelOpen = Boolean(open);
    panel.hidden = !panelOpen;
    render();
  }

  async function inspectCache() {
    const inspected = await speechPort.inspectModels?.({ includeCache: true }) ?? [];
    for (const item of inspected) cacheState.set(item.modelId, item.cached);
    setStatus(
      audioRecorder.available
        ? 'Выберите модель, затем разрешите доступ к микрофону.'
        : 'Микрофон или MediaRecorder недоступны в этом браузере.',
      audioRecorder.available ? 'info' : 'error',
    );
    render();
  }

  async function loadModel() {
    const profile = currentProfile();
    operation = 'loading';
    elements.progress.value = 0;
    render();
    setStatus('Подготовка локального хранилища…');
    try {
      await requestPersistentStorage();
      await speechPort.load({
        modelId: profile.modelId,
        onProgress(progress) {
          const percent = progressPercent(progress);
          elements.progress.value = percent;
          setStatus(progressLabel(progress, percent));
        },
      });
      cacheState.set(profile.modelId, true);
      setStatus('Модель включена. Можно начать запись.', 'success');
    } catch (error) {
      if (error?.name !== 'AbortError') {
        const message = error instanceof Error ? error.message : String(error);
        setStatus(message, 'error');
        onError(message);
      }
    } finally {
      operation = 'idle';
      render();
    }
  }

  function clearAutoStop() {
    clearTimeout(autoStopTimer);
    autoStopTimer = null;
  }

  async function finishRecording() {
    if (operation !== 'recording') return;
    clearAutoStop();
    operation = 'transcribing';
    render();
    setStatus('Распознавание на устройстве…');
    try {
      const audio = await audioRecorder.stop();
      const result = await speechPort.transcribe(audio, {
        language: selectedLanguage(elements.language.value),
      });
      if (!result.text) throw new Error('Речь не распознана. Попробуйте говорить ближе к микрофону.');
      elements.input.value = result.text;
      setStatus(`Распознано локально за ${(result.durationMs / 1000).toFixed(1)} с.`, 'success');
      onTranscript?.(result.text);
    } catch (error) {
      if (error?.name !== 'AbortError') {
        const message = error instanceof Error ? error.message : String(error);
        setStatus(message, 'error');
        onError(message);
      }
    } finally {
      operation = 'idle';
      render();
    }
  }

  async function startRecording() {
    if (!isLoaded()) return loadModel();
    try {
      await audioRecorder.start();
      operation = 'recording';
      setStatus('Идёт запись. Нажмите ещё раз, чтобы распознать запрос.');
      autoStopTimer = setTimeout(finishRecording, MAX_VOICE_SEARCH_DURATION_MS);
      render();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setStatus(message, 'error');
      onError(message);
    }
  }

  async function cancel() {
    clearAutoStop();
    if (operation === 'recording') audioRecorder.cancel();
    else await speechPort.cancel();
    operation = 'idle';
    setStatus('Операция отменена. Загруженные файлы в кэше сохранены.');
    render();
  }

  async function unload() {
    await speechPort.unload();
    setStatus('Модель выгружена из памяти; веса остались на диске.');
    render();
  }

  elements.trigger.addEventListener('click', () => {
    if (operation === 'recording') finishRecording();
    else setPanelOpen(!panelOpen);
  });
  elements.load.addEventListener('click', loadModel);
  elements.record.addEventListener('click', () => (
    operation === 'recording' ? finishRecording() : startRecording()
  ));
  elements.cancel.addEventListener('click', cancel);
  elements.unload.addEventListener('click', unload);
  elements.model.addEventListener('change', async () => {
    if (speechPort.modelId && speechPort.modelId !== elements.model.value) await speechPort.unload();
    await storagePort.setSetting(VOICE_MODEL_SETTING_KEY, elements.model.value);
    setStatus('Выбрана другая модель. Включите её перед записью.');
    render();
  });
  elements.language.addEventListener('change', () => (
    storagePort.setSetting(VOICE_LANGUAGE_SETTING_KEY, elements.language.value)
  ));

  async function init() {
    elements.model.value = await storagePort.getSetting(
      VOICE_MODEL_SETTING_KEY,
      DEFAULT_SPEECH_MODEL_ID,
    );
    if (!speechModelProfile(elements.model.value)) elements.model.value = DEFAULT_SPEECH_MODEL_ID;
    elements.language.value = selectedLanguage(await storagePort.getSetting(
      VOICE_LANGUAGE_SETTING_KEY,
      'auto',
    ));
    await inspectCache();
    setPanelOpen(false);
  }

  return Object.freeze({ init, setPanelOpen, cancel, unload });
}
