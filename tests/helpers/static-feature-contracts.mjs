import { assertContains } from './static-build-fixture.mjs';

export async function assertDocumentFeatureContracts() {
  await assertContains('src/helpers/note-targets.js', [
    /indexNoteTargets/u,
    /resolveNoteDocument/u,
    /noteSectionRef/u,
  ]);
  await assertContains('src/helpers/statement-conflicts.js', [
    /qualifyStatementId/u,
    /buildStatementConflictIndex/u,
    /sectionConflictAnnotations/u,
  ]);
  await assertContains('src/helpers/statement-selections.js', [
    /validateStatementSelections/u,
    /buildStatementSelectionIndex/u,
    /preferredClaimRefs/u,
  ]);
  await assertContains('src/pages/document-resource-view.js', [
    /buildStatementConflictIndex/u,
    /createStatementConflictDisclosure/u,
    /createSectionAnnotationButton/u,
    /renderSectionAnnotations/u,
  ]);
  await assertContains('src/pages/document-annotation-view.js', [
    /Добавить разметку/u,
    /sectionAnnotationNotes/u,
    /document-annotation-card/u,
  ]);
  await assertContains('src/pages/document-asset-view.js', [
    /Открыть или скачать исходный файл/u,
    /document-asset-open-link/u,
  ]);
  await assertContains('src/pages/note-resource-view.js', [
    /targetDocumentId/u,
    /Разметка раздела/u,
    /renderDocumentTarget/u,
  ]);
  await assertContains('src/pages/statement-conflict-view.js', [
    /statement-conflict-marker/u,
    /В источниках есть разные сведения/u,
    /не выбирает одну автоматически/u,
  ]);
  await assertContains('src/pages/statement-resource-view.js', [
    /buildStatementSelectionIndex/u,
    /Статус версии/u,
    /Предпочтительно/u,
  ]);
}

export async function assertWorkflowFeatureContracts() {
  await assertContains('src/services/package-transfer.js', [
    /downloadSearchArtifacts/u,
    /searchArtifactFiles/u,
    /Optional prebuilt search artifact was skipped/u,
  ]);
  await assertContains('src/helpers/transfer-activity.js', [
    /sectionTransferActivities/u,
    /attentionTransferTasks/u,
    /speech-model/u,
  ]);
  await assertContains('src/pages/transfer-queue-view.js', [
    /attentionTransferTasks/u,
    /Требуют внимания/u,
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
}

export async function assertModelContracts() {
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
}

export async function assertPackAndOfflineContracts() {
  await assertContains('packs/lnote-guide.pack.json', [
    /"statementRelations"/u,
    /"guide\.search\.legacy"/u,
    /"guide\.search\.disk"/u,
    /"type":"contradicts"/u,
  ]);
  await assertContains('service-worker.js', [
    /l-note-shell-v46/u,
    /cdn\.jsdelivr\.net/u,
    /benchmarks\/search\.html/u,
    /benchmarks\/search-benchmark-runner\.js/u,
    /benchmarks\/sqlite-benchmark-worker\.js/u,
    /pdf-inspector\/pdf_inspector_wasm_bg\.wasm/u,
    /pdf-inspector-result\.js/u,
    /browser-pdf-inspector\.js/u,
    /pdf-inspector-worker\.js/u,
    /prebuilt-search-artifacts\.js/u,
    /note-targets\.js/u,
    /document-annotation-view\.js/u,
    /installed-pack-record\.js/u,
    /sqlite-artifact-runtime\.js/u,
    /sqlite-fts-search\.js/u,
    /sqlite-runtime-modules\.js/u,
    /sqlite-search-worker\.js/u,
    /statement-conflicts\.js/u,
    /statement-selections\.js/u,
    /statement-conflict-view\.js/u,
    /queued-runtime-loader\.js/u,
    /transfer-activity\.js/u,
    /transfer-queue\.js/u,
    /assets\/lnote-source-demo\.pdf/u,
  ]);
}
