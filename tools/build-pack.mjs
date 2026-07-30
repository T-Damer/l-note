#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';

import { KnowledgePackSchema } from '../src/pack-schema.js';

function usage() {
  console.error('Usage: node tools/build-pack.mjs <source.json> <output.json>');
  process.exitCode = 2;
}

const [, , inputArg, outputArg] = process.argv;
if (!inputArg || !outputArg) {
  usage();
} else {
  const inputPath = resolve(inputArg);
  const outputPath = resolve(outputArg);
  const raw = JSON.parse(await readFile(inputPath, 'utf8'));
  const candidate = {
    format: 'l-note-pack',
    schemaVersion: 1,
    createdAt: raw.createdAt ?? new Date().toISOString(),
    ...raw
  };
  const parsed = KnowledgePackSchema.parse(candidate);
  const normalized = {
    ...parsed,
    tags: [...parsed.tags].sort((left, right) => left.localeCompare(right, parsed.language)),
    records: [...parsed.records].sort((left, right) =>
      [left.documentId, left.section ?? '', left.id]
        .join('\u0000')
        .localeCompare([right.documentId, right.section ?? '', right.id].join('\u0000'), parsed.language)
    ),
    entities: [...parsed.entities].sort((left, right) => left.id.localeCompare(right.id)),
    relations: [...parsed.relations].sort((left, right) => left.id.localeCompare(right.id))
  };
  const bytes = Buffer.from(`${JSON.stringify(normalized, null, 2)}\n`, 'utf8');
  const sha256 = createHash('sha256').update(bytes).digest('hex');
  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, bytes);
  await writeFile(`${outputPath}.sha256`, `${sha256}  ${outputPath.split('/').at(-1)}\n`, 'utf8');
  console.log(
    JSON.stringify(
      {
        output: outputPath,
        sha256,
        sizeBytes: bytes.byteLength,
        records: normalized.records.length,
        entities: normalized.entities.length,
        relations: normalized.relations.length
      },
      null,
      2
    )
  );
}
