const DEFAULT_QUERIES = Object.freeze([
  'детерминированный маркер',
  'локальная библиотека',
  'проверка поиска',
  'источник 0042',
]);

function boundedInteger(value, fallback, minimum, maximum) {
  const numeric = Math.floor(Number(value));
  if (!Number.isFinite(numeric)) return fallback;
  return Math.max(minimum, Math.min(maximum, numeric));
}

function marker(index) {
  return `source-${String(index + 1).padStart(6, '0')}`;
}

function repeatedBody(index, targetChars) {
  const prefix = [
    `Детерминированный маркер ${marker(index)}.`,
    'Локальная библиотека проверяет поиск, повторное открытие и устойчивое ранжирование.',
    `Запись относится к группе ${index % 31} и категории ${index % 7}.`,
  ].join(' ');
  const filler = ' Справочный текст сохраняет одинаковую структуру для сопоставимого измерения.';
  let output = prefix;
  while (output.length < targetChars) output += filler;
  return output.slice(0, targetChars);
}

export function createBenchmarkRecords({
  count = 5_000,
  bodyChars = 640,
} = {}) {
  const safeCount = boundedInteger(count, 5_000, 1, 100_000);
  const safeBodyChars = boundedInteger(bodyChars, 640, 120, 8_192);
  return Array.from({ length: safeCount }, (_, index) => ({
    id: `section:${marker(index)}`,
    kind: 'section',
    packId: 'benchmark.search',
    packTitle: 'Search benchmark',
    documentId: `document-${String(Math.floor(index / 20) + 1).padStart(5, '0')}`,
    documentTitle: `Benchmark document ${Math.floor(index / 20) + 1}`,
    sectionId: marker(index),
    title: `Источник ${String(index + 1).padStart(6, '0')}`,
    body: repeatedBody(index, safeBodyChars),
    aliases: index % 10 === 0 ? `маркер ${marker(index)}` : '',
    entityNames: `Категория ${index % 7}`,
    entityIds: [],
    tags: `benchmark группа-${index % 31} категория-${index % 7}`,
    authority: 'reference',
    effectiveFrom: null,
    sourceTitle: 'Generated benchmark corpus',
    claimIds: [],
  }));
}

export function benchmarkQueries(count, customQueries = DEFAULT_QUERIES) {
  const safeCount = Math.max(1, Math.floor(Number(count) || 1));
  const last = `source-${String(safeCount).padStart(6, '0')}`;
  const middle = `source-${String(Math.max(1, Math.floor(safeCount / 2))).padStart(6, '0')}`;
  return [...new Set([
    ...customQueries,
    last,
    middle,
  ].map((value) => String(value).trim()).filter(Boolean))];
}

export function percentile(values, fraction) {
  const sorted = (values ?? []).filter(Number.isFinite).sort((left, right) => left - right);
  if (!sorted.length) return null;
  const bounded = Math.max(0, Math.min(1, Number(fraction) || 0));
  const index = Math.min(sorted.length - 1, Math.ceil(sorted.length * bounded) - 1);
  return sorted[Math.max(0, index)];
}

export function summarizeTimings(values) {
  const clean = (values ?? []).filter(Number.isFinite);
  if (!clean.length) return Object.freeze({ samples: 0, meanMs: null, p50Ms: null, p95Ms: null, maxMs: null });
  const meanMs = clean.reduce((sum, value) => sum + value, 0) / clean.length;
  return Object.freeze({
    samples: clean.length,
    meanMs,
    p50Ms: percentile(clean, 0.5),
    p95Ms: percentile(clean, 0.95),
    maxMs: Math.max(...clean),
  });
}

export function benchmarkCaseId({ count, bodyChars }) {
  return `${boundedInteger(count, 5_000, 1, 100_000)}x${boundedInteger(bodyChars, 640, 120, 8_192)}`;
}

export const SEARCH_BENCHMARK_DEFAULTS = Object.freeze({
  counts: Object.freeze([1_000, 5_000, 10_000]),
  bodyChars: 640,
  queryIterations: 5,
  queries: DEFAULT_QUERIES,
});
