import { mkdir, open, rename, rm } from 'node:fs/promises';
import path from 'node:path';

import { slugify } from './pack-builder.mjs';
import { jsonSafe } from './sqlite-adapter-common.mjs';

function indentedJson(value, indentation) {
  const prefix = ' '.repeat(indentation);
  return JSON.stringify(jsonSafe(value), null, 2)
    .split('\n')
    .map((line) => `${prefix}${line}`)
    .join('\n');
}

function propertyChunk(key, value, { comma = true } = {}) {
  const serialized = JSON.stringify(jsonSafe(value), null, 2).split('\n');
  const [first, ...rest] = serialized;
  const lines = [`  ${JSON.stringify(key)}: ${first}`];
  lines.push(...rest.map((line) => `  ${line}`));
  return `${lines.join('\n')}${comma ? ',' : ''}\n`;
}

function documentPaths(outputRoot, documentId) {
  const basename = `${slugify(documentId)}.json`;
  const directory = path.join(outputRoot, 'documents');
  return {
    directory,
    finalPath: path.join(directory, basename),
    partialPath: path.join(directory, `.${basename}.partial`),
  };
}

export async function writeSqliteDocument(outputRoot, operation) {
  if (!operation?.document || !operation?.sections || typeof operation.finalize !== 'function') {
    throw new TypeError('A streaming SQLite import operation is required.');
  }
  const paths = documentPaths(outputRoot, operation.document.id);
  await mkdir(paths.directory, { recursive: true });
  let file;
  try {
    file = await open(paths.partialPath, 'wx');
    await file.write('{\n');
    for (const [key, value] of Object.entries(operation.document)) {
      await file.write(propertyChunk(key, value));
    }
    await file.write('  "sections": [\n');
    let firstSection = true;
    for (const section of operation.sections) {
      if (!firstSection) await file.write(',\n');
      await file.write(indentedJson(section, 4));
      firstSection = false;
    }
    const result = operation.finalize();
    await file.write('\n  ]');
    if (result.extractionWarnings.length) {
      await file.write(',\n');
      await file.write(propertyChunk(
        'extractionWarnings',
        result.extractionWarnings,
        { comma: false },
      ));
      await file.write('}\n');
    } else {
      await file.write('\n}\n');
    }
    await file.sync();
    await file.close();
    file = null;
    await rename(paths.partialPath, paths.finalPath);
    return {
      ...result,
      filename: paths.finalPath,
    };
  } catch (error) {
    await file?.close().catch(() => {});
    await rm(paths.partialPath, { force: true });
    throw error;
  }
}
