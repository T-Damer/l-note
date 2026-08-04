import { estimateSearchCorpusBytes } from '../src/adapters/adaptive-search.js';
import { createMiniSearchPort } from '../src/adapters/runtime-adapters.js';
import { createSqliteFtsSearchPort } from '../src/adapters/sqlite-fts-search.js';
import {
  benchmarkCaseId,
  benchmarkQueries,
  createBenchmarkRecords,
  summarizeTimings,
} from './search-benchmark-core.js';

const SQLITE_BENCHMARK_WORKER_URL = new URL('./sqlite-benchmark-worker.js', import.meta.url);

function now() {
  return globalThis.performance?.now?.() ?? Date.now();
}

function round(value, digits = 2) {
  return Number.isFinite(value) ? Number(value.toFixed(digits)) : null;
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

export function deviceSnapshot() {
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

function abortError() {
  const error = new Error('Benchmark stopped after the current operation.');
  error.name = 'AbortError';
  return error;
}

function assertRunning(shouldStop) {
  if (shouldStop()) throw abortError();
}

function summarized(values) {
  return Object.fromEntries(
    Object.entries(summarizeTimings(values)).map(([key, value]) => [key, round(value)]),
  );
}

async function queryBackend(port, queries, iterations, shouldStop) {
  const samples = [];
  for (let iteration = 0; iteration < iterations; iteration += 1) {
    for (const query of queries) {
      assertRunning(shouldStop);
      const measurement = await timed(() => Promise.resolve(port.search(query, { limit: 10 })));
      if (!measurement.value.length) throw new Error(`No results for benchmark query: ${query}`);
      samples.push(measurement.durationMs);
    }
  }
  return summarized(samples);
}

function createBenchmarkSqlitePort() {
  return createSqliteFtsSearchPort({
    workerFactory() {
      return new Worker(SQLITE_BENCHMARK_WORKER_URL, {
        type: 'module',
        name: 'l-note-sqlite-benchmark',
      });
    },
  });
}

async function benchmarkMiniSearch(records, queries, iterations, shouldStop) {
  const before = heapSnapshot();
  const build = await timed(() => Promise.resolve(createMiniSearchPort(records)));
  const afterBuild = heapSnapshot();
  return {
    backend: build.value.kind,
    buildMs: round(build.durationMs),
    reopenMs: null,
    query: await queryBackend(build.value, queries, iterations, shouldStop),
    heapBefore: before,
    heapAfterBuild: afterBuild,
  };
}

async function benchmarkSqlite({
  records,
  queries,
  iterations,
  fingerprint,
  shouldStop,
  onStatus,
}) {
  const before = heapSnapshot();
  const freshPort = createBenchmarkSqlitePort();
  if (freshPort.available === false) throw new Error('SQLite/FTS5 backend is unavailable.');
  await freshPort.clear();
  const freshBuild = await timed(() => freshPort.build(records, {
    fingerprint,
    onProgress(progress) {
      const completed = Number(progress.completed ?? 0);
      const total = Number(progress.total ?? 0);
      onStatus(`SQLite ${progress.stage ?? 'build'}${total ? `: ${completed}/${total}` : ''}`);
    },
  }));
  const afterBuild = heapSnapshot();
  const freshQueries = await queryBackend(freshPort, queries, iterations, shouldStop);
  const freshStats = await freshPort.stats();
  await freshPort.close();
  assertRunning(shouldStop);

  const reopenPort = createBenchmarkSqlitePort();
  const reopen = await timed(() => reopenPort.build(records, { fingerprint }));
  const reopenQueries = await queryBackend(reopenPort, queries, iterations, shouldStop);
  const reopenStats = await reopenPort.stats();
  await reopenPort.close();

  const cleanupPort = createBenchmarkSqlitePort();
  await cleanupPort.clear();
  await cleanupPort.close();
  return {
    backend: 'SQLite/FTS5',
    buildMs: round(freshBuild.durationMs),
    reopenMs: round(reopen.durationMs),
    query: freshQueries,
    reopenQuery: reopenQueries,
    heapBefore: before,
    heapAfterBuild: afterBuild,
    freshStats,
    reopenStats,
    isolatedStorage: 'l-note-search-benchmark.db',
  };
}

export async function runSearchBenchmark({
  counts,
  bodyChars,
  queryIterations,
  shouldStop = () => false,
  onStatus = () => {},
  onCase = () => {},
} = {}) {
  const report = {
    schemaVersion: 1,
    kind: 'lnote.search-benchmark',
    generatedAt: new Date().toISOString(),
    device: deviceSnapshot(),
    parameters: { counts, bodyChars, queryIterations },
    cases: [],
    preciseMemoryBefore: await preciseMemorySnapshot(),
  };

  for (const count of counts) {
    assertRunning(shouldStop);
    onStatus(`Создание корпуса ${count.toLocaleString('ru-RU')}…`);
    const records = createBenchmarkRecords({ count, bodyChars });
    const result = {
      id: benchmarkCaseId({ count, bodyChars }),
      count,
      bodyChars,
      estimatedBytes: estimateSearchCorpusBytes(records),
      queries: benchmarkQueries(count),
      generatedHeap: heapSnapshot(),
    };
    try {
      onStatus(`MiniSearch: ${count.toLocaleString('ru-RU')}…`);
      result.miniSearch = await benchmarkMiniSearch(
        records,
        result.queries,
        queryIterations,
        shouldStop,
      );
      assertRunning(shouldStop);
      onStatus(`SQLite/FTS5: ${count.toLocaleString('ru-RU')}…`);
      result.sqlite = await benchmarkSqlite({
        records,
        queries: result.queries,
        iterations: queryIterations,
        fingerprint: `benchmark:${result.id}`,
        shouldStop,
        onStatus,
      });
    } catch (error) {
      result.error = error instanceof Error ? error.message : String(error);
      report.cases.push(result);
      await onCase(result);
      if (error?.name === 'AbortError') throw error;
      continue;
    }
    report.cases.push(result);
    await onCase(result);
    await new Promise((resolve) => setTimeout(resolve, 0));
  }

  report.preciseMemoryAfter = await preciseMemorySnapshot();
  return report;
}
