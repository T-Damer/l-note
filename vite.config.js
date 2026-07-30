import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  base: './',
  plugins: [
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icon.svg', 'catalog.json', 'packs/*.json'],
      manifest: {
        name: 'L-Note — локальная база знаний',
        short_name: 'L-Note',
        description: 'Офлайн-пакеты знаний, fuzzy search, заметки и локальный ИИ.',
        start_url: './',
        scope: './',
        display: 'standalone',
        background_color: '#f4f1e8',
        theme_color: '#23372f',
        lang: 'ru',
        icons: [
          {
            src: 'icon.svg',
            sizes: 'any',
            type: 'image/svg+xml',
            purpose: 'any maskable'
          }
        ]
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,json}'],
        // The WebLLM runtime is a large optional chunk. Keep the application
        // shell small and cache this chunk only after the user enables local AI.
        globIgnores: ['**/assets/lib-*.js'],
        cleanupOutdatedCaches: true,
        navigateFallback: 'index.html',
        runtimeCaching: [
          {
            urlPattern: ({ url }) => /\/assets\/lib-[^/]+\.js$/u.test(url.pathname),
            handler: 'CacheFirst',
            options: {
              cacheName: 'l-note-local-ai-runtime',
              expiration: { maxEntries: 3, maxAgeSeconds: 60 * 60 * 24 * 365 },
              cacheableResponse: { statuses: [0, 200] }
            }
          },
          {
            urlPattern: ({ url }) =>
              url.pathname.endsWith('.json') || url.pathname.endsWith('.db') || url.pathname.endsWith('.sqlite'),
            handler: 'CacheFirst',
            options: {
              cacheName: 'l-note-knowledge-artifacts',
              expiration: { maxEntries: 120, maxAgeSeconds: 60 * 60 * 24 * 365 },
              cacheableResponse: { statuses: [0, 200] }
            }
          }
        ]
      }
    })
  ],
  build: {
    target: 'es2022',
    sourcemap: true
  }
});
