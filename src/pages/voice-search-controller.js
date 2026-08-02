import {
  DEFAULT_SPEECH_MODEL_ID,
  speechModelProfile,
} from '../speech.js';
import {
  MAX_VOICE_SEARCH_DURATION_MS,
  createBrowserAudioRecorder,
} from '../services/audio-recorder.js';
import { requestPersistentStorage } from '../services/storage-persistence.js';
import {
  createVoiceSearchElements,
  normalizeSpeechLanguage,
  renderVoiceSearchElements,
  voiceProgressLabel,
  voiceProgressPercent,
} from './voice-search-elements.js';

export const VOICE_MODEL_SETTING_KEY = 'voice.model';
export const VOICE_LANGUAGE_SETTING_KEY = 'voice.language';

function requireElement(value, name) {
  if (!(value instanceof HTMLElement)) throw new TypeError(`${name} must be an HTML element.`);
  return value;
}

export function createVoiceSearchController({
  trigger,
  slot,
  input,
  speechPort,
  storagePort,
  audioRecorder = createBrowserAudioRecorder(),
  onTranscript,
  onActivityProgress = () => {},
  onError = () => {},
} = {}) {
  const elements = createVoiceSearchElements({
    trigger: requireElement(trigger, 'trigger'),
    slot: requireElement(slot, 'slot'),
    input: requireElement(input, 'input'),
  });
  const cacheState = new Map();
  let operation = 'idle';
  let autoStopTimer = null;
  let panelOpen = false;

  function currentProfile() {
    return speechModelProfile(elements.model.value)
      ?? speechModelProfile(DEFAULT_SPEECH_MODEL_ID);
  }

  function isLoaded() {
    return speechPort.modelId === currentProfile()?.modelId;
  }

  function setStatus(message, type = 'info') {
    elements.status.textContent = message;
    elements.status.classList.toggle('is-error', type === 'error');
    elements.status.classList.toggle('is-success', type === 'success');
  }

  function render() {
    const profile = currentProfile();
    renderVoiceSearchElements({
      elements,
      profile,
      cached: cacheState.get(profile.modelId),
      loaded: isLoaded(),
      operation,
      recorderAvailable: audioRecorder.available,
      panelOpen,
    });
  }

  function setPanelOpen(open) {
    panelOpen = Boolean(open);
    render();
  }

  async function inspectCache() {
    const inspected = await speechPort.inspectModels?.({ includeCache: true }) ?? [];
    for (const item of inspected) cacheState.set(item.modelId, item.cached);
    setStatus(
      audioRecorder.available
        ? 'Выберите модель, затем разрешите доступ к микрофону.'
        : 'Запись с микрофона недоступна в этом браузере.',
      audioRecorder.available ? 'info' : 'error',
    );
    render();
  }

  async function loadModel() {
    const profile = currentProfile();
    operation = 'loading';
    elements.progress.value = 0;
    onActivityProgress({ active: true, progress: 0, label: 'Загрузка распознавания речи' });
    render();
    setStatus('Подготовка загрузки…');
    try {
      await requestPersistentStorage();
      await speechPort.load({
        modelId: profile.modelId,
        onProgress(progress) {
          const percent = voiceProgressPercent(progress);
          elements.progress.value = percent;
          onActivityProgress({
            active: true,
            progress: percent,
            label: 'Загрузка распознавания речи',
          });
          setStatus(voiceProgressLabel(progress, percent));
        },
      });
      cacheState.set(profile.modelId, true);
      setStatus('Распознавание речи готово. Можно начать запись.', 'success');
    } catch (error) {
      if (error?.name !== 'AbortError') reportError(error);
    } finally {
      operation = 'idle';
      onActivityProgress({ active: false, progress: 0, label: 'Загрузка распознавания речи' });
      render();
    }
  }

  function reportError(error) {
    const message = error instanceof Error ? error.message : String(error);
    setStatus(message, 'error');
    onError(message);
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
    setStatus('Распознавание записи…');
    try {
      const audio = await audioRecorder.stop();
      const result = await speechPort.transcribe(audio, {
        language: normalizeSpeechLanguage(elements.language.value),
      });
      if (!result.text) throw new Error('Речь не распознана. Попробуйте говорить ближе к микрофону.');
      elements.input.value = result.text;
      setStatus(`Готово за ${(result.durationMs / 1000).toFixed(1)} с.`, 'success');
      onTranscript?.(result.text);
    } catch (error) {
      if (error?.name !== 'AbortError') reportError(error);
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
      reportError(error);
    }
  }

  async function cancel() {
    clearAutoStop();
    if (operation === 'recording') audioRecorder.cancel();
    else await speechPort.cancel();
    operation = 'idle';
    onActivityProgress({ active: false, progress: 0, label: 'Загрузка распознавания речи' });
    setStatus('Операция отменена. Загруженные данные сохранены.');
    render();
  }

  async function unload() {
    await speechPort.unload();
    setStatus('Распознавание речи выключено. Загруженные данные сохранены.');
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
    elements.language.value = normalizeSpeechLanguage(await storagePort.getSetting(
      VOICE_LANGUAGE_SETTING_KEY,
      'auto',
    ));
    await inspectCache();
    setPanelOpen(false);
  }

  return Object.freeze({ init, setPanelOpen, cancel, unload });
}
