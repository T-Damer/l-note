#!/usr/bin/env node
import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { validatePack } from '../src/packs.js';
import {
  buildPackFromPath,
  createOpenAiCompatibleProvider,
  createReplicateProvider,
} from './lib/pack-builder.mjs';

function toPath(value) {
  return value instanceof URL ? fileURLToPath(value) : String(value);
}

function argumentsFrom(argv) {
  const result = { aiProvider: 'none' };
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === '--help' || token === '-h') {
      result.help = true;
      continue;
    }
    if (!token.startsWith('--')) {
      result.input ??= token;
      continue;
    }
    const key = token.slice(2).replace(/-([a-z])/gu, (_, letter) => letter.toUpperCase());
    const value = argv[index + 1];
    if (!value || value.startsWith('--')) throw new Error(`Missing value for ${token}`);
    result[key] = value;
    index += 1;
  }
  return result;
}

async function readJson(filename, fallback) {
  try {
    return JSON.parse(await readFile(filename, 'utf8'));
  } catch (error) {
    if (error?.code === 'ENOENT' && fallback !== undefined) return fallback;
    throw new Error(`Unable to read ${filename}: ${error instanceof Error ? error.message : String(error)}`);
  }
}

export async function buildPack(inputRoot) {
  const root = resolve(toPath(inputRoot));
  const manifest = await readJson(join(root, 'manifest.json'));
  const documentRoot = join(root, 'documents');
  const documentNames = (await readdir(documentRoot, { withFileTypes: true }))
    .filter((entry) => entry.isFile() && entry.name.endsWith('.json'))
    .map((entry) => entry.name)
    .sort();
  if (documentNames.length === 0) throw new Error('The documents directory contains no .json documents.');
  const documents = await Promise.all(documentNames.map((name) => readJson(join(documentRoot, name))));
  const pack = {
    ...manifest,
    documents,
    entities: await readJson(join(root, 'entities.json'), []),
    claims: await readJson(join(root, 'claims.json'), []),
    relations: await readJson(join(root, 'relations.json'), []),
  };
  const validation = validatePack(pack);
  if (!validation.valid) throw new Error(`Pack validation failed:\n- ${validation.errors.join('\n- ')}`);
  return pack;
}

function usage() {
  return `L-Note pack builder

A. Compile normalized authoring JSON:
  node tools/build-pack.mjs --input examples/custom-pack --output dist/example.pack.json

B. Prepare Markdown, TXT, or JSON directly:
  node tools/build-pack.mjs ./my-data --id com.example.notes --title "My notes" --output dist/my.pack.json

Direct preparation options:
  --version 1.0.0
  --description "..."
  --language ru
  --source-url https://example.test/source
  --ai-provider none|openai|replicate
  --ai-model <model id>
  --openai-base-url http://127.0.0.1:11434/v1
  --replicate-input path/to/input-overrides.json

OpenAI-compatible mode works with local Ollama, LM Studio, vLLM, or another /v1/chat/completions server.
Replicate reads REPLICATE_API_TOKEN or REPLICATE_API from the environment.`;
}

async function buildFromRawSources(args) {
  let provider = null;
  if (args.aiProvider === 'openai') {
    provider = createOpenAiCompatibleProvider({ baseUrl: args.openaiBaseUrl, apiKey: process.env.OPENAI_API_KEY, model: args.aiModel });
  } else if (args.aiProvider === 'replicate') {
    const input = args.replicateInput ? JSON.parse(await readFile(args.replicateInput, 'utf8')) : {};
    provider = createReplicateProvider({ model: args.aiModel, input });
  } else if (args.aiProvider !== 'none') {
    throw new Error(`Unknown AI provider: ${args.aiProvider}`);
  }

  return buildPackFromPath({
    inputPath: args.input,
    id: args.id,
    version: args.version ?? '1.0.0',
    title: args.title ?? args.id,
    description: args.description ?? 'Пользовательский пакет знаний',
    language: args.language ?? 'ru',
    sourceUrl: args.sourceUrl ?? null,
    aiProvider: provider,
    onProgress: (progress) => {
      if (progress.stage !== 'ai') return;
      process.stderr.write(`\rAI enrichment: ${progress.completed}/${progress.total} · ${progress.document ?? ''} ${progress.section ?? ''}`.trimEnd());
    },
  }).finally(() => {
    if (provider) process.stderr.write('\n');
  });
}

async function main() {
  const args = argumentsFrom(process.argv.slice(2));
  if (args.help) {
    console.log(usage());
    return;
  }
  if (!args.input || !args.output) throw new Error(`${usage()}\n\n--input and --output are required.`);
  const pack = args.id ? await buildFromRawSources(args) : await buildPack(args.input);
  const output = resolve(args.output);
  await mkdir(dirname(output), { recursive: true });
  const serialized = `${JSON.stringify(pack, null, 2)}\n`;
  await writeFile(output, serialized);
  console.log(`Built ${output}`);
  console.log(`${pack.documents.length} documents, ${pack.entities.length} entities, ${pack.claims.length} claims, ${Buffer.byteLength(serialized)} bytes`);
}

const isEntrypoint = process.argv[1] && import.meta.url === new URL(`file://${resolve(process.argv[1])}`).href;
if (isEntrypoint) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
