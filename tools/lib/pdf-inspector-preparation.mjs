import { readFile, readdir, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';

import {
  pdfInspectorMetadata,
  pdfInspectorPages,
  pdfInspectorWarnings,
} from '../../src/helpers/pdf-inspector-result.js';
import { runCommand } from './document-extraction.mjs';
import { inspectPdfFile } from './pdf-inspector-node.mjs';

function portablePath(value) {
  return String(value ?? '').split(path.sep).join('/');
}

async function inputRoot(inputPath) {
  const absolute = path.resolve(inputPath);
  return (await stat(absolute)).isDirectory() ? absolute : path.dirname(absolute);
}

function pdfFilename(args) {
  const explicit = args.find((value) => /\.pdf$/iu.test(String(value)));
  return explicit ?? args.at(-2) ?? null;
}

function pageStream(result) {
  const pages = pdfInspectorPages(result);
  return `${pages.map((page) => (page.needsOcr ? '' : page.markdown)).join('\f')}\f`;
}

export async function createPdfInspectorPreparationRunner({
  inputPath,
  baseRunner = runCommand,
  inspector = inspectPdfFile,
} = {}) {
  const root = await inputRoot(inputPath);
  const inspections = new Map();
  const runner = async (command, args, options) => {
    if (command !== 'pdftotext') return baseRunner(command, args, options);
    const filename = pdfFilename(args);
    if (!filename) throw new Error('Unable to identify the PDF passed to the extraction runner.');
    const result = await inspector(filename);
    const relative = portablePath(path.relative(root, path.resolve(filename)));
    inspections.set(relative, result);
    return { stdout: Buffer.from(pageStream(result), 'utf8'), stderr: '' };
  };
  return { runner, inspections };
}

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

export async function decoratePreparedPdfDocuments(outputPath, inspections) {
  if (!inspections?.size) return 0;
  const documentsRoot = path.join(path.resolve(outputPath), 'documents');
  const files = (await readdir(documentsRoot)).filter((name) => name.endsWith('.json')).sort();
  let changed = 0;
  for (const name of files) {
    const filename = path.join(documentsRoot, name);
    const document = JSON.parse(await readFile(filename, 'utf8'));
    if (document.source?.mimeType !== 'application/pdf') continue;
    const result = inspections.get(portablePath(document.source.title));
    if (!result) continue;
    const usesOcr = String(document.source.extractor ?? '').includes('tesseract');
    document.source.extractor = usesOcr
      ? '@firecrawl/pdf-inspector-wasm+tesseract-tsv'
      : '@firecrawl/pdf-inspector-wasm';
    document.source.inspection = pdfInspectorMetadata(result);
    document.extractionWarnings = unique([
      ...(document.extractionWarnings ?? []),
      ...pdfInspectorWarnings(result),
    ]);
    if (!document.extractionWarnings.length) delete document.extractionWarnings;
    await writeFile(filename, `${JSON.stringify(document, null, 2)}\n`);
    changed += 1;
  }
  return changed;
}
