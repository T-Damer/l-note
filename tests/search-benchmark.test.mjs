import assert from 'node:assert/strict';
import test from 'node:test';

import { SqliteFtsRuntime } from '../src/workers/sqlite-fts-runtime.js';
import {
  benchmarkCaseId,
  benchmarkQueries,
  createBenchmarkRecords,
  percentile,
  summarizeTimings,
} from '../benchmarks/search-benchmark-core.js';

test('creates deterministic bounded search benchmark records', () => {
  const records = createBenchmarkRecords({ count: 3, bodyChars: 240 });
  assert.equal(records.length, 3);
  assert.equal(records[0].id, 'section:source-000001');
  assert.equal(records[2].sectionId, 'source-000003');
  assert.equal(records[0].body.length, 240);
  assert.match(records[0].body, /Детерминированный маркер source-000001/u);
  assert.deepEqual(createBenchmarkRecords({ count: 3, bodyChars: 240 }), records);
  assert.equal(benchmarkCaseId({ count: 3, bodyChars: 240 }), '3x240');
});

test('adds exact middle and final markers to benchmark queries', () => {
  const queries = benchmarkQueries(10_000, ['локальная библиотека']);
  assert.ok(queries.includes('source-005000'));
  assert.ok(queries.includes('source-010000'));
  assert.equal(new Set(queries).size, queries.length);
});

test('summarizes benchmark timings with stable nearest-rank percentiles', () => {
  assert.equal(percentile([4, 1, 3, 2], 0.5), 2);
  assert.equal(percentile([4, 1, 3, 2], 0.95), 4);
  assert.deepEqual(summarizeTimings([4, 1, 3, 2]), {
    samples: 4,
    meanMs: 2.5,
    p50Ms: 2,
    p95Ms: 4,
    maxMs: 4,
  });
});

test('supports an isolated SQLite benchmark database name', () => {
  const production = new SqliteFtsRuntime();
  const benchmark = new SqliteFtsRuntime({ databaseName: 'l-note-search-benchmark.db' });
  assert.equal(production.databaseName, 'l-note-search.db');
  assert.equal(benchmark.databaseName, 'l-note-search-benchmark.db');
  assert.throws(
    () => new SqliteFtsRuntime({ databaseName: '../shared.db' }),
    /simple 1-96 character storage name/u,
  );
});
