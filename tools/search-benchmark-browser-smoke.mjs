#!/usr/bin/env node
import assert from 'node:assert/strict';
import { access } from 'node:fs/promises';
import path from 'node:path';

import { withStaticBrowser } from './lib/browser-smoke-runner.mjs';

const root = process.cwd();
const dist = path.resolve(root, 'dist');
await access(path.join(dist, 'benchmarks', 'search.html'));

function withTimeout(promise, message, timeoutMs = 120_000) {
  let timeoutId;
  return Promise.race([
    promise.finally(() => clearTimeout(timeoutId)),
    new Promise((_, reject) => {
      timeoutId = setTimeout(() => reject(new Error(message)), timeoutMs);
    }),
  ]);
}

const result = await withStaticBrowser({
  dist,
  pathname: '/benchmarks/search.html',
  profilePrefix: 'l-note-search-benchmark-smoke-',
  timeoutMs: 120_000,
  run: ({ client, baseUrl }) => withTimeout(client.evaluate(`(async () => {
    const bounded = async (label, promise, timeoutMs = 60_000) => {
      let timeoutId;
      globalThis.__benchmarkSmokeStage = label;
      try {
        return await Promise.race([
          promise,
          new Promise((_, reject) => {
            timeoutId = setTimeout(() => reject(new Error('Benchmark stage timed out: ' + label)), timeoutMs);
          }),
        ]);
      } finally {
        clearTimeout(timeoutId);
      }
    };
    await bounded('minisearch-global', new Promise((resolve, reject) => {
      const startedAt = Date.now();
      const timer = setInterval(() => {
        if (typeof globalThis.MiniSearch === 'function') {
          clearInterval(timer);
          resolve();
        } else if (Date.now() - startedAt > 10_000) {
          clearInterval(timer);
          reject(new Error('MiniSearch global did not load.'));
        }
      }, 25);
    }));

    const adapter = await bounded(
      'production-module',
      import('${baseUrl}/src/adapters/sqlite-fts-search.js'),
    );
    const benchmark = await bounded(
      'benchmark-module',
      import('${baseUrl}/benchmarks/search-benchmark-runner.js'),
    );
    const productionRecords = [{
      id: 'section:benchmark-isolation',
      kind: 'section',
      packId: 'benchmark-isolation',
      packTitle: 'Benchmark isolation',
      documentId: 'benchmark-isolation.document',
      documentTitle: 'Production search sentinel',
      sectionId: 'sentinel',
      title: 'Production sentinel',
      body: 'The production SQLite search index must survive the isolated benchmark.',
      aliases: '',
      entityNames: '',
      tags: 'benchmark isolation production',
      authority: 'reference',
    }];
    const fingerprint = 'benchmark-production-isolation-v1';
    let productionPort;
    let reopenedPort;
    try {
      productionPort = adapter.createSqliteFtsSearchPort();
      await bounded('production-clear', productionPort.clear());
      const productionBuild = await bounded(
        'production-build',
        productionPort.build(productionRecords, { fingerprint }),
      );
      await bounded('production-close', productionPort.close(), 10_000);
      productionPort = null;

      const report = await bounded(
        'benchmark-run',
        benchmark.runSearchBenchmark({
          counts: [100],
          bodyChars: 160,
          queryIterations: 1,
        }),
        90_000,
      );

      reopenedPort = adapter.createSqliteFtsSearchPort();
      const reopenedBuild = await bounded(
        'production-reopen',
        reopenedPort.build(productionRecords, { fingerprint }),
      );
      const productionSearch = await bounded(
        'production-search',
        reopenedPort.search('production sentinel', { limit: 5 }),
      );
      await bounded('production-cleanup', reopenedPort.clear());
      return {
        productionBuild,
        reopenedBuild,
        productionResultId: productionSearch[0]?.id ?? null,
        report,
      };
    } finally {
      await productionPort?.close?.().catch(() => {});
      await reopenedPort?.close?.().catch(() => {});
    }
  })()`), 'Search benchmark browser smoke timed out.'),
});

assert.ok(result, 'Browser smoke did not run.');
assert.equal(result.productionBuild.reused, false);
assert.equal(result.reopenedBuild.reused, true);
assert.equal(result.productionResultId, 'section:benchmark-isolation');
assert.equal(result.report.kind, 'lnote.search-benchmark');
assert.equal(result.report.cases.length, 1);
const benchmarkCase = result.report.cases[0];
assert.equal(benchmarkCase.count, 100);
assert.equal(benchmarkCase.error, undefined);
assert.ok(benchmarkCase.miniSearch.buildMs >= 0);
assert.ok(benchmarkCase.miniSearch.query.samples > 0);
assert.ok(benchmarkCase.sqlite.buildMs >= 0);
assert.ok(benchmarkCase.sqlite.reopenMs >= 0);
assert.ok(benchmarkCase.sqlite.query.samples > 0);
assert.equal(benchmarkCase.sqlite.reopenStats.reused, undefined);
assert.equal(benchmarkCase.sqlite.isolatedStorage, 'l-note-search-benchmark.db');
assert.equal(benchmarkCase.sqlite.freshStats.fingerprint, 'benchmark:100x160');
assert.equal(benchmarkCase.sqlite.reopenStats.fingerprint, 'benchmark:100x160');
console.log('Search benchmark browser smoke passed: isolated SQLite benchmark preserved the production FTS index.');
