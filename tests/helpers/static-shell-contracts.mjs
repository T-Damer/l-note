import assert from 'node:assert/strict';

import { assertContains } from './static-build-fixture.mjs';

export async function assertShellContracts() {
  await assertContains('styles.css', [
    /Generated from styles\/main\.scss/u,
    /--palette-dark-paper/u,
    /\.dialog-close-button/u,
    /\.model-progress-track/u,
    /\.voice-search-panel/u,
    /\.document-asset-frame/u,
    /\.document-section-actions/u,
    /\.document-annotations/u,
    /\.knowledge-graph-node/u,
    /\.pack-builder/u,
    /\.statement-conflict-marker/u,
    /\.statement-conflict-diff/u,
    /\.sidebar-activity-progress/u,
    /\.mobile-nav \.sidebar-activity-progress/u,
    /\.relation-view-toolbar/u,
    /\.transfer-queue-host/u,
    /\.transfer-queue-panel/u,
    /scrollbar-width:\s*none/u,
  ]);
  const html = await assertContains('index.html', [
    /ph-magnifying-glass/u,
    /data-action="toggle-library-view"/u,
    /data-action="create-pack"/u,
    /Создать свой пакет/u,
    /dialog-close-button/u,
    /id="sidebar-status"[^>]*hidden/u,
  ]);
  assert.ok(
    html.indexOf('id="search-input"') < html.indexOf('id="search-suggestions"')
      && html.indexOf('id="search-suggestions"') < html.indexOf('class="search-options"'),
    'Search suggestions must be directly below the search input.',
  );
}

export async function assertBenchmarkContracts() {
  await assertContains('benchmarks/search.html', [
    /Search benchmark/u,
    /l-note-search-benchmark\.db/u,
    /id="benchmark-form"/u,
    /vendor\/minisearch\.js/u,
    /search-benchmark\.js/u,
  ]);
  await assertContains('benchmarks/search-benchmark-runner.js', [
    /sqlite-benchmark-worker\.js/u,
    /createMiniSearchPort/u,
    /createSqliteFtsSearchPort/u,
    /isolatedStorage/u,
    /runSearchBenchmark/u,
  ]);
  await assertContains('benchmarks/sqlite-benchmark-worker.js', [
    /l-note-search-benchmark\.db/u,
    /SqliteFtsRuntime/u,
    /commandQueue/u,
  ]);
}

export async function assertSearchRuntimeContracts() {
  await assertContains('src/adapters/adaptive-search.js', [
    /createSqliteFtsSearchPort/u,
    /createIndexedDbSearchPort/u,
    /prebuiltSearchArtifact/u,
    /memoryFallback/u,
    /await port\.close/u,
  ]);
  await assertContains('src/adapters/sqlite-fts-search.js', [
    /SqliteFtsSearchPort/u,
    /sqlite-search-worker\.js/u,
    /preparedArtifact/u,
    /defineAsyncSearchPort/u,
    /await this\.request\('close'\)/u,
  ]);
  await assertContains('src/workers/sqlite-fts-runtime.js', [
    /loadSqliteRuntimeModules/u,
    /modules\.useIdbStorage/u,
    /this\.databaseName/u,
    /modules\.withExistDB/u,
    /reopenFromFile/u,
    /CREATE VIRTUAL TABLE IF NOT EXISTS records_fts USING fts5/u,
    /bm25\(records_fts/u,
  ]);
  await assertContains('src/workers/sqlite-runtime-modules.js', [
    /@subframe7536\/sqlite-wasm/u,
    /esm\.run/u,
    /cdn\.jsdelivr\.net/u,
    /wa-sqlite-async\.wasm/u,
    /initSQLite/u,
    /useIdbStorage/u,
    /withExistDB/u,
  ]);
  await assertContains('src/workers/sqlite-artifact-runtime.js', [
    /quick_check/u,
    /artifactFormatVersion/u,
    /sqliteImportStream/u,
    /reopenFromFile/u,
    /resetSqliteSearchStorage/u,
  ]);
  await assertContains('src/workers/sqlite-search-worker.js', [
    /importSqliteSearchArtifact/u,
    /artifact-fallback/u,
    /SqliteFtsRuntime/u,
    /commandQueue/u,
  ]);
  await assertContains('src/helpers/prebuilt-search-artifacts.js', [
    /validatePrebuiltSearchArtifacts/u,
    /selectPrebuiltSearchArtifact/u,
    /searchArtifactFiles/u,
  ]);
}

export async function assertApplicationAssemblyContracts() {
  return assertContains('src/app.js', [
    /createAdaptiveSearchPort/u,
    /createBrowserSpeechRecognitionPort/u,
    /createLexicalEvidenceVerifier/u,
    /createAskWorkflow/u,
    /renderPackageBuilderResource/u,
    /createRoutedResourceRenderer/u,
    /renderDocumentResource/u,
    /renderStatementResource/u,
    /setActivityProgress/u,
    /sectionTransferActivities/u,
    /createTransferQueue/u,
    /createQueuedRuntimeLoader/u,
    /createTransferQueueView/u,
    /downloadAndInstallThroughQueue/u,
    /createInstalledPackRecord/u,
  ]);
}
