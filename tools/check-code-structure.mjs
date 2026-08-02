#!/usr/bin/env node
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const sourceRoots = [
  'src/core',
  'src/adapters',
  'src/services',
  'src/pages',
  'src/ui',
  'src/helpers',
  'src/domain-plugins',
  'src/integrations',
  'src/workers',
];
const MAX_LINES = 300;
const TRANSITIONAL_BUDGETS = new Map([
  ['src/app-parts/00-models.js', 40],
  ['src/app-parts/02a.js', 110],
  ['src/app-parts/03b.js', 30],
  ['src/app-parts/04a.js', 12],
  ['src/app-parts/04b.js', 90],
  ['src/app-parts/04e-notes.js', 90],
  ['src/app-parts/04i-pack-creator.js', 55],
  ['src/app-parts/05-model-lab.js', 280],
  ['src/app-parts/05a-ask-page.js', 90],
]);

async function collectFiles(directory) {
  const absolute = path.join(root, directory);
  const entries = await readdir(absolute, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const relative = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await collectFiles(relative));
    else if (entry.isFile() && /\.(?:js|mjs|scss)$/u.test(entry.name)) files.push(relative);
  }
  return files;
}

function countLines(source) {
  return source === '' ? 0 : source.split(/\r?\n/u).length;
}

function imports(source) {
  return [...source.matchAll(/from\s+['"]([^'"]+)['"]/gu)].map((match) => match[1]);
}

function validateBoundaries(relative, source, errors) {
  const moduleImports = imports(source);
  if (relative.startsWith('src/core/')) {
    const browserGlobalAccess = /\b(?:window|navigator|indexedDB|localStorage|sessionStorage)\s*\.|\bglobalThis\s*\.\s*(?:document|window|navigator|indexedDB|localStorage|sessionStorage)\b/u;
    const networkCall = /\bfetch\s*\(/u;
    if (browserGlobalAccess.test(source) || networkCall.test(source)) {
      errors.push(`${relative}: core must not use browser or network globals`);
    }
  }
  if (relative.startsWith('src/ui/')) {
    if (moduleImports.some((value) => /\/(?:pages|services|adapters)\//u.test(value))) {
      errors.push(`${relative}: reusable UI must not import pages, services or adapters`);
    }
  }
  if (relative.startsWith('src/services/')) {
    if (moduleImports.some((value) => /\/(?:pages|ui)\//u.test(value))) {
      errors.push(`${relative}: services must not import pages or UI`);
    }
  }
  if (relative.startsWith('src/pages/')) {
    if (moduleImports.some((value) => /app-parts/u.test(value))) {
      errors.push(`${relative}: pages must not depend on transitional app-parts`);
    }
  }
  if (/\.innerHTML\s*=/u.test(source)) {
    errors.push(`${relative}: raw innerHTML assignment is forbidden in modular source`);
  }
}

const errors = [];
const files = (await Promise.all(sourceRoots.map(collectFiles))).flat();
for (const relative of files) {
  const source = await readFile(path.join(root, relative), 'utf8');
  const lines = countLines(source);
  if (lines > MAX_LINES) errors.push(`${relative}: ${lines} lines exceeds the ${MAX_LINES}-line hard limit`);
  validateBoundaries(relative, source, errors);
}

for (const [relative, budget] of TRANSITIONAL_BUDGETS) {
  const source = await readFile(path.join(root, relative), 'utf8');
  const lines = countLines(source);
  if (lines > budget) errors.push(`${relative}: ${lines} lines exceeds its transitional budget of ${budget}`);
}

if (errors.length) {
  console.error('Code structure validation failed:');
  for (const error of errors) console.error(`- ${error}`);
  process.exitCode = 1;
} else {
  console.log(`Code structure validated: ${files.length} modular files, max ${MAX_LINES} lines.`);
}
