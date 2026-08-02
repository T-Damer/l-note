#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { validatePack } from '../src/packs.js';

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const catalogPath = resolve(repositoryRoot, 'packs/catalog.json');
const catalog = JSON.parse(await readFile(catalogPath, 'utf8'));
const failures = [];
const seen = new Set();
let totalBytes = 0;
let totalDocuments = 0;
let totalSections = 0;
let totalStatementRelations = 0;

if (catalog.schemaVersion !== 1) failures.push('catalog.schemaVersion must be 1');
if (!Array.isArray(catalog.packs) || catalog.packs.length === 0) failures.push('catalog.packs must be a non-empty array');

for (const entry of catalog.packs ?? []) {
  if (!entry.id || !entry.url) {
    failures.push('catalog entry requires id and url');
    continue;
  }
  if (seen.has(entry.id)) failures.push(`duplicate catalog pack id: ${entry.id}`);
  seen.add(entry.id);
  if (/^(?:[a-z]+:)?\/\//iu.test(entry.url)) {
    failures.push(`${entry.id}: repository validator expects a relative demo URL`);
    continue;
  }
  const path = resolve(repositoryRoot, entry.url.replace(/^\.\//u, ''));
  const bytes = await readFile(path);
  const sha256 = createHash('sha256').update(bytes).digest('hex');
  const pack = JSON.parse(bytes.toString('utf8'));
  const validation = validatePack(pack);
  if (!validation.valid) failures.push(...validation.errors.map((message) => `${entry.id}: ${message}`));
  if (pack.id !== entry.id) failures.push(`${entry.id}: pack.id mismatch (${pack.id})`);
  if (pack.version !== entry.version) failures.push(`${entry.id}: version mismatch`);
  if (entry.sha256 !== sha256) failures.push(`${entry.id}: SHA-256 mismatch`);
  if (entry.bytes !== bytes.length) failures.push(`${entry.id}: byte-size mismatch`);
  const sections = pack.documents.reduce((sum, document) => sum + document.sections.length, 0);
  const statementRelations = pack.statementRelations?.length ?? 0;
  if (entry.stats?.documents !== pack.documents.length) failures.push(`${entry.id}: document count mismatch`);
  if (entry.stats?.chunks !== sections) failures.push(`${entry.id}: section/chunk count mismatch`);
  if (entry.stats?.entities !== pack.entities.length) failures.push(`${entry.id}: entity count mismatch`);
  if (entry.stats?.claims !== pack.claims.length) failures.push(`${entry.id}: claim count mismatch`);
  if (entry.stats?.relations !== pack.relations.length) failures.push(`${entry.id}: relation count mismatch`);
  if (entry.stats?.statementRelations !== undefined && entry.stats.statementRelations !== statementRelations) {
    failures.push(`${entry.id}: statement-relation count mismatch`);
  }
  totalBytes += bytes.length;
  totalDocuments += pack.documents.length;
  totalSections += sections;
  totalStatementRelations += statementRelations;
}

if (failures.length > 0) {
  console.error(`Knowledge-pack validation failed (${failures.length}):`);
  for (const failure of failures) console.error(`- ${failure}`);
  process.exitCode = 1;
} else {
  console.log(
    `Validated ${catalog.packs.length} packs: ${totalDocuments} documents, ${totalSections} sections, `
    + `${totalStatementRelations} statement relations, ${totalBytes} bytes.`,
  );
}
