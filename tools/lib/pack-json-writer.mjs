import { mkdir, open, rename, rm } from 'node:fs/promises';
import path from 'node:path';

const JSON_ARRAY_STREAM = Symbol('lnote.json-array-stream');

function serializedJson(value) {
  const output = JSON.stringify(value, null, 2);
  if (output === undefined) throw new TypeError('Pack values must be JSON serializable.');
  return output;
}

function indentedJson(value, indentation) {
  const prefix = ' '.repeat(indentation);
  return serializedJson(value)
    .split('\n')
    .map((line) => `${prefix}${line}`)
    .join('\n');
}

function outputPaths(filename) {
  const finalPath = path.resolve(filename);
  const directory = path.dirname(finalPath);
  const basename = path.basename(finalPath);
  return {
    directory,
    finalPath,
    partialPath: path.join(directory, `.${basename}.${process.pid}.partial`),
  };
}

async function writeChunk(file, value, state) {
  const text = String(value);
  await file.write(text);
  state.bytes += Buffer.byteLength(text);
}

function arrayDescriptor(value) {
  if (Array.isArray(value)) return { values: value, total: value.length };
  if (value?.[JSON_ARRAY_STREAM]) return value;
  return null;
}

async function writeArray(file, key, descriptor, state, isLast, onProgress) {
  await writeChunk(file, `  ${JSON.stringify(key)}: [\n`, state);
  let index = 0;
  for await (const value of descriptor.values) {
    if (index) await writeChunk(file, ',\n', state);
    await writeChunk(file, indentedJson(value, 4), state);
    onProgress({ stage: 'item', key, index, total: descriptor.total });
    index += 1;
  }
  await writeChunk(file, `\n  ]${isLast ? '' : ','}\n`, state);
}

async function writeProperty(file, key, value, state, isLast) {
  const serialized = serializedJson(value).split('\n');
  const [first, ...rest] = serialized;
  await writeChunk(file, `  ${JSON.stringify(key)}: ${first}`, state);
  for (const line of rest) await writeChunk(file, `\n  ${line}`, state);
  await writeChunk(file, `${isLast ? '' : ','}\n`, state);
}

export function jsonArrayStream(values, { total = null } = {}) {
  if (!values || (!values[Symbol.iterator] && !values[Symbol.asyncIterator])) {
    throw new TypeError('jsonArrayStream requires an iterable or async iterable.');
  }
  return Object.freeze({
    [JSON_ARRAY_STREAM]: true,
    values,
    total: Number.isInteger(total) && total >= 0 ? total : null,
  });
}

export async function writeJsonObjectEntries(
  filename,
  entries,
  { onProgress = () => {} } = {},
) {
  const normalizedEntries = [...entries];
  const paths = outputPaths(filename);
  await mkdir(paths.directory, { recursive: true });
  let file;
  const state = { bytes: 0 };
  try {
    file = await open(paths.partialPath, 'wx');
    await writeChunk(file, '{\n', state);
    for (const [index, [key, value]] of normalizedEntries.entries()) {
      const isLast = index === normalizedEntries.length - 1;
      const descriptor = arrayDescriptor(value);
      if (descriptor) await writeArray(file, key, descriptor, state, isLast, onProgress);
      else await writeProperty(file, key, value, state, isLast);
    }
    await writeChunk(file, '}\n', state);
    await file.sync();
    await file.close();
    file = null;
    await rename(paths.partialPath, paths.finalPath);
    onProgress({ stage: 'published', filename: paths.finalPath, bytes: state.bytes });
    return { filename: paths.finalPath, bytes: state.bytes };
  } catch (error) {
    await file?.close().catch(() => {});
    await rm(paths.partialPath, { force: true });
    throw error;
  }
}

export async function writePackJson(filename, pack, options = {}) {
  if (!pack || typeof pack !== 'object' || Array.isArray(pack)) {
    throw new TypeError('A pack object is required.');
  }
  return writeJsonObjectEntries(filename, Object.entries(pack), options);
}
