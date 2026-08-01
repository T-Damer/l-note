import assert from 'node:assert/strict';
import test from 'node:test';

import {
  SPEECH_SAMPLE_RATE,
  mixAudioChannels,
  resampleAudio,
} from '../src/services/audio-recorder.js';

test('mixes multiple channels into one deterministic mono track', () => {
  const channels = [
    new Float32Array([1, .5, 0, -1]),
    new Float32Array([-1, .5, 1, 1]),
  ];
  const mono = mixAudioChannels({
    numberOfChannels: channels.length,
    length: channels[0].length,
    getChannelData: (index) => channels[index],
  });
  assert.deepEqual([...mono], [0, .5, .5, 0]);
});

test('resamples microphone audio to Whisper 16 kHz input', () => {
  const source = new Float32Array(48_000).map((_, index) => Math.sin(index / 30));
  const output = resampleAudio(source, 48_000, SPEECH_SAMPLE_RATE);
  assert.equal(output.length, 16_000);
  assert.ok(output.every((value) => Number.isFinite(value)));
});

test('preserves input values when the sample rate already matches', () => {
  const source = new Float32Array([0, .25, -.25, 1]);
  const output = resampleAudio(source, SPEECH_SAMPLE_RATE, SPEECH_SAMPLE_RATE);
  assert.deepEqual([...output], [...source]);
  assert.notEqual(output, source);
});

test('rejects non-Float32 input and returns an empty result for invalid rates', () => {
  assert.throws(() => resampleAudio([1, 2], 48_000), /Float32Array/u);
  assert.equal(resampleAudio(new Float32Array([1]), 0).length, 0);
});
