import { createHash } from 'node:crypto';
import { mkdir, readdir, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { slugify, stableId } from './pack-builder.mjs';

export const SQLITE_ADAPTER_SCHEMA_VERSION = 1;
export const DEFAULT_DATABASE_BATCH_SIZE = 500;
export const DEFAULT_MAX_DATABASE_ROWS = 50_000;
export const DEFAULT_MAX_CELL_CHARS = 100_000;
export const DEFAULT_MAX_SECTION_CHARS = 5_000;

export function quoteIdentifier(value) {
  const identifier = String(value ?? '');
  if (!identifier) throw new TypeError('SQLite identifier must be non-empty.');
  return `"${identifier.replaceAll('"', '""')}"`;
}

export function jsonSafe(value) {
  if (typeof value === 'bigint') return value.toString();
  if (value instanceof Uint8Array) return {
    type: 'blob',
    bytes: value.byteLength,
    sha256: createHash('sha256').update(value).digest('hex'),
  };
  if (Array.isArray(value)) return value.map(jsonSafe);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, jsonSafe(item)]));
  }
  return value;
}

export function stringifyJson(value) {
  return JSON.stringify(jsonSafe(value));
}

export function formatCell(value, { maxChars = DEFAULT_MAX_CELL_CHARS } = {}) {
  if (value === null) return { text: '(null)', truncated: false };
  if (value instanceof Uint8Array) {
    const digest = createHash('sha256').update(value).digest('hex');
    return { text: `<BLOB ${value.byteLength} bytes sha256:${digest}>`, truncated: false };
  }
  const text = typeof value === 'bigint' ? value.toString() : String(value);
  if (text.length <= maxChars) return { text, truncated: false };
  return {
    text: `${text.slice(0, Math.max(0, maxChars - 1)).trimEnd()}…`,
    truncated: true,
  };
}

export function splitSection({ id, title, text, maxChars, metadata = {} }) {
  if (text.length <= maxChars) return [{ id, title, text, entityIds: [], tags: [], ...metadata }];
  const chunks = [];
  const paragraphs = text.split(/\n{2,}/gu).filter(Boolean);
  let current = '';
  const flush = () => {
    if (!current) return;
    chunks.push(current);
    current = '';
  };
  for (const paragraph of paragraphs) {
    if (current && current.length + paragraph.length + 2 > maxChars) flush();
    if (paragraph.length > maxChars) {
      flush();
      for (let offset = 0; offset < paragraph.length; offset += maxChars) {
        chunks.push(paragraph.slice(offset, offset + maxChars));
      }
    } else {
      current = current ? `${current}\n\n${paragraph}` : paragraph;
    }
  }
  flush();
  return chunks.map((chunk, index) => ({
    id: `${id}-part-${index + 1}`,
    title: `${title} · часть ${index + 1}`,
    text: chunk,
    entityIds: [],
    tags: [],
    ...metadata,
  }));
}

export function rowStableId(table, identity, rowNumber) {
  const serialized = Object.keys(identity).length
    ? stringifyJson(identity)
    : String(rowNumber);
  return stableId(`row.${slugify(table)}`, serialized);
}

export async function assertEmptyOutputDirectory(outputPath) {
  const absolute = path.resolve(outputPath);
  try {
    const info = await stat(absolute);
    if (!info.isDirectory()) throw new Error(`${absolute} exists and is not a directory.`);
    if ((await readdir(absolute)).length) throw new Error(`${absolute} must be empty.`);
  } catch (error) {
    if (error?.code !== 'ENOENT') throw error;
  }
  await mkdir(absolute, { recursive: true });
  return absolute;
}

export async function writeJson(filename, value) {
  await mkdir(path.dirname(filename), { recursive: true });
  await writeFile(filename, `${JSON.stringify(jsonSafe(value), null, 2)}\n`);
  return filename;
}
