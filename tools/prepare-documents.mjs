#!/usr/bin/env node
import { resolve } from 'node:path';

import { prepareDocumentDirectory } from './lib/document-extraction.mjs';

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

Usage:
  node tools/prepare-documents.mjs ./sources \\
    --output ./prepared/my-pack \\
    --id com.example.documents \\
    --title "My documents"

Options:
  --version 1.0.0
  --description "..."
  --language ru
  --ocr                         OCR PDF pages without a text layer
  --ocr-language rus+eng        Tesseract language set
  --max-section-chars 5000

Required local tools:
  PDF text: pdftotext
  DOCX text: unzip
  PDF OCR: pdftoppm and tesseract

The output is a normalized authoring directory. Build the final pack next:
  node tools/build-pack.mjs --input ./prepared/my-pack --output ./prepared/my-pack/pack.json`;
}

export async function prepareFromArguments(args, dependencies = {}) {
  if (!args.input || !args.output || !args.id) {
    throw new Error(`${usage()}\n\ninput, --output and --id are required.`);
  }
  return prepareDocumentDirectory({
    inputPath: args.input,
    outputPath: args.output,
    id: args.id,
    version: args.version ?? '1.0.0',
    title: args.title ?? args.id,
    description: args.description ?? 'Пакет, подготовленный из PDF/DOCX',
    language: args.language ?? 'ru',
    ocr: Boolean(args.ocr),
    ocrLanguage: args.ocrLanguage ?? 'rus+eng',
    maxSectionChars: Number(args.maxSectionChars ?? 5000),
    runner: dependencies.runner,
    generatedAt: dependencies.generatedAt,
    onProgress: dependencies.onProgress ?? ((progress) => {
      if (progress.stage === 'extract') {
        process.stderr.write(`\rИзвлечение ${progress.index + 1}/${progress.total}: ${progress.file}`);
      }
    }),
  });
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
  console.log(`${result.files} files, ${result.sections} sections`);
  for (const warning of result.warnings) console.warn(`Warning: ${warning}`);
}

const isEntrypoint = process.argv[1] && import.meta.url === new URL(`file://${resolve(process.argv[1])}`).href;
if (isEntrypoint) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
