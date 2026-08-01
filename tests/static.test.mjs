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

function numberedTail(source, count = 120) {
  const lines = source.split('\n');
  const start = Math.max(0, lines.length - count);
  return lines.slice(start).map((line, index) => `${start + index + 1}: ${line}`).join('\n');
}

const offlineModules = [
  'src/ai.js',
  'src/speech.js',
  'src/router.js',
  'src/relations.js',
  'src/core/contracts.js',
  'src/core/ports.js',
  'src/core/runtime.js',
  'src/core/application-adapter.js',
  'src/core/knowledge-graph.js',
  'src/adapters/indexeddb-search.js',
  'src/adapters/runtime-adapters.js',
  'src/domain-plugins/minimed.js',
  'src/integrations/minimed-adapter.js',
  'src/helpers/disk-search.js',
  'src/helpers/document-assets.js',
  'src/helpers/entity-terms.js',
  'src/helpers/model-formatters.js',
  'src/helpers/pack-source-parser.js',
  'src/pages/ask-page-controller.js',
  'src/pages/concept-resource-view.js',
  'src/pages/document-asset-view.js',
  'src/pages/document-resource-view.js',
  'src/pages/evidence-view.js',
  'src/pages/local-answer-view.js',
  'src/pages/model-lab-elements.js',
  'src/pages/model-lab-view.js',
  'src/pages/note-resource-view.js',
  'src/pages/notes-list-view.js',
  'src/pages/package-builder-view.js',
  'src/pages/package-resource-view.js',
  'src/pages/routed-resource-renderer.js',
  'src/pages/sidebar-controller.js',
  'src/pages/statement-resource-view.js',
  'src/pages/voice-search-controller.js',
  'src/pages/voice-search-elements.js',
  'src/services/answer-modes.js',
  'src/services/ask-workflow.js',
  'src/services/audio-recorder.js',
  'src/services/browser-pack-builder.js',
  'src/services/evidence-query.js',
  'src/services/evidence-support-verifier.js',
  'src/services/local-model-loader.js',
  'src/services/model-action.js',
  'src/services/model-lifecycle.js',
  'src/services/model-preferences.js',
  'src/services/model-progress.js',
  'src/services/note-workflow.js',
  'src/services/storage-persistence.js',
  'src/services/welcome-note.js',
  'src/workers/search-worker.js',
  'src/workers/speech-worker.js',
  'src/workers/webllm-worker.js',
  'src/ui/dom.js',
  'src/ui/text.js',
  'src/ui/icons.js',
  'src/ui/components.js',
  'src/ui/routed-dialog.js',
  'src/ui/knowledge-graph.js',
];

