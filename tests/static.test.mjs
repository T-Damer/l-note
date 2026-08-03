import assert from 'node:assert/strict';
import { access, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function buildStatic() {
  return spawnSync(process.execPath, ['tools/build-static.mjs'], { cwd: root, encoding: 'utf8' });
}

function numberedTail(source, count = 100) {
  const lines = source.split('\n');
  const start = Math.max(0, lines.length - count);
  return lines.slice(start).map((line, index) => `${start + index + 1}: ${line}`).join('\n');
}

const offlineModules = [
  'src/ai.js',
  'src/speech.js',
  'src/search.js',
  'src/core/contracts.js',
  'src/core/ports.js',
  'src/core/runtime.js',
  'src/core/application-adapter.js',
  'src/adapters/adaptive-search.js',
  'src/adapters/sqlite-fts-search.js',
  'src/adapters/indexeddb-search.js',
  'src/adapters/runtime-adapters.js',
  'src/helpers/sqlite-fts.js',
  'src/helpers/disk-search.js',
  'src/helpers/prebuilt-search-artifacts.js',
  'src/helpers/document-assets.js',
  'src/helpers/statement-conflicts.js',
  'src/helpers/text-diff.js',
  'src/helpers/transfer-queue.js',
  'src/pages/ask-page-controller.js',
  'src/pages/concept-resource-view.js',
  'src/pages/document-asset-view.js',
  'src/pages/document-resource-view.js',
  'src/pages/model-lab-view.js',
  'src/pages/package-builder-view.js',
  'src/pages/search-results-view.js',
  'src/pages/sidebar-controller.js',
  'src/pages/statement-conflict-view.js',
  'src/pages/transfer-queue-view.js',
  'src/pages/voice-search-controller.js',
  'src/pages/voice-search-elements.js',
  'src/services/ask-workflow.js',
  'src/services/evidence-query.js',
  'src/services/evidence-support-verifier.js',
  'src/services/installed-pack-record.js',
  'src/services/package-transfer.js',
  'src/services/queued-runtime-loader.js',
  'src/services/transfer-queue.js',
  'src/workers/search-worker.js',
  'src/workers/sqlite-artifact-runtime.js',
  'src/workers/sqlite-fts-runtime.js',
  'src/workers/sqlite-runtime-modules.js',
  'src/workers/sqlite-search-worker.js',
  'src/workers/speech-worker.js',
  'src/workers/webllm-worker.js',
  'src/ui/components.js',
  'src/ui/icons.js',
  'src/ui/knowledge-graph.js',
  'src/ui/routed-dialog.js',
];

async function assertContains(relative, patterns) {
  const source = await readFile(path.join(root, 'dist', relative), 'utf8');
  for (const pattern of patterns) assert.match(source, pattern, `${relative} must match ${pattern}`);
  return source;
}

test('static build contains the complete local-first shell', async () => {
  const result = buildStatic();
  assert.equal(result.status, 0, result.stderr);
  for (const relative of [
    'index.html',
    'styles.css',
    'service-worker.js',
    'assets/lnote-source-demo.pdf',
    'vendor/minisearch.js',
    'vendor/phosphor/style.css',
    'vendor/phosphor/Phosphor.woff2',
    'packs/catalog.json',
    'packs/lnote-guide.pack.json',
    'src/app.js',
    ...offlineModules,
  ]) await access(path.join(root, 'dist', relative));

  await assertContains('styles.css', [
    /Generated from styles\/main\.scss/u,
    /--palette-dark-paper/u,
    /\.dialog-close-button/u,
    /\.model-progress-track/u,
    /\.voice-search-panel/u,
    /\.document-asset-frame/u,
    /\.knowledge-graph-node/u,
    /\.pack-builder/u,
    /\.statement-conflict-marker/u,
    /\.statement-conflict-diff/u,
    /\.sidebar-activity-progress/u,
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

  const app = await assertContains('src/app.js', [
    /createAdaptiveSearchPort/u,
    /createBrowserSpeechRecognitionPort/u,
    /createLexicalEvidenceVerifier/u,
    /createAskWorkflow/u,
    /renderPackageBuilderResource/u,
    /createRoutedResourceRenderer/u,
    /renderDocumentResource/u,
    /renderStatementResource/u,
    /setActivityProgress/u,
    /createTransferQueue/u,
    /createQueuedRuntimeLoader/u,
    /createTransferQueueView/u,
    /downloadAndInstallThroughQueue/u,
    /createInstalledPackRecord/u,
  ]);
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
    /modules\.withExistDB/u,
    /reopenFromFile/u,
    /CREATE VIRTUAL TABLE IF NOT EXISTS records_fts USING fts5/u,
    /bm25\(records_fts/u,
  ]);
  await assertContains('src/workers/sqlite-runtime-modules.js', [
    /@subframe7536\/sqlite-wasm/u,
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
  await assertContains('src/services/package-transfer.js', [
    /downloadSearchArtifacts/u,
    /searchArtifactFiles/u,
    /Optional prebuilt search artifact was skipped/u,
  ]);
  await assertContains('src/helpers/statement-conflicts.js', [
    /qualifyStatementId/u,
    /buildStatementConflictIndex/u,
    /sectionConflictAnnotations/u,
  ]);
  await assertContains('src/pages/document-resource-view.js', [
    /buildStatementConflictIndex/u,
    /createStatementConflictDisclosure/u,
    /statement-conflict-panels/u,
  ]);
  await assertContains('src/pages/statement-conflict-view.js', [
    /statement-conflict-marker/u,
    /В источниках есть разные сведения/u,
    /не выбирает одну автоматически/u,
  ]);
  await assertContains('src/pages/concept-resource-view.js', [
    /relationGraph/u,
    /relation-view-toggle/u,
    /relation-graph-view/u,
    /renderKnowledgeGraph/u,
  ]);
  await assertContains('src/pages/voice-search-elements.js', [
    /Первая загрузка распознавания речи требует сети/u,
    /голосовые запросы распознаются офлайн/u,
  ]);
  await assertContains('src/pages/transfer-queue-view.js', [
    /Нужно продолжить/u,
    /task\.status !== TRANSFER_STATUS\.COMPLETED/u,
    /Продолжить/u,
  ]);
  await assertContains('src/services/queued-runtime-loader.js', [
    /createQueuedRuntimeLoader/u,
    /resumeOnRestore/u,
    /transferAbortError/u,
  ]);
  await assertContains('src/services/evidence-support-verifier.js', [
    /verifyStatementSupport/u,
    /unsupportedStatements/u,
    /negationMismatch/u,
  ]);
  await assertContains('src/speech.js', [
    /onnx-community\/whisper-tiny/u,
    /onnx-community\/whisper-base/u,
    /decoder_model_merged:\s*'fp16'/u,
    /fallbackDtype/u,
    /BrowserSpeechRecognition/u,
  ]);
  await assertContains('src/workers/speech-worker.js', [
    /TransposeDQWeightsForMatMulNBits/u,
    /compatibility dtype/u,
    /Не удалось запустить локальное распознавание речи/u,
  ]);
  await assertContains('src/ai.js', [
    /Qwen3-4B-q4f16_1-MLC/u,
    /CreateWebWorkerMLCEngine/u,
    /hasModelInCache/u,
  ]);
  await assertContains('packs/lnote-guide.pack.json', [
    /"statementRelations"/u,
    /"guide\.search\.legacy"/u,
    /"guide\.search\.disk"/u,
    /"type":"contradicts"/u,
  ]);
  await assertContains('service-worker.js', [
    /l-note-shell-v41/u,
    /cdn\.jsdelivr\.net/u,
    /prebuilt-search-artifacts\.js/u,
    /installed-pack-record\.js/u,
    /sqlite-artifact-runtime\.js/u,
    /sqlite-fts-search\.js/u,
    /sqlite-runtime-modules\.js/u,
    /sqlite-search-worker\.js/u,
    /statement-conflicts\.js/u,
    /statement-conflict-view\.js/u,
    /queued-runtime-loader\.js/u,
    /transfer-queue\.js/u,
    /assets\/lnote-source-demo\.pdf/u,
  ]);

  const appSyntax = spawnSync(process.execPath, ['--check', path.join(root, 'dist', 'src', 'app.js')], {
    cwd: root,
    encoding: 'utf8',
  });
  assert.equal(appSyntax.status, 0, `${appSyntax.stderr}\n\nAssembled app tail:\n${numberedTail(app)}`);
  for (const relative of offlineModules) {
    const check = spawnSync(process.execPath, ['--check', path.join(root, 'dist', relative)], {
      cwd: root,
      encoding: 'utf8',
    });
    assert.equal(check.status, 0, `${relative}: ${check.stderr}`);
  }
});

test('static builder vendors the installed MiniSearch UMD file', async () => {
  const nodeModules = path.join(root, 'node_modules');
  const target = path.join(nodeModules, 'minisearch', 'dist', 'umd');
  const installed = path.join(target, 'index.js');
  const original = await readFile(installed, 'utf8').catch(() => null);
  await mkdir(target, { recursive: true });
  await writeFile(installed, 'globalThis.MiniSearch = class TestMiniSearch {};\n');
  try {
    const result = buildStatic();
    assert.equal(result.status, 0, result.stderr);
    assert.match(await readFile(path.join(root, 'dist', 'vendor', 'minisearch.js'), 'utf8'), /TestMiniSearch/u);
  } finally {
    if (original === null) await rm(nodeModules, { recursive: true, force: true });
    else await writeFile(installed, original);
  }
});