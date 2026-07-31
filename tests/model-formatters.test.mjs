import assert from 'node:assert/strict';
import test from 'node:test';

import {
  formatDownloadSpeed,
  formatDurationMs,
  formatGenerationSpeed,
  formatGigabytesFromMegabytes,
  formatMegabytes,
} from '../src/helpers/model-formatters.js';

test('formats model timing and throughput consistently', () => {
  assert.equal(formatDurationMs(850), '850 мс');
  assert.equal(formatDurationMs(2500), '2.5 с');
  assert.equal(formatDownloadSpeed(12.345), '12.3 МБ/с');
  assert.equal(formatGenerationSpeed(8.96), '9.0 ток/с');
});

test('formats persistent and runtime memory without conflating units', () => {
  assert.equal(formatGigabytesFromMegabytes(2048), '2.0 ГБ');
  assert.equal(formatMegabytes(512), '512 МБ');
  assert.equal(formatMegabytes(1536), '1.5 ГБ');
});

test('returns stable fallbacks for unavailable measurements', () => {
  assert.equal(formatDurationMs(null), '—');
  assert.equal(formatDownloadSpeed(undefined), 'скорость определяется');
  assert.equal(formatGenerationSpeed(Number.NaN), 'скорость не сообщена');
});
