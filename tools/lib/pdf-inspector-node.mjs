import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';

const require = createRequire(import.meta.url);
let runtimePromise = null;

async function loadRuntime() {
  const entry = require.resolve('@firecrawl/pdf-inspector-wasm');
  const module = await import(pathToFileURL(entry).href);
  const wasmPath = path.join(path.dirname(entry), 'pdf_inspector_wasm_bg.wasm');
  await module.default(await readFile(wasmPath));
  return module;
}

async function runtime() {
  runtimePromise ??= loadRuntime();
  return runtimePromise;
}

export async function inspectPdfFile(filename) {
  const pdf = await readFile(filename);
  const module = await runtime();
  const result = module.processPdf(pdf, {
    profile: 'fidelity',
    includePageMarkers: true,
    includeImages: true,
  });
  return { ...result, parserVersion: module.version() };
}
