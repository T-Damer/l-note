import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';

import {
  jsonArrayStream,
  writeJsonObjectEntries,
} from './pack-json-writer.mjs';
import { assertPreparationReviewsComplete } from './preparation-review-guard.mjs';
import { createStreamingPackValidator } from './streaming-pack-validator.mjs';

const OVERRIDDEN_MANIFEST_FIELDS = new Set([
  'documents',
  'entities',
  'claims',
  'relations',
  'statementRelations',
]);

async function readJson(filename, fallback) {
  try {
    return JSON.parse(await readFile(filename, 'utf8'));
  } catch (error) {
    if (error?.code === 'ENOENT' && fallback !== undefined) return fallback;
    throw new Error(`Unable to read ${filename}: ${error instanceof Error ? error.message : String(error)}`);
  }
}

async function readOptionalJson(filename) {
  try {
    return JSON.parse(await readFile(filename, 'utf8'));
  } catch (error) {
    if (error?.code === 'ENOENT') return undefined;
    throw new Error(`Unable to read ${filename}: ${error instanceof Error ? error.message : String(error)}`);
  }
}

async function documentNames(root) {
  const directory = path.join(root, 'documents');
  const names = (await readdir(directory, { withFileTypes: true }))
    .filter((entry) => entry.isFile() && entry.name.endsWith('.json'))
    .map((entry) => entry.name)
    .sort();
  if (!names.length) throw new Error('The documents directory contains no .json documents.');
  return names;
}

function manifestEntries(manifest) {
  return Object.entries(manifest)
    .filter(([key]) => !OVERRIDDEN_MANIFEST_FIELDS.has(key));
}

function validationPack(manifest, entities, claims, relations, statementRelations) {
  return {
    ...manifest,
    entities,
    claims,
    relations,
    ...(statementRelations !== undefined ? { statementRelations } : {}),
  };
}

export async function compileAuthoringPackToFile({
  inputPath,
  outputPath,
  onProgress = () => {},
} = {}) {
  if (!inputPath || !outputPath) throw new TypeError('inputPath and outputPath are required.');
  const root = path.resolve(inputPath);
  const manifest = await readJson(path.join(root, 'manifest.json'));
  assertPreparationReviewsComplete(manifest);
  const names = await documentNames(root);
  const [entities, claims, relations, relationFile] = await Promise.all([
    readJson(path.join(root, 'entities.json'), []),
    readJson(path.join(root, 'claims.json'), []),
    readJson(path.join(root, 'relations.json'), []),
    readOptionalJson(path.join(root, 'statement-relations.json')),
  ]);
  const statementRelations = relationFile !== undefined
    ? relationFile
    : manifest.statementRelations;
  const validator = createStreamingPackValidator(
    validationPack(manifest, entities, claims, relations, statementRelations),
    { label: 'Pack' },
  );
  validator.assertBaseValid();
  let validation;

  async function* documents() {
    for (const [index, name] of names.entries()) {
      const document = await readJson(path.join(root, 'documents', name));
      validator.addDocument(document, index);
      onProgress({ stage: 'document', index, total: names.length, name });
      yield document;
    }
    validation = validator.finalize();
  }

  const entries = [
    ...manifestEntries(manifest),
    ['documents', jsonArrayStream(documents(), { total: names.length })],
    ['entities', entities],
    ['claims', claims],
    ['relations', relations],
  ];
  if (statementRelations !== undefined) entries.push(['statementRelations', statementRelations]);
  const output = await writeJsonObjectEntries(outputPath, entries, { onProgress });
  return {
    ...output,
    ...validation,
  };
}
