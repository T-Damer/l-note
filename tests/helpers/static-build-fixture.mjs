import assert from 'node:assert/strict';
import { access, readFile } from 'node:fs/promises';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

export const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

export const offlineModules = Object.freeze([
  'src/ai.js', 'src/speech.js', 'src/search.js',
  'src/core/contracts.js', 'src/core/ports.js', 'src/core/runtime.js',
  'src/core/application-adapter.js',
  'src/adapters/adaptive-search.js', 'src/adapters/sqlite-fts-search.js',
  'src/adapters/indexeddb-search.js', 'src/adapters/runtime-adapters.js',
  'src/helpers/sqlite-fts.js', 'src/helpers/disk-search.js',
  'src/helpers/prebuilt-search-artifacts.js', 'src/helpers/document-assets.js',
  'src/helpers/note-targets.js', 'src/helpers/pdf-inspector-result.js',
  'src/helpers/statement-conflicts.js', 'src/helpers/statement-selections.js',
  'src/helpers/text-diff.js', 'src/helpers/transfer-activity.js',
  'src/helpers/transfer-queue.js',
  'src/pages/ask-page-controller.js', 'src/pages/concept-resource-view.js',
  'src/pages/document-annotation-view.js', 'src/pages/document-asset-view.js',
  'src/pages/document-resource-view.js', 'src/pages/model-lab-view.js',
  'src/pages/note-resource-view.js', 'src/pages/package-builder-view.js',
  'src/pages/search-results-view.js', 'src/pages/sidebar-controller.js',
  'src/pages/statement-conflict-view.js', 'src/pages/statement-resource-view.js',
  'src/pages/transfer-queue-view.js', 'src/pages/voice-search-controller.js',
  'src/pages/voice-search-elements.js',
  'src/services/ask-workflow.js', 'src/services/browser-pdf-inspector.js',
  'src/services/evidence-query.js', 'src/services/evidence-support-verifier.js',
  'src/services/installed-pack-record.js', 'src/services/note-workflow.js',
  'src/services/package-transfer.js', 'src/services/queued-runtime-loader.js',
  'src/services/transfer-queue.js',
  'src/workers/pdf-inspector-worker.js', 'src/workers/search-worker.js',
  'src/workers/sqlite-artifact-runtime.js', 'src/workers/sqlite-fts-runtime.js',
  'src/workers/sqlite-runtime-modules.js', 'src/workers/sqlite-search-worker.js',
  'src/workers/speech-worker.js', 'src/workers/webllm-worker.js',
  'src/ui/components.js', 'src/ui/icons.js', 'src/ui/knowledge-graph.js',
  'src/ui/routed-dialog.js',
]);

export const benchmarkModules = Object.freeze([
  'benchmarks/search-benchmark.js',
  'benchmarks/search-benchmark-core.js',
  'benchmarks/search-benchmark-runner.js',
  'benchmarks/sqlite-benchmark-worker.js',
]);

export const requiredStaticFiles = Object.freeze([
  'index.html', 'styles.css', 'service-worker.js',
  'assets/lnote-source-demo.pdf', 'benchmarks/search.html',
  ...benchmarkModules,
  'vendor/minisearch.js',
  'vendor/pdf-inspector/pdf_inspector_wasm.js',
  'vendor/pdf-inspector/pdf_inspector_wasm_bg.wasm',
  'vendor/pdf-inspector/LICENSE.txt',
  'vendor/phosphor/style.css', 'vendor/phosphor/Phosphor.woff2',
  'packs/catalog.json', 'packs/lnote-guide.pack.json', 'src/app.js',
  ...offlineModules,
]);

export function buildStatic() {
  return spawnSync(process.execPath, ['tools/build-static.mjs'], {
    cwd: root,
    encoding: 'utf8',
  });
}

export async function assertStaticFiles() {
  for (const relative of requiredStaticFiles) await access(path.join(root, 'dist', relative));
}

export async function readStatic(relative) {
  return readFile(path.join(root, 'dist', relative), 'utf8');
}

export async function assertContains(relative, patterns) {
  const source = await readStatic(relative);
  for (const pattern of patterns) assert.match(source, pattern, `${relative} must match ${pattern}`);
  return source;
}

function numberedTail(source, count = 100) {
  const lines = source.split('\n');
  const start = Math.max(0, lines.length - count);
  return lines.slice(start).map((line, index) => `${start + index + 1}: ${line}`).join('\n');
}

export function assertStaticSyntax(app) {
  const appCheck = spawnSync(process.execPath, ['--check', path.join(root, 'dist', 'src', 'app.js')], {
    cwd: root,
    encoding: 'utf8',
  });
  assert.equal(appCheck.status, 0, `${appCheck.stderr}\n\nAssembled app tail:\n${numberedTail(app)}`);
  for (const relative of [...offlineModules, ...benchmarkModules]) {
    const check = spawnSync(process.execPath, ['--check', path.join(root, 'dist', relative)], {
      cwd: root,
      encoding: 'utf8',
    });
    assert.equal(check.status, 0, `${relative}: ${check.stderr}`);
  }
}
