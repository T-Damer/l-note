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
  mergeAiSection,
} from './lib/pack-builder.mjs';
import { writePackJson } from './lib/pack-json-writer.mjs';
import { assertPreparationReviewsComplete } from './lib/preparation-review-guard.mjs';
import { collectSemanticReview } from './lib/semantic-proposal-collector.mjs';
import { renderSemanticReviewHtml } from './lib/semantic-review-html.mjs';
import { applySemanticReview } from './lib/semantic-review.mjs';

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
  assertPreparationReviewsComplete(manifest);
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

Optional LLM proposal collection:
  --ai-provider none|openai|replicate
  --ai-model <model id>
  --openai-base-url http://127.0.0.1:11434/v1
  --replicate-input path/to/input-overrides.json
  --semantic-review-out review.json         defaults to <output>.semantic-review.json
  --semantic-review-html review.html        interactive offline review page
  --semantic-review-in reviewed.json        apply only eligible entries marked decision=accept

Reviewed discrepancy workflow:
  --compare-pack path/to/existing.pack.json   repeat for several packs
  --discrepancy-review-out review.json        write possible statement differences
  --discrepancy-review-html review.html       write an interactive offline review page
  --discrepancy-review-in reviewed.json       apply only entries marked decision=accept
  --reviewed-by "Reviewer name"

LLM output is never merged during proposal collection. Review the generated file and run the builder again with --semantic-review-in. Source discrepancies follow the same two-step rule.`;
}

function createProvider(args) {
  if (args.aiProvider === 'none') return null;
  if (args.aiProvider === 'openai') {
    return createOpenAiCompatibleProvider({
      baseUrl: args.openaiBaseUrl,
      apiKey: process.env.OPENAI_API_KEY,
      model: args.aiModel,
    });
  }
  if (args.aiProvider === 'replicate') {
    return readJson(args.replicateInput, {}).then((input) => createReplicateProvider({
      model: args.aiModel,
      input,
    }));
  }
  throw new Error(`Unknown AI provider: ${args.aiProvider}`);
}

async function buildFromRawSources(args) {
  const provider = await createProvider(args);
  const pack = await buildPackFromPath({
    inputPath: args.input,
    id: args.id,
    version: args.version ?? '1.0.0',
    title: args.title ?? args.id,
    description: args.description ?? 'Пользовательский пакет знаний',
    language: args.language ?? 'ru',
    sourceUrl: args.sourceUrl ?? null,
  });
  if (!provider) return { pack, semanticReview: null };
  try {
    const semanticReview = await collectSemanticReview({
      pack,
      provider,
      onProgress(progress) {
        process.stderr.write(`\rПредложения ${progress.completed}/${progress.total} · ${progress.document ?? ''} ${progress.section ?? ''}`.trimEnd());
      },
    });
    return { pack, semanticReview };
  } finally {
    process.stderr.write('\n');
  }
}

export async function applyReviewOptions(pack, args) {
  let output = pack;
  if (args.semanticReviewIn) {
    const review = await readJson(resolve(args.semanticReviewIn));
    output = applySemanticReview(output, review, {
      mergeSection: mergeAiSection,
      reviewedBy: args.reviewedBy ?? 'local-reviewer',
    });
  }
  if (args.discrepancyReviewIn) {
    const review = await readJson(resolve(args.discrepancyReviewIn));
    output = applyDiscrepancyReview(output, review, {
      reviewedBy: args.reviewedBy ?? 'local-reviewer',
    });
  }
  return assertValidPack(output, 'Reviewed pack');
}

async function writeSemanticReview(review, args) {
  if (!review) return null;
  const jsonTarget = args.semanticReviewOut ?? `${args.output}.semantic-review.json`;
  const jsonFilename = await writeJson(jsonTarget, review);
  const htmlFilename = args.semanticReviewHtml
    ? await writeText(args.semanticReviewHtml, renderSemanticReviewHtml(review))
    : null;
  return { jsonFilename, htmlFilename, review };
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
  const prepared = args.id
    ? await buildFromRawSources(args)
    : { pack: await buildPack(args.input), semanticReview: null };
  const pack = await applyReviewOptions(prepared.pack, args);
  const output = await writePackJson(args.output, pack);
  const semanticResult = await writeSemanticReview(prepared.semanticReview, args);
  const discrepancyResult = await writeDiscrepancyReview(pack, args);
  console.log(`Built ${output.filename}`);
  console.log(`${pack.documents.length} documents, ${pack.entities.length} entities, ${pack.claims.length} claims, ${output.bytes} bytes`);
  if (semanticResult) {
    console.log(`Semantic proposals: ${semanticResult.review.candidates.length}`);
    console.log(`Semantic review JSON: ${semanticResult.jsonFilename}`);
    if (semanticResult.htmlFilename) console.log(`Semantic review page: ${semanticResult.htmlFilename}`);
  }
  if (discrepancyResult) {
    console.log(`Possible differences: ${discrepancyResult.review.candidates.length}`);
    if (discrepancyResult.jsonFilename) console.log(`Review JSON: ${discrepancyResult.jsonFilename}`);
    if (discrepancyResult.htmlFilename) console.log(`Review page: ${discrepancyResult.htmlFilename}`);
  }
}

const isEntrypoint = process.argv[1] && import.meta.url === new URL(`file://${resolve(process.argv[1])}`).href;
if (isEntrypoint) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
