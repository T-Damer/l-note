#!/usr/bin/env node
import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { validatePack } from '../src/packs.js';
import {
  applyDiscrepancyReview,
  createDiscrepancyReview,
} from './lib/discrepancy-review.mjs';
import { renderDiscrepancyReviewHtml } from './lib/discrepancy-review-html.mjs';
import {
  buildPackFromPath,
  createOpenAiCompatibleProvider,
  createReplicateProvider,
} from './lib/pack-builder.mjs';

const REPEATABLE_OPTIONS = new Set(['comparePack']);

function toPath(value) {
  return value instanceof URL ? fileURLToPath(value) : String(value);
}

export function argumentsFrom(argv) {
  const result = { aiProvider: 'none', comparePack: [] };
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
    if (REPEATABLE_OPTIONS.has(key)) result[key].push(value);
    else result[key] = value;
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

async function readOptionalJson(filename) {
  try {
    return JSON.parse(await readFile(filename, 'utf8'));
  } catch (error) {
    if (error?.code === 'ENOENT') return undefined;
    throw new Error(`Unable to read ${filename}: ${error instanceof Error ? error.message : String(error)}`);
  }
}

function assertValidPack(pack, label = 'Pack') {
  const validation = validatePack(pack);
  if (!validation.valid) throw new Error(`${label} validation failed:\n- ${validation.errors.join('\n- ')}`);
  return pack;
}

async function readPackFile(filename) {
  return assertValidPack(await readJson(resolve(filename)), `Comparison pack ${filename}`);
}

async function writeText(filename, value) {
  const output = resolve(filename);
  await mkdir(dirname(output), { recursive: true });
  await writeFile(output, value);
  return output;
}

async function writeJson(filename, value) {
  return writeText(filename, `${JSON.stringify(value, null, 2)}\n`);
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
  const statementRelations = await readOptionalJson(join(root, 'statement-relations.json'));
  const pack = {
    ...manifest,
    documents,
    entities: await readJson(join(root, 'entities.json'), []),
    claims: await readJson(join(root, 'claims.json'), []),
    relations: await readJson(join(root, 'relations.json'), []),
  };
  if (statementRelations !== undefined) pack.statementRelations = statementRelations;
  return assertValidPack(pack);
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

Reviewed discrepancy workflow:
  --compare-pack path/to/existing.pack.json   repeat for several packs
  --discrepancy-review-out review.json        write possible statement differences
  --discrepancy-review-html review.html       write an interactive offline review page
  --discrepancy-review-in reviewed.json       apply only entries marked decision=accept
  --reviewed-by "Reviewer name"

The comparison step never changes the pack by itself. Review candidates in JSON or the generated HTML page, download the result, then run the builder again with --discrepancy-review-in.`;
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

export async function applyReviewOptions(pack, args) {
  let output = pack;
  if (args.discrepancyReviewIn) {
    const review = await readJson(resolve(args.discrepancyReviewIn));
    output = applyDiscrepancyReview(output, review, {
      reviewedBy: args.reviewedBy ?? 'local-reviewer',
    });
  }
  return assertValidPack(output, 'Reviewed pack');
}

async function writeDiscrepancyReview(pack, args) {
  if (!args.discrepancyReviewOut && !args.discrepancyReviewHtml) return null;
  const referencePacks = await Promise.all((args.comparePack ?? []).map(readPackFile));
  const review = createDiscrepancyReview({ pack, referencePacks });
  const jsonFilename = args.discrepancyReviewOut
    ? await writeJson(args.discrepancyReviewOut, review)
    : null;
  const htmlFilename = args.discrepancyReviewHtml
    ? await writeText(args.discrepancyReviewHtml, renderDiscrepancyReviewHtml(review))
    : null;
  return { jsonFilename, htmlFilename, review };
}

async function main() {
  const args = argumentsFrom(process.argv.slice(2));
  if (args.help) {
    console.log(usage());
    return;
  }
  if (!args.input || !args.output) throw new Error(`${usage()}\n\n--input and --output are required.`);
  const built = args.id ? await buildFromRawSources(args) : await buildPack(args.input);
  const pack = await applyReviewOptions(built, args);
  const output = await writeJson(args.output, pack);
  const reviewResult = await writeDiscrepancyReview(pack, args);
  const serializedBytes = Buffer.byteLength(`${JSON.stringify(pack, null, 2)}\n`);
  console.log(`Built ${output}`);
  console.log(`${pack.documents.length} documents, ${pack.entities.length} entities, ${pack.claims.length} claims, ${serializedBytes} bytes`);
  if (reviewResult) {
    console.log(`Possible differences: ${reviewResult.review.candidates.length}`);
    if (reviewResult.jsonFilename) console.log(`Review JSON: ${reviewResult.jsonFilename}`);
    if (reviewResult.htmlFilename) console.log(`Review page: ${reviewResult.htmlFilename}`);
  }
}

const isEntrypoint = process.argv[1] && import.meta.url === new URL(`file://${resolve(process.argv[1])}`).href;
if (isEntrypoint) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
