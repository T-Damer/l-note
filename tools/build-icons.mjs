#!/usr/bin/env node
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildPhosphorIcons } from './lib/icons-builder.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const target = await buildPhosphorIcons(root);
console.log(`Vendored Phosphor regular icons into ${target}`);
