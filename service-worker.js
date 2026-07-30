const SHELL_CACHE = 'l-note-shell-v5';
const RUNTIME_CACHE = 'l-note-runtime-v5';
const SHELL = [
  './',
  './index.html',
  './styles.css',
  './manifest.webmanifest',
  './assets/icon.svg',
  './vendor/minisearch.js',
  './vendor/minisearch.LICENSE.txt',
  './src/app.js',
  './src/db.js',
  './src/search.js',
  './src/packs.js',
  './src/ai.js',
  './src/router.js',
  './src/relations.js',
  './src/domain-plugins/minimed.js',
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
  const cacheableExternal = url.hostname === 'esm.run';
  const modelAsset = url.hostname.includes('huggingface.co') || url.pathname.includes('/resolve/');
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
