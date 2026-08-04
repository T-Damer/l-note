import {
  estimateSearchCorpusBytes,
} from '../src/adapters/adaptive-search.js';
import { createMiniSearchPort } from '../src/adapters/runtime-adapters.js';
import { createSqliteFtsSearchPort } from '../src/adapters/sqlite-fts-search.js';
import {
  SEARCH_BENCHMARK_DEFAULTS,
  benchmarkCaseId,
  benchmarkQueries,
  createBenchmarkRecords,
  summarizeTimings,
} from './search-benchmark-core.js';

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

function now() {
  return globalThis.performance?.now?.() ?? Date.now();
}

function round(value, digits = 2) {
  return Number.isFinite(value) ? Number(value.toFixed(digits)) : null;
}

function parseCounts(value) {
  const counts = String(value ?? '')
    .split(/[\s,;]+/gu)
    .map(Number)
    .filter((item) => Number.isInteger(item) && item >= 100 && item <= 100_000);
  return [...new Set(counts)].sort((left, right) => left - right);
}

function heapSnapshot() {
  const memory = globalThis.performance?.memory;
  if (!memory) return null;
  return {
    usedJSHeapBytes: Number(memory.usedJSHeapSize),
    totalJSHeapBytes: Number(memory.totalJSHeapSize),
    jsHeapLimitBytes: Number(memory.jsHeapSizeLimit),
  };
}

function deviceSnapshot() {
  const navigatorValue = globalThis.navigator ?? {};
  return {
    userAgent: navigatorValue.userAgent ?? '',
    platform: navigatorValue.userAgentData?.platform ?? navigatorValue.platform ?? '',
    mobile: navigatorValue.userAgentData?.mobile ?? null,
    hardwareConcurrency: navigatorValue.hardwareConcurrency ?? null,
    deviceMemoryGB: navigatorValue.deviceMemory ?? null,
    language: navigatorValue.language ?? null,
    crossOriginIsolated: Boolean(globalThis.crossOriginIsolated),
    indexedDb: 'indexedDB' in globalThis,
    worker: typeof Worker === 'function',
    webAssembly: typeof WebAssembly === 'object',
    performanceMemory: Boolean(globalThis.performance?.memory),
    userAgentSpecificMemory: typeof globalThis.performance?.measureUserAgentSpecificMemory === 'function',
    viewport: {
      width: globalThis.innerWidth,
      height: globalThis.innerHeight,
      devicePixelRatio: globalThis.devicePixelRatio,
    },
  };
}

async function preciseMemorySnapshot() {
  if (!globalThis.crossOriginIsolated
    || typeof globalThis.performance?.measureUserAgentSpecificMemory !== 'function') return null;
  try {
    const measurement = await globalThis.performance.measureUserAgentSpecificMemory();
    return { bytes: measurement.bytes };
  } catch (error) {
    return { error: error instanceof Error ? error.message : String(error) };
  }
}

async function timed(operation) {
  const startedAt = now();
  const value = await operation();
  return { durationMs: now() - startedAt, value };
}

function assertRunning() {
  if (stopped) throw new DOMException('Benchmark stopped after the current operation.', 'AbortError');
}

async function queryBackend(port, queries, iterations) {
  const samples = [];
  const resultCounts = [];
  for (let iteration = 0; iteration < iterations; iteration += 1) {
    for (const query of queries) {
      assertRunning();
      const measurement = await timed(() => Promise.resolve(port.search(query, { limit: 10 })));
      samples.push(measurement.durationMs);
      resultCounts.push(measurement.value.length);
    }
  }
  if (resultCounts.some((count) => count < 1)) {
    throw new Error('A benchmark query returned no results.');
  }
  return summarizeTimings(samples);
}

function progressLabel(progress) {
  if (!progress) return '';
  const completed = Number(progress.completed ?? progress.rows ?? progress.records ?? 0);
  const total = Number(progress.total ?? progress.recordCount ?? 0);
  const stage = String(progress.stage ?? progress.phase ?? 'build');
  return total > 0 ? `${stage}: ${completed}/${total}` : stage;
}

async function benchmarkMiniSearch(records, queries, iterations) {
  const before = heapSnapshot();
  const build = await timed(() => Promise.resolve(createMiniSearchPort(records)));
  const afterBuild = heapSnapshot();
  const queriesResult = await queryBackend(build.value, queries, iterations);
  return {
    backend: build.value.kind,
    buildMs: round(build.durationMs),
    reopenMs: null,
    query: Object.fromEntries(Object.entries(queriesResult).map(([key, value]) => [key, round(value)])),
    heapBefore: before,
    heapAfterBuild: afterBuild,
  };
}

