#!/usr/bin/env node
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';

import {
  exportPackFile,
  restorePackFile,
} from './lib/sqlite-pack-export.mjs';
import {
  inspectSqliteDatabase,
  prepareSqliteDirectory,
} from './lib/sqlite-source-import.mjs';

const REPEATABLE_OPTIONS = new Set(['table']);

export function argumentsFrom(argv) {
  const output = { table: [] };
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === '--help' || token === '-h') {
      output.help = true;
      continue;
    }
    if (!output.command && !token.startsWith('--')) {
      output.command = token;
      continue;
    }
    if (!token.startsWith('--')) throw new Error(`Unexpected argument: ${token}`);
    const key = token.slice(2).replace(/-([a-z])/gu, (_, letter) => letter.toUpperCase());
    const value = argv[index + 1];
    if (!value || value.startsWith('--')) throw new Error(`Missing value for ${token}`);
    if (REPEATABLE_OPTIONS.has(key)) output[key].push(value);
    else output[key] = value;
    index += 1;
  }
  return output;
}

function usage() {
  return `L-Note SQLite database adapter

Inspect a database:
  node tools/database-pack.mjs inspect --input ./data.sqlite

Prepare arbitrary tables/views as an authoring directory:
  node tools/database-pack.mjs import \\
    --input ./data.sqlite \\
    --output ./prepared/database \\
    --id com.example.database \\
    --title "Database reference"

Export a validated pack to relational SQLite:
  node tools/database-pack.mjs export \\
    --input ./dist/example.pack.json \\
    --output ./dist/example.pack.sqlite

Restore an exported pack exactly:
  node tools/database-pack.mjs restore \\
    --input ./dist/example.pack.sqlite \\
    --output ./dist/example.restored.pack.json

Import options:
  --table articles                  repeat to select several tables/views
  --mapping ./sqlite-mapping.json   optional column mapping
  --version 1.0.0
  --description "..."
  --language ru
  --max-rows 50000                 per selected table/view
  --max-cell-chars 100000
  --max-section-chars 5000

Mapping format:
  {
    "tables": {
      "articles": {
        "documentTitle": "Articles",
        "idColumns": ["id"],
        "titleColumn": "title",
        "textColumns": ["title", "body"],
        "tagColumns": ["category"]
      }
    }
  }

The import command writes manifest.json and documents/*.json. Run build-pack.mjs afterwards.`;
}

async function readMapping(filename) {
  if (!filename) return {};
  return JSON.parse(await readFile(resolve(filename), 'utf8'));
}

async function writeOutput(filename, value) {
  const output = resolve(filename);
  await mkdir(dirname(output), { recursive: true });
  await writeFile(output, `${JSON.stringify(value, null, 2)}\n`);
  return output;
}

function required(args, fields) {
  const missing = fields.filter((field) => !args[field]);
  if (missing.length) throw new Error(`${usage()}\n\nMissing: ${missing.map((field) => `--${field}`).join(', ')}`);
}

async function inspectCommand(args) {
  required(args, ['input']);
  const objects = inspectSqliteDatabase(args.input);
  if (args.output) {
    const output = await writeOutput(args.output, { input: resolve(args.input), objects });
    return { message: `Inspection written to ${output}`, objects };
  }
  return { message: JSON.stringify(objects, null, 2), objects };
}

async function importCommand(args, dependencies) {
  required(args, ['input', 'output', 'id']);
  const result = await prepareSqliteDirectory({
    inputPath: args.input,
    outputPath: args.output,
    id: args.id,
    version: args.version ?? '1.0.0',
    title: args.title ?? args.id,
    description: args.description ?? 'Пакет, подготовленный из SQLite',
    language: args.language ?? 'ru',
    tables: args.table,
    mapping: await readMapping(args.mapping),
    maxRowsPerTable: Number(args.maxRows ?? 50_000),
    maxCellChars: Number(args.maxCellChars ?? 100_000),
    maxSectionChars: Number(args.maxSectionChars ?? 5_000),
    generatedAt: dependencies.generatedAt,
    onProgress: dependencies.onProgress ?? ((progress) => {
      if (progress.stage === 'object') {
        process.stderr.write(`\rИмпорт ${progress.index + 1}/${progress.total}: ${progress.table}`);
      }
    }),
  });
  return {
    message: `Prepared ${result.outputPath}\n${result.documents} documents, ${result.sections} sections`,
    result,
  };
}

async function exportCommand(args, dependencies) {
  required(args, ['input', 'output']);
  const result = await exportPackFile({
    inputPath: args.input,
    outputPath: args.output,
    exportedAt: dependencies.generatedAt,
  });
  return {
    message: `Exported ${result.outputPath}\n${result.documents} documents, ${result.sections} sections, ${result.bytes} bytes`,
    result,
  };
}

async function restoreCommand(args) {
  required(args, ['input', 'output']);
  const result = await restorePackFile({ inputPath: args.input, outputPath: args.output });
  return {
    message: `Restored ${result.outputPath}\n${result.pack.documents.length} documents`,
    result,
  };
}

export async function runDatabaseCommand(args, dependencies = {}) {
  if (args.help || !args.command) return { message: usage(), help: true };
  if (args.command === 'inspect') return inspectCommand(args);
  if (args.command === 'import') return importCommand(args, dependencies);
  if (args.command === 'export') return exportCommand(args, dependencies);
  if (args.command === 'restore') return restoreCommand(args);
  throw new Error(`Unknown command: ${args.command}\n\n${usage()}`);
}

async function main() {
  const result = await runDatabaseCommand(argumentsFrom(process.argv.slice(2)));
  process.stderr.write('\n');
  console.log(result.message);
  for (const warning of result.result?.warnings ?? []) console.warn(`Warning: ${warning}`);
}

const isEntrypoint = process.argv[1] && import.meta.url === new URL(`file://${resolve(process.argv[1])}`).href;
if (isEntrypoint) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
