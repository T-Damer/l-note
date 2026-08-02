const SHELL_CACHE = 'l-note-shell-v39';
const RUNTIME_CACHE = 'l-note-runtime-v39';
const SHELL = [
  './',
  './index.html',
  './styles.css',
  './manifest.webmanifest',
  './assets/icon.svg',
  './assets/lnote-source-demo.pdf',
  './vendor/minisearch.js',
  './vendor/minisearch.LICENSE.txt',
  './vendor/phosphor/style.css',
  './vendor/phosphor/Phosphor.woff2',
  './src/app.js',
  './src/db.js',
  './src/search.js',
  './src/packs.js',
  './src/ai.js',
  './src/speech.js',
  './src/router.js',
  './src/relations.js',
  './src/core/contracts.js',
  './src/core/ports.js',
  './src/core/runtime.js',
  './src/core/application-adapter.js',
  './src/core/knowledge-graph.js',
  './src/adapters/adaptive-search.js',
  './src/adapters/sqlite-fts-search.js',
  './src/adapters/indexeddb-search.js',
  './src/adapters/runtime-adapters.js',
  './src/domain-plugins/minimed.js',
  './src/integrations/minimed-adapter.js',
  './src/helpers/disk-search.js',
  './src/helpers/sqlite-fts.js',
  './src/helpers/document-assets.js',
  './src/helpers/entity-terms.js',
  './src/helpers/model-formatters.js',
  './src/helpers/pack-source-parser.js',
  './src/helpers/statement-conflicts.js',
  './src/helpers/text-diff.js',
  './src/helpers/transfer-queue.js',
  './src/pages/ask-page-controller.js',
  './src/pages/concept-resource-view.js',
  './src/pages/document-asset-view.js',
  './src/pages/document-resource-view.js',
  './src/pages/evidence-view.js',
  './src/pages/local-answer-view.js',
  './src/pages/model-lab-elements.js',
  './src/pages/model-lab-view.js',
  './src/pages/note-resource-view.js',
  './src/pages/notes-list-view.js',
  './src/pages/package-builder-view.js',
  './src/pages/package-resource-view.js',
  './src/pages/routed-resource-renderer.js',
  './src/pages/search-results-view.js',
  './src/pages/sidebar-controller.js',
  './src/pages/statement-conflict-view.js',
  './src/pages/statement-resource-view.js',
  './src/pages/transfer-queue-view.js',
  './src/pages/voice-search-controller.js',
  './src/pages/voice-search-elements.js',
  './src/services/answer-modes.js',
  './src/services/ask-workflow.js',
  './src/services/audio-recorder.js',
  './src/services/browser-pack-builder.js',
  './src/services/evidence-query.js',
  './src/services/evidence-support-verifier.js',
  './src/services/local-model-loader.js',
  './src/services/model-action.js',
  './src/services/model-lifecycle.js',
  './src/services/model-preferences.js',
  './src/services/model-progress.js',
  './src/services/note-workflow.js',
  './src/services/package-transfer.js',
  './src/services/storage-persistence.js',
  './src/services/transfer-queue.js',
  './src/services/welcome-note.js',
  './src/workers/search-worker.js',
  './src/workers/sqlite-fts-runtime.js',
  './src/workers/sqlite-search-worker.js',
  './src/workers/speech-worker.js',
  './src/workers/webllm-worker.js',
  './src/ui/dom.js',
  './src/ui/text.js',
  './src/ui/icons.js',
  './src/ui/components.js',
  './src/ui/routed-dialog.js',
  './src/ui/knowledge-graph.js',
  './packs/catalog.json',
];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(SHELL_CACHE).then((cache) => cache.addAll(SHELL)));
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => ![SHELL_CACHE, RUNTIME_CACHE].includes(key)).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  const isNavigation = request.mode === 'navigate';
  const cacheableExternal = ['esm.run', 'cdn.jsdelivr.net'].includes(url.hostname);
  const modelAsset = /(?:huggingface\.co|hf\.co|cdn-lfs|xethub)/iu.test(url.hostname)
    || url.pathname.includes('/resolve/');
  if (modelAsset) return;

  if (isNavigation) {
    event.respondWith(
      fetch(request)
        .then((response) => {
          caches.open(RUNTIME_CACHE).then((cache) => cache.put(request, response.clone()));
          return response;
        })
        .catch(() => caches.match(request).then((cached) => cached || caches.match('./index.html'))),
    );
    return;
  }

  if (url.origin === self.location.origin || cacheableExternal) {
    event.respondWith(
      caches.match(request).then((cached) => {
        const network = fetch(request)
          .then((response) => {
            if (response.ok || response.type === 'opaque') {
              caches.open(RUNTIME_CACHE).then((cache) => cache.put(request, response.clone()));
            }
            return response;
          })
          .catch(() => cached);
        return cached || network;
      }),
    );
  }
});