async function benchmarkSqlite(records, queries, iterations, fingerprint) {
  const before = heapSnapshot();
  const freshPort = createSqliteFtsSearchPort();
  if (freshPort.available === false) throw new Error('SQLite/FTS5 backend is unavailable.');
  await freshPort.clear();
  const freshBuild = await timed(() => freshPort.build(records, {
    fingerprint,
    onProgress(progress) {
      elements.progress.value = 0;
      elements.status.textContent = `SQLite ${progressLabel(progress)}`;
    },
  }));
  const afterBuild = heapSnapshot();
  const freshQueries = await queryBackend(freshPort, queries, iterations);
  const freshStats = await freshPort.stats();
  await freshPort.close();
  assertRunning();

  const reopenPort = createSqliteFtsSearchPort();
  const reopen = await timed(() => reopenPort.build(records, { fingerprint }));
  const reopenQueries = await queryBackend(reopenPort, queries, iterations);
  const reopenStats = await reopenPort.stats();
  await reopenPort.close();

  const cleanupPort = createSqliteFtsSearchPort();
  await cleanupPort.clear();
  await cleanupPort.close();
  return {
    backend: 'SQLite/FTS5',
    buildMs: round(freshBuild.durationMs),
    reopenMs: round(reopen.durationMs),
    query: Object.fromEntries(Object.entries(freshQueries).map(([key, value]) => [key, round(value)])),
    reopenQuery: Object.fromEntries(Object.entries(reopenQueries).map(([key, value]) => [key, round(value)])),
    heapBefore: before,
    heapAfterBuild: afterBuild,
    freshStats,
    reopenStats,
  };
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

async function runBenchmark() {
  const counts = parseCounts(elements.counts.value);
  if (!counts.length) throw new Error('Укажите хотя бы один размер корпуса от 100 до 100000.');
  const bodyChars = Math.max(120, Math.min(8_192, Number(elements.bodyChars.value) || SEARCH_BENCHMARK_DEFAULTS.bodyChars));
  const iterations = Math.max(1, Math.min(50, Number(elements.iterations.value) || SEARCH_BENCHMARK_DEFAULTS.queryIterations));
  stopped = false;
  elements.run.disabled = true;
  elements.stop.disabled = false;
  elements.export.disabled = true;
  elements.resultsBody.replaceChildren();
  elements.progress.max = counts.length;
  elements.progress.value = 0;
  const device = deviceSnapshot();
  const report = {
    schemaVersion: 1,
    kind: 'lnote.search-benchmark',
    generatedAt: new Date().toISOString(),
    device,
    parameters: { counts, bodyChars, queryIterations: iterations },
    cases: [],
    preciseMemoryBefore: await preciseMemorySnapshot(),
  };

  for (const [index, count] of counts.entries()) {
    assertRunning();
    elements.status.textContent = `Создание корпуса ${count.toLocaleString('ru-RU')}…`;
    const records = createBenchmarkRecords({ count, bodyChars });
    const estimatedBytes = estimateSearchCorpusBytes(records);
    const queries = benchmarkQueries(count);
    const result = {
      id: benchmarkCaseId({ count, bodyChars }),
      count,
      bodyChars,
      estimatedBytes,
      queries,
      generatedHeap: heapSnapshot(),
    };
    try {
      elements.status.textContent = `MiniSearch: ${count.toLocaleString('ru-RU')}…`;
      result.miniSearch = await benchmarkMiniSearch(records, queries, iterations);
      assertRunning();
      elements.status.textContent = `SQLite/FTS5: ${count.toLocaleString('ru-RU')}…`;
      result.sqlite = await benchmarkSqlite(
        records,
        queries,
        iterations,
        `benchmark:${result.id}`,
      );
    } catch (error) {
      result.error = error instanceof Error ? error.message : String(error);
      if (error?.name === 'AbortError') {
        report.cases.push(result);
        renderRow(result);
        throw error;
      }
    }
    report.cases.push(result);
    renderRow(result);
    elements.progress.value = index + 1;
    await new Promise((resolve) => setTimeout(resolve, 0));
  }

  report.preciseMemoryAfter = await preciseMemorySnapshot();
  currentReport = report;
  elements.report.textContent = JSON.stringify(report, null, 2);
  elements.export.disabled = false;
  elements.status.textContent = 'Готово. Для чистого сравнения повторите запуск после перезагрузки вкладки.';
}

function renderDevice() {
  const device = deviceSnapshot();
  elements.device.textContent = [
    `${device.platform || 'unknown platform'}`,
    `${device.hardwareConcurrency ?? '?'} потоков`,
    `${device.deviceMemoryGB ?? '?'} ГБ deviceMemory`,
    device.crossOriginIsolated ? 'cross-origin isolated' : 'без memory isolation',
  ].join(' · ');
}

elements.form.addEventListener('submit', (event) => {
  event.preventDefault();
  void runBenchmark().catch((error) => {
    const stoppedRun = error?.name === 'AbortError';
    elements.status.textContent = stoppedRun
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