test('static build contains the complete offline shell', async () => {
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
    'src/app.js',
    ...offlineModules,
  ]) {
    await access(path.join(root, 'dist', relative));
  }

  const css = await readFile(path.join(root, 'dist', 'styles.css'), 'utf8');
  assert.match(css, /Generated from styles\/main\.scss/u);
  assert.match(css, /--palette-dark-paper/u);
  assert.match(css, /vendor\/phosphor\/style\.css/u);
  assert.match(css, /html:has\(body\.modal-open\)/u);
  assert.match(css, /\.dialog-close-button/u);
  assert.match(css, /\.source-card__action/u);
  assert.match(css, /\.model-progress-track/u);
  assert.match(css, /\.model-active-panel/u);
  assert.match(css, /\.model-power\.is-cached/u);
  assert.match(css, /\.answer-mode-panel/u);
  assert.match(css, /\.voice-search-panel/u);
  assert.match(css, /\.voice-search-toggle\.is-recording/u);
  assert.match(css, /\.document-asset-frame/u);
  assert.match(css, /\.knowledge-graph-node/u);
  assert.match(css, /\.ui-switch__track/u);
  assert.match(css, /\.sidebar\.is-collapsed/u);
  assert.match(css, /\.workspace\.is-sidebar-collapsed/u);
  assert.match(css, /content:\s*attr\(data-tooltip\)/u);
  assert.match(css, /\.pack-builder/u);
  assert.match(css, /\.pack-builder-progress/u);

  const html = await readFile(path.join(root, 'dist', 'index.html'), 'utf8');
  assert.match(html, /ph-magnifying-glass/u);
  assert.match(html, /ph-note-pencil/u);
  assert.match(html, /data-action="toggle-library-view"/u);
  assert.match(html, /data-action="create-pack"/u);
  assert.match(html, /Создать свой пакет/u);
  assert.doesNotMatch(html, /data-page="create-pack"/u);
  assert.match(html, /id="model-workspace" class="model-workspace hidden"/u);
  assert.match(html, /dialog-close-button/u);

  const app = await readFile(path.join(root, 'dist', 'src', 'app.js'), 'utf8');
  assert.match(app, /buildKnowledgeGraph/u);
  assert.match(app, /beginLocalModelLoad/u);
  assert.match(app, /createModelLabView/u);
  assert.match(app, /createAskWorkflow/u);
  assert.match(app, /createAskPageController/u);
  assert.match(app, /createBrowserSpeechRecognitionPort/u);
  assert.match(app, /createVoiceSearchController/u);
  assert.match(app, /createLexicalEvidenceVerifier/u);
  assert.match(app, /renderEvidenceView/u);
  assert.match(app, /renderGeneratedLocalAnswer/u);
  assert.match(app, /renderPackageBuilderResource/u);
  assert.match(app, /createRoutedResourceRenderer/u);
  assert.match(app, /renderDocumentResource/u);
  assert.match(app, /renderConceptResource/u);
  assert.match(app, /renderPackageResource/u);
  assert.match(app, /renderStatementResource/u);
  assert.match(app, /createNoteResourceView/u);
  assert.match(app, /renderNotesList/u);
  assert.match(app, /createNoteRecord/u);
  assert.match(app, /createSidebarController/u);
  assert.match(app, /detectEntitiesInText/u);
  assert.match(app, /MODEL_SELECTION_SETTING_KEY/u);
  assert.match(app, /markLocalModelCached/u);
  assert.match(app, /createRoutedDialogController/u);
  assert.match(app, /ensureWelcomeNote/u);

  const voice = await readFile(path.join(root, 'dist', 'src', 'speech.js'), 'utf8');
  assert.match(voice, /Xenova\/whisper-tiny/u);
  assert.match(voice, /Xenova\/whisper-base/u);
  assert.match(voice, /BrowserSpeechRecognition/u);

  const voiceController = await readFile(
    path.join(root, 'dist', 'src', 'pages', 'voice-search-controller.js'),
    'utf8',
  );
  assert.match(voiceController, /VOICE_LANGUAGE_SETTING_KEY/u);
  assert.match(voiceController, /MAX_VOICE_SEARCH_DURATION_MS/u);

  const voiceElements = await readFile(
    path.join(root, 'dist', 'src', 'pages', 'voice-search-elements.js'),
    'utf8',
  );
  assert.match(voiceElements, /Голосовой поиск/u);
  assert.match(voiceElements, /renderVoiceSearchElements/u);

  const speechWorker = await readFile(
    path.join(root, 'dist', 'src', 'workers', 'speech-worker.js'),
    'utf8',
  );
  assert.match(speechWorker, /@huggingface\/transformers@4\.2\.0/u);
  assert.match(speechWorker, /automatic-speech-recognition/u);

  const diskAdapter = await readFile(
    path.join(root, 'dist', 'src', 'adapters', 'indexeddb-search.js'),
    'utf8',
  );
  assert.match(diskAdapter, /IndexedDbSearchPort/u);
  assert.match(diskAdapter, /defineAsyncSearchPort/u);

  const diskWorker = await readFile(
    path.join(root, 'dist', 'src', 'workers', 'search-worker.js'),
    'utf8',
  );
  assert.match(diskWorker, /l-note-search/u);
  assert.match(diskWorker, /disk-postings-v1/u);

  const verifier = await readFile(
    path.join(root, 'dist', 'src', 'services', 'evidence-support-verifier.js'),
    'utf8',
  );
  assert.match(verifier, /verifyStatementSupport/u);
  assert.match(verifier, /unsupportedStatements/u);
  assert.match(verifier, /negationMismatch/u);

  const askController = await readFile(path.join(root, 'dist', 'src', 'pages', 'ask-page-controller.js'), 'utf8');
  assert.match(askController, /createAskPageController/u);
  assert.match(askController, /Генерация и проверка ссылок/u);

  const askWorkflow = await readFile(path.join(root, 'dist', 'src', 'services', 'ask-workflow.js'), 'utf8');
  assert.match(askWorkflow, /createAskWorkflow/u);
  assert.match(askWorkflow, /loadSelectedLocalModel/u);
  assert.match(askWorkflow, /collectQuestionEvidence/u);
  assert.match(askWorkflow, /verifyGeneratedAnswer/u);

  const packageBuilder = await readFile(path.join(root, 'dist', 'src', 'pages', 'package-builder-view.js'), 'utf8');
  assert.match(packageBuilder, /renderPackageBuilderResource/u);
  assert.match(packageBuilder, /buildPackFromBrowserFiles/u);
  assert.match(packageBuilder, /Установить и открыть/u);
  assert.match(packageBuilder, /Или вставьте текст/u);

  const packBuilder = await readFile(path.join(root, 'dist', 'src', 'services', 'browser-pack-builder.js'), 'utf8');
  assert.match(packBuilder, /buildPackFromBrowserFiles/u);
  assert.match(packBuilder, /BROWSER_PACK_TOTAL_LIMIT/u);

  const evidenceView = await readFile(path.join(root, 'dist', 'src', 'pages', 'evidence-view.js'), 'utf8');
  assert.match(evidenceView, /SourceCard\(\{/u);
  assert.match(evidenceView, /renderEvidenceView/u);

  const resourceRegistry = await readFile(path.join(root, 'dist', 'src', 'pages', 'routed-resource-renderer.js'), 'utf8');
  assert.match(resourceRegistry, /createRoutedResourceRenderer/u);
  assert.match(resourceRegistry, /registry\.get/u);

  const documentView = await readFile(path.join(root, 'dist', 'src', 'pages', 'document-resource-view.js'), 'utf8');
  assert.match(documentView, /renderDocumentResource/u);
  assert.match(documentView, /createDocumentAssetView/u);
  assert.match(documentView, /Открыть внешний первоисточник/u);

  const packageView = await readFile(path.join(root, 'dist', 'src', 'pages', 'package-resource-view.js'), 'utf8');
  assert.match(packageView, /renderPackageResource/u);
  assert.match(packageView, /Скачать пакет/u);

  const noteView = await readFile(path.join(root, 'dist', 'src', 'pages', 'note-resource-view.js'), 'utf8');
  assert.match(noteView, /createNoteResourceView/u);
  assert.match(noteView, /Связанное утверждение/u);

  const noteWorkflow = await readFile(path.join(root, 'dist', 'src', 'services', 'note-workflow.js'), 'utf8');
  assert.match(noteWorkflow, /createNoteRecord/u);
  assert.match(noteWorkflow, /normalizeImportedNotes/u);

  const sidebarController = await readFile(path.join(root, 'dist', 'src', 'pages', 'sidebar-controller.js'), 'utf8');
  assert.match(sidebarController, /SIDEBAR_COLLAPSED_SETTING_KEY/u);
  assert.match(sidebarController, /aria-expanded/u);

  const ai = await readFile(path.join(root, 'dist', 'src', 'ai.js'), 'utf8');
  assert.match(ai, /Qwen3-4B-q4f16_1-MLC/u);
  assert.match(ai, /CreateWebWorkerMLCEngine/u);
  assert.match(ai, /hasModelInCache/u);
  assert.match(ai, /cacheBackend:\s*this\.cacheBackend/u);

  const modelElements = await readFile(path.join(root, 'dist', 'src', 'pages', 'model-lab-elements.js'), 'utf8');
  assert.match(modelElements, /Выгрузить из памяти/u);
  assert.match(modelElements, /createModelLabElements/u);

  const serviceWorker = await readFile(path.join(root, 'dist', 'service-worker.js'), 'utf8');
  assert.match(serviceWorker, /l-note-shell-v34/u);
  assert.match(serviceWorker, /cdn\.jsdelivr\.net/u);
  assert.match(serviceWorker, /assets\/lnote-source-demo\.pdf/u);
  assert.match(serviceWorker, /workers\/search-worker\.js/u);
  assert.match(serviceWorker, /workers\/speech-worker\.js/u);
  assert.match(serviceWorker, /evidence-support-verifier\.js/u);

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
  const existed = await readFile(path.join(target, 'index.js'), 'utf8').then(() => true, () => false);
  const original = existed ? await readFile(path.join(target, 'index.js'), 'utf8') : null;
  await mkdir(target, { recursive: true });
  await writeFile(path.join(target, 'index.js'), 'globalThis.MiniSearch = class TestMiniSearch {};\n');
  try {
    const result = buildStatic();
    assert.equal(result.status, 0, result.stderr);
    assert.match(await readFile(path.join(root, 'dist', 'vendor', 'minisearch.js'), 'utf8'), /TestMiniSearch/u);
  } finally {
    if (original === null) await rm(nodeModules, { recursive: true, force: true });
    else await writeFile(path.join(target, 'index.js'), original);
  }
});
