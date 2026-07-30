#!/usr/bin/env node
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildStyles } from './lib/styles-builder.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const result = await buildStyles(root);
console.log(`Built ${path.relative(root, result.outputPath)} from ${result.partialNames.length} SCSS partials.`);
