import { mkdir, open, rename, rm } from 'node:fs/promises';
import path from 'node:path';

function indentedJson(value, indentation) {
  const prefix = ' '.repeat(indentation);
  return JSON.stringify(value, null, 2)
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

async function writeArray(file, key, values, state, isLast) {
  await writeChunk(file, `  ${JSON.stringify(key)}: [\n`, state);
  for (const [index, value] of values.entries()) {
    if (index) await writeChunk(file, ',\n', state);
    await writeChunk(file, indentedJson(value, 4), state);
  }
  await writeChunk(file, `\n  ]${isLast ? '' : ','}\n`, state);
}

async function writeProperty(file, key, value, state, isLast) {
  const serialized = JSON.stringify(value, null, 2).split('\n');
  const [first, ...rest] = serialized;
  await writeChunk(file, `  ${JSON.stringify(key)}: ${first}`, state);
  for (const line of rest) await writeChunk(file, `\n  ${line}`, state);
  await writeChunk(file, `${isLast ? '' : ','}\n`, state);
}

export async function writePackJson(filename, pack) {
  if (!pack || typeof pack !== 'object' || Array.isArray(pack)) {
    throw new TypeError('A pack object is required.');
  }
  const paths = outputPaths(filename);
  await mkdir(paths.directory, { recursive: true });
  let file;
  const state = { bytes: 0 };
  try {
    file = await open(paths.partialPath, 'wx');
    await writeChunk(file, '{\n', state);
    const entries = Object.entries(pack);
    for (const [index, [key, value]] of entries.entries()) {
      const isLast = index === entries.length - 1;
      if (Array.isArray(value)) await writeArray(file, key, value, state, isLast);
      else await writeProperty(file, key, value, state, isLast);
    }
    await writeChunk(file, '}\n', state);
    await file.sync();
    await file.close();
    file = null;
    await rename(paths.partialPath, paths.finalPath);
    return { filename: paths.finalPath, bytes: state.bytes };
  } catch (error) {
    await file?.close().catch(() => {});
    await rm(paths.partialPath, { force: true });
    throw error;
  }
}
