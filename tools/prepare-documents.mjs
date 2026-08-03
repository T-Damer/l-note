#!/usr/bin/env node
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';

import { prepareDocumentDirectory } from './lib/document-extraction.mjs';
import { renderOcrReviewHtml } from './lib/ocr-review-html.mjs';

export function argumentsFrom(argv) {
  const output = { ocr: false };
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === '--help' || token === '-h') {
      output.help = true;
      continue;
    }
    if (token === '--ocr') {
      output.ocr = true;
      continue;
    }
    if (!token.startsWith('--')) {
      output.input ??= token;
      continue;
    }
    const key = token.slice(2).replace(/-([a-z])/gu, (_, letter) => letter.toUpperCase());
    const value = argv[index + 1];
    if (!value || value.startsWith('--')) throw new Error(`Missing value for ${token}`);
    output[key] = value;
    index += 1;
  }
  return output;
}

function usage() {
  return `L-Note PDF/DOCX preparer

First OCR pass:
  node tools/prepare-documents.mjs ./sources \\
    --output ./prepared/pending \\
    --id com.example.documents \\
    --title "My documents" \\
    --ocr

Open ./prepared/pending/ocr-review.html, review every OCR page and download JSON.
Then prepare the reviewed source directory:
  node tools/prepare-documents.mjs ./sources \\
    --output ./prepared/reviewed \\
    --id com.example.documents \\
    --title "My documents" \\
    --ocr \\
    --ocr-review-in ./downloads/com.example.documents.ocr-review.json

Options:
  --version 1.0.0
  --description "..."
  --language ru
  --ocr                         OCR PDF pages without a text layer
  --ocr-language rus+eng        Tesseract language set
  --ocr-review-in review.json   apply accept/dismiss decisions
  --ocr-review-out review.json  default: <output>/ocr-review.json
  --ocr-review-html review.html default: <output>/ocr-review.html
  --max-section-chars 5000

Required local tools:
  PDF text: pdftotext
  DOCX text: unzip
  PDF OCR: pdftoppm and tesseract

A directory with pending OCR review cannot be compiled by build-pack.mjs.`;
}

async function readOcrReview(filename) {
  if (!filename) return null;
  return JSON.parse(await readFile(resolve(filename), 'utf8'));
}

async function writeOcrReviewArtifacts(result, args) {
  if (!result.ocrReview) return null;
  const outputRoot = resolve(result.outputPath);
  const jsonTarget = resolve(args.ocrReviewOut ?? join(outputRoot, 'ocr-review.json'));
  const htmlTarget = resolve(args.ocrReviewHtml ?? join(outputRoot, 'ocr-review.html'));
  if (dirname(htmlTarget) !== outputRoot) {
    throw new Error('--ocr-review-html must be written directly inside --output so relative PDF assets remain available.');
  }
  await Promise.all([
    mkdir(dirname(jsonTarget), { recursive: true }),
    mkdir(dirname(htmlTarget), { recursive: true }),
  ]);
  await Promise.all([
    writeFile(jsonTarget, `${JSON.stringify(result.ocrReview, null, 2)}\n`),
    writeFile(htmlTarget, renderOcrReviewHtml(result.ocrReview)),
  ]);
  return { jsonTarget, htmlTarget };
}

export async function prepareFromArguments(args, dependencies = {}) {
  if (!args.input || !args.output || !args.id) {
    throw new Error(`${usage()}\n\ninput, --output and --id are required.`);
  }
  const result = await prepareDocumentDirectory({
    inputPath: args.input,
    outputPath: args.output,
    id: args.id,
    version: args.version ?? '1.0.0',
    title: args.title ?? args.id,
    description: args.description ?? 'Пакет, подготовленный из PDF/DOCX',
    language: args.language ?? 'ru',
    ocr: Boolean(args.ocr),
    ocrLanguage: args.ocrLanguage ?? 'rus+eng',
    ocrReview: await readOcrReview(args.ocrReviewIn),
    maxSectionChars: Number(args.maxSectionChars ?? 5000),
    runner: dependencies.runner,
    generatedAt: dependencies.generatedAt,
    onProgress: dependencies.onProgress ?? ((progress) => {
      if (progress.stage === 'extract') {
        process.stderr.write(`\rИзвлечение ${progress.index + 1}/${progress.total}: ${progress.file}`);
      }
    }),
  });
  return {
    ...result,
    ocrReviewArtifacts: await writeOcrReviewArtifacts(result, args),
  };
}

async function main() {
  const args = argumentsFrom(process.argv.slice(2));
  if (args.help) {
    console.log(usage());
    return;
  }
  const result = await prepareFromArguments(args);
  process.stderr.write('\n');
  console.log(`Prepared ${resolve(result.outputPath)}`);
  console.log(`${result.files} files, ${result.documents} documents, ${result.sections} sections`);
  if (result.ocrReviewArtifacts) {
    console.log(`OCR review JSON: ${result.ocrReviewArtifacts.jsonTarget}`);
    console.log(`OCR review page: ${result.ocrReviewArtifacts.htmlTarget}`);
    if (!result.ocrReviewState.complete) {
      console.log(`OCR review pending: ${result.ocrReviewState.pending} page(s).`);
    }
  }
  for (const warning of result.warnings) console.warn(`Warning: ${warning}`);
}

const isEntrypoint = process.argv[1] && import.meta.url === new URL(`file://${resolve(process.argv[1])}`).href;
if (isEntrypoint) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
