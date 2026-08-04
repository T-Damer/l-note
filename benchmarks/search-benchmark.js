import { SEARCH_BENCHMARK_DEFAULTS } from './search-benchmark-core.js';
import {
  deviceSnapshot,
  runSearchBenchmark,
} from './search-benchmark-runner.js';

const elements = {
  form: document.querySelector('#benchmark-form'),
  counts: document.querySelector('#counts'),
  bodyChars: document.querySelector('#body-chars'),
  iterations: document.querySelector('#query-iterations'),
  run: document.querySelector('#run-benchmark'),
  stop: document.querySelector('#stop-benchmark'),
  status: document.querySelector('#benchmark-status'),
  progress: document.querySelector('#benchmark-progress'),
  resultsBody: document.querySelector('#results-body'),
  export: document.querySelector('#export-report'),
  report: document.querySelector('#report-json'),
  device: document.querySelector('#device-summary'),
};

let stopped = false;
let currentReport = null;

function parseCounts(value) {
  const counts = String(value ?? '')
    .split(/[\s,;]+/gu)
    .map(Number)
    .filter((item) => Number.isInteger(item) && item >= 100 && item <= 100_000);
  return [...new Set(counts)].sort((left, right) => left - right);
}

function boundedNumber(value, fallback, minimum, maximum) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  return Math.max(minimum, Math.min(maximum, numeric));
}

function renderRow(result) {
  const row = document.createElement('tr');
  const values = [
    result.count.toLocaleString('ru-RU'),
    `${(result.estimatedBytes / 1024 / 1024).toFixed(2)} MiB`,
    result.miniSearch?.buildMs ?? '—',
    result.miniSearch?.query?.p95Ms ?? '—',
    result.sqlite?.buildMs ?? '—',
    result.sqlite?.reopenMs ?? '—',
    result.sqlite?.query?.p95Ms ?? '—',
    result.error ?? 'OK',
  ];
  for (const value of values) {
    const cell = document.createElement('td');
    cell.textContent = String(value);
    row.append(cell);
  }
  elements.resultsBody.append(row);
}

function downloadJson(filename, value) {
  const blob = new Blob([`${JSON.stringify(value, null, 2)}\n`], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

function renderDevice() {
  const device = deviceSnapshot();
  elements.device.textContent = [
    device.platform || 'unknown platform',
    `${device.hardwareConcurrency ?? '?'} потоков`,
    `${device.deviceMemoryGB ?? '?'} ГБ deviceMemory`,
    device.crossOriginIsolated ? 'memory isolation' : 'без memory isolation',
  ].join(' · ');
}

async function submitBenchmark() {
  const counts = parseCounts(elements.counts.value);
  if (!counts.length) throw new Error('Укажите размеры корпуса от 100 до 100000.');
  const bodyChars = boundedNumber(
    elements.bodyChars.value,
    SEARCH_BENCHMARK_DEFAULTS.bodyChars,
    120,
    8_192,
  );
  const queryIterations = boundedNumber(
    elements.iterations.value,
    SEARCH_BENCHMARK_DEFAULTS.queryIterations,
    1,
    50,
  );
  stopped = false;
  currentReport = null;
  elements.run.disabled = true;
  elements.stop.disabled = false;
  elements.export.disabled = true;
  elements.resultsBody.replaceChildren();
  elements.report.textContent = '';
  elements.progress.max = counts.length;
  elements.progress.value = 0;

  currentReport = await runSearchBenchmark({
    counts,
    bodyChars,
    queryIterations,
    shouldStop: () => stopped,
    onStatus(value) {
      elements.status.textContent = value;
    },
    onCase(result) {
      renderRow(result);
      elements.progress.value += 1;
    },
  });
  elements.report.textContent = JSON.stringify(currentReport, null, 2);
  elements.export.disabled = false;
  elements.status.textContent = 'Готово. Повторяйте сравнение после перезагрузки вкладки.';
}

elements.form.addEventListener('submit', (event) => {
  event.preventDefault();
  void submitBenchmark().catch((error) => {
    elements.status.textContent = error?.name === 'AbortError'
      ? 'Остановлено после текущей операции.'
      : `Ошибка: ${error instanceof Error ? error.message : String(error)}`;
  }).finally(() => {
    elements.run.disabled = false;
    elements.stop.disabled = true;
  });
});

elements.stop.addEventListener('click', () => {
  stopped = true;
  elements.stop.disabled = true;
  elements.status.textContent = 'Остановка после текущей операции…';
});

elements.export.addEventListener('click', () => {
  if (!currentReport) return;
  const timestamp = currentReport.generatedAt.replace(/[:.]/gu, '-');
  downloadJson(`lnote-search-benchmark-${timestamp}.json`, currentReport);
});

renderDevice();
