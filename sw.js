const CACHE_NAME = 'l-note-shell-v2';
const SHELL = [
  './',
  './index.html',
  './styles.css',
  './manifest.webmanifest',
  './icons/icon.svg',
  './src/app.js',
  './src/core.js',
  './src/db.js',
  './src/search.js',
  './src/ui.js',
  './src/state.js',
  './src/packs-ui.js',
  './src/search-ui.js',
  './src/notes-ui.js',
  './src/research-ui.js',
  './src/ai.js',
  './src/llm-worker.js',
  './packs/catalog.json',
  './packs/minimed-bronchiolitis.json',
  './packs/minimed-pneumonia.json',
  './packs/minimed-uti.json',
  './packs/minimed-measles.json',
  'https://cdn.jsdelivr.net/npm/dexie@4.4.4/dist/dexie.umd.min.js',
  'https://cdn.jsdelivr.net/npm/minisearch@7.2.0/dist/umd/index.min.js'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(async (cache) => {
      await Promise.allSettled(SHELL.map((url) => cache.add(url)));
      await self.skipWaiting();
    }),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    Promise.all([
      caches.keys().then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key)))),
      self.clients.claim(),
    ]),
  );
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  const requestUrl = new URL(event.request.url);
  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          const copy = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put('./index.html', copy));
          return response;
        })
        .catch(() => caches.match('./index.html')),
    );
    return;
  }

  const cacheFirst = requestUrl.origin !== self.location.origin || /\.(?:js|css|svg|json|webmanifest)$/u.test(requestUrl.pathname);
  if (cacheFirst) {
    event.respondWith(
      caches.match(event.request).then(
        (cached) =>
          cached ||
          fetch(event.request).then((response) => {
            if (response.ok || response.type === 'opaque') {
              const copy = response.clone();
              caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
            }
            return response;
          }),
      ),
    );
  }
});
