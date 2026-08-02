export const SPEECH_SAMPLE_RATE = 16_000;
export const MAX_VOICE_SEARCH_DURATION_MS = 30_000;

export function mixAudioChannels(audioBuffer) {
  const channels = Number(audioBuffer?.numberOfChannels ?? 0);
  const length = Number(audioBuffer?.length ?? 0);
  if (!channels || !length || typeof audioBuffer.getChannelData !== 'function') {
    return new Float32Array();
  }
  if (channels === 1) return new Float32Array(audioBuffer.getChannelData(0));
  const output = new Float32Array(length);
  for (let channel = 0; channel < channels; channel += 1) {
    const data = audioBuffer.getChannelData(channel);
    for (let index = 0; index < length; index += 1) output[index] += data[index] / channels;
  }
  return output;
}

export function resampleAudio(samples, sourceRate, targetRate = SPEECH_SAMPLE_RATE) {
  if (!(samples instanceof Float32Array)) throw new TypeError('Audio samples must be a Float32Array.');
  const from = Number(sourceRate);
  const to = Number(targetRate);
  if (!samples.length || !Number.isFinite(from) || !Number.isFinite(to) || from <= 0 || to <= 0) {
    return new Float32Array();
  }
  if (from === to) return samples.slice();
  const outputLength = Math.max(1, Math.round(samples.length * to / from));
  const output = new Float32Array(outputLength);
  const ratio = from / to;
  for (let index = 0; index < outputLength; index += 1) {
    const position = index * ratio;
    const left = Math.floor(position);
    const right = Math.min(samples.length - 1, left + 1);
    const fraction = position - left;
    output[index] = samples[left] * (1 - fraction) + samples[right] * fraction;
  }
  return output;
}

function defaultAudioContextFactory() {
  const AudioContextClass = globalThis.AudioContext ?? globalThis.webkitAudioContext;
  if (!AudioContextClass) throw new Error('AudioContext недоступен в этом браузере.');
  return new AudioContextClass();
}

export async function decodeRecordedAudio(
  blob,
  { audioContextFactory = defaultAudioContextFactory } = {},
) {
  if (!(blob instanceof Blob) || blob.size === 0) throw new Error('Запись пуста.');
  const context = audioContextFactory();
  try {
    const buffer = await context.decodeAudioData(await blob.arrayBuffer());
    return resampleAudio(mixAudioChannels(buffer), buffer.sampleRate, SPEECH_SAMPLE_RATE);
  } finally {
    await context.close?.();
  }
}

function preferredMimeType(MediaRecorderClass) {
  const candidates = [
    'audio/webm;codecs=opus',
    'audio/ogg;codecs=opus',
    'audio/webm',
  ];
  return candidates.find((value) => MediaRecorderClass.isTypeSupported?.(value)) ?? '';
}

function stopTracks(stream) {
  for (const track of stream?.getTracks?.() ?? []) track.stop?.();
}

export class BrowserAudioRecorder {
  constructor({
    mediaDevices = globalThis.navigator?.mediaDevices,
    MediaRecorderClass = globalThis.MediaRecorder,
    audioContextFactory = defaultAudioContextFactory,
  } = {}) {
    this.mediaDevices = mediaDevices;
    this.MediaRecorderClass = MediaRecorderClass;
    this.audioContextFactory = audioContextFactory;
    this.stream = null;
    this.recorder = null;
    this.chunks = [];
  }

  get available() {
    return Boolean(this.mediaDevices?.getUserMedia && this.MediaRecorderClass);
  }

  get recording() {
    return this.recorder?.state === 'recording';
  }

  async start() {
    if (!this.available) throw new Error('Запись с микрофона недоступна в этом браузере.');
    if (this.recording) return;
    this.stream = await this.mediaDevices.getUserMedia({
      audio: {
        channelCount: 1,
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      },
    });
    this.chunks = [];
    const mimeType = preferredMimeType(this.MediaRecorderClass);
    this.recorder = new this.MediaRecorderClass(
      this.stream,
      mimeType ? { mimeType } : undefined,
    );
    this.recorder.addEventListener('dataavailable', (event) => {
      if (event.data?.size) this.chunks.push(event.data);
    });
    this.recorder.start(250);
  }

  async stop() {
    if (!this.recorder || this.recorder.state === 'inactive') {
      throw new Error('Запись ещё не запущена.');
    }
    const recorder = this.recorder;
    await new Promise((resolve) => {
      recorder.addEventListener('stop', resolve, { once: true });
      recorder.stop();
    });
    stopTracks(this.stream);
    const blob = new Blob(this.chunks, { type: recorder.mimeType || 'audio/webm' });
    this.stream = null;
    this.recorder = null;
    this.chunks = [];
    return decodeRecordedAudio(blob, { audioContextFactory: this.audioContextFactory });
  }

  cancel() {
    const recorder = this.recorder;
    if (recorder && recorder.state !== 'inactive') recorder.stop();
    stopTracks(this.stream);
    this.stream = null;
    this.recorder = null;
    this.chunks = [];
  }
}

export function createBrowserAudioRecorder(options = {}) {
  return new BrowserAudioRecorder(options);
}
