import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath, URL } from 'node:url';
import { join, resolve } from 'node:path';

import { defineConfig } from 'vite';

const root = fileURLToPath(new URL('.', import.meta.url));
const sourceDirectory = join(root, 'src');
const repositoryName = process.env.GITHUB_REPOSITORY?.split('/').at(-1) ?? 'l-note';
const virtualId = 'virtual:l-note-app';
const resolvedVirtualId = `\0${virtualId}`;
const partsDirectory = fileURLToPath(new URL('./src/main.parts', import.meta.url));

function loadApplicationSource() {
  return readdirSync(partsDirectory)
    .filter((name) => name.endsWith('.part'))
    .sort()
    .map((name) => readFileSync(join(partsDirectory, name), 'utf8'))
    .join('\n');
}

export default defineConfig({
  root,
  base: process.env.GITHUB_ACTIONS ? `/${repositoryName}/` : '/',
  publicDir: fileURLToPath(new URL('../../public', import.meta.url)),
  plugins: [
    {
      name: 'l-note-application-source',
      resolveId(id, importer) {
        if (id === virtualId) return resolvedVirtualId;
        if (importer === resolvedVirtualId && id.startsWith('.')) {
          return resolve(sourceDirectory, id);
        }
        return null;
      },
      load(id) {
        return id === resolvedVirtualId ? loadApplicationSource() : null;
      },
    },
  ],
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
