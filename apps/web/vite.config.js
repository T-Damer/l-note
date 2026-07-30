import { fileURLToPath, URL } from 'node:url';

import { defineConfig } from 'vite';

const root = fileURLToPath(new URL('.', import.meta.url));
const repositoryName = process.env.GITHUB_REPOSITORY?.split('/').at(-1) ?? 'l-note';

export default defineConfig({
  root,
  base: process.env.GITHUB_ACTIONS ? `/${repositoryName}/` : '/',
  publicDir: fileURLToPath(new URL('../../public', import.meta.url)),
  build: {
    outDir: fileURLToPath(new URL('../../dist', import.meta.url)),
    emptyOutDir: true,
    sourcemap: true,
  },
  server: {
    host: '127.0.0.1',
    port: 4173,
  },
  preview: {
    host: '127.0.0.1',
    port: 4174,
  },
});
