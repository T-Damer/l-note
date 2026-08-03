import { spawn } from 'node:child_process';
import { copyFile, mkdir, mkdtemp, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { slugify, stableId } from './pack-builder.mjs';

const SUPPORTED_DOCUMENT_EXTENSIONS = new Set(['.pdf', '.docx']);
const DEFAULT_MAX_SECTION_CHARS = 5000;
const DEFAULT_MAX_COMMAND_BYTES = 128 * 1024 * 1024;

function cleanText(value) {
  return String(value ?? '')
    .replace(/\r\n?/gu, '\n')
    .replace(/[ \t]+\n/gu, '\n')
    .replace(/\n{3,}/gu, '\n\n')
    .trim();
}

function titleFromFilename(filename) {
  return path.basename(filename, path.extname(filename)).replace(/[-_]+/gu, ' ').trim() || 'Документ';
}

function decodeXmlEntities(value) {
  return String(value ?? '')
    .replaceAll('&lt;', '<')
    .replaceAll('&gt;', '>')
    .replaceAll('&quot;', '"')
    .replaceAll('&apos;', "'")
    .replaceAll('&amp;', '&')
    .replace(/&#(\d+);/gu, (_, code) => String.fromCodePoint(Number(code)))
    .replace(/&#x([0-9a-f]+);/giu, (_, code) => String.fromCodePoint(Number.parseInt(code, 16)));
}

function sectionChunks({ id, title, paragraphs, maxChars = DEFAULT_MAX_SECTION_CHARS, anchor }) {
  const output = [];
  let current = [];
  let currentLength = 0;
  const flush = () => {
    if (!current.length) return;
    const index = output.length + 1;
    const text = cleanText(current.map((item) => item.text).join('\n\n'));
    output.push({
      id: output.length ? `${id}-part-${index}` : id,
      title: output.length ? `${title} · часть ${index}` : title,
      text,
      entityIds: [],
      tags: [],
      ...anchor(current),
    });
    current = [];
    currentLength = 0;
  };
  for (const paragraph of paragraphs) {
    const length = paragraph.text.length + (current.length ? 2 : 0);
    if (current.length && currentLength + length > maxChars) flush();
    current.push(paragraph);
    currentLength += length;
  }
  flush();
  return output;
}

export async function runCommand(command, args, {
  timeoutMs = 120_000,
  maxBytes = DEFAULT_MAX_COMMAND_BYTES,
  cwd,
} = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd, stdio: ['ignore', 'pipe', 'pipe'] });
    const stdout = [];
    const stderr = [];
    let stdoutBytes = 0;
    let stderrBytes = 0;
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      child.kill('SIGKILL');
      reject(new Error(`${command} exceeded ${timeoutMs} ms.`));
    }, timeoutMs);
    const append = (target, chunk, current, streamName) => {
      const next = current + chunk.length;
      if (next > maxBytes) {
        if (!settled) {
          settled = true;
          clearTimeout(timer);
          child.kill('SIGKILL');
          reject(new Error(`${command} ${streamName} exceeded ${maxBytes} bytes.`));
        }
        return current;
      }
      target.push(chunk);
      return next;
    };
    child.stdout.on('data', (chunk) => {
      stdoutBytes = append(stdout, chunk, stdoutBytes, 'output');
    });
    child.stderr.on('data', (chunk) => {
      stderrBytes = append(stderr, chunk, stderrBytes, 'error output');
    });
    child.once('error', (error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      reject(new Error(`Unable to run ${command}: ${error.message}`));
    });
    child.once('close', (code, signal) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      const out = Buffer.concat(stdout);
      const errorText = Buffer.concat(stderr).toString('utf8').trim();
      if (code !== 0) {
        reject(new Error(`${command} failed (${signal ?? code}): ${errorText || 'no error output'}`));
        return;
      }
      resolve({ stdout: out, stderr: errorText });
    });
  });
}

export function parsePdfTextPages(value) {
  const text = Buffer.isBuffer(value) ? value.toString('utf8') : String(value ?? '');
  const pages = text.replace(/\r\n?/gu, '\n').split('\f');
  if (pages.at(-1)?.trim() === '') pages.pop();
  return pages.map((page, index) => ({ page: index + 1, text: cleanText(page) }));
}

async function ocrPdfPage(filename, pageNumber, { runner, language, workDir }) {
  const prefix = path.join(workDir, `page-${pageNumber}`);
  await runner('pdftoppm', [
    '-f', String(pageNumber),
    '-l', String(pageNumber),
    '-png',
    '-singlefile',
    filename,
    prefix,
  ]);
  const image = `${prefix}.png`;
  const result = await runner('tesseract', [image, 'stdout', '-l', language]);
  return cleanText(result.stdout.toString('utf8'));
}

export async function extractPdfDocument(filename, {
  runner = runCommand,
  ocr = false,
  ocrLanguage = 'rus+eng',
  maxSectionChars = DEFAULT_MAX_SECTION_CHARS,
} = {}) {
  const result = await runner('pdftotext', ['-layout', filename, '-']);
  const pages = parsePdfTextPages(result.stdout);
  const warnings = [];
  let workDir = null;
  try {
    if (ocr && pages.some((page) => !page.text)) {
      workDir = await mkdtemp(path.join(tmpdir(), 'l-note-ocr-'));
      for (const page of pages) {
        if (page.text) continue;
        page.text = await ocrPdfPage(filename, page.page, {
          runner,
          language: ocrLanguage,
          workDir,
        });
        if (!page.text) warnings.push(`Страница ${page.page}: текст не распознан.`);
      }
    }
  } finally {
    if (workDir) await rm(workDir, { recursive: true, force: true });
  }

  const sections = [];
  for (const page of pages) {
    if (!page.text) {
      warnings.push(`Страница ${page.page}: текстовый слой отсутствует${ocr ? ' после OCR' : '; используйте --ocr'}.`);
      continue;
    }
    const paragraphs = page.text.split(/\n{2,}/gu).filter(Boolean).map((text, index) => ({
      index: index + 1,
      text,
    }));
    sections.push(...sectionChunks({
      id: `page-${page.page}`,
      title: `Страница ${page.page}`,
      paragraphs,
      maxChars: maxSectionChars,
      anchor: () => ({
        assetAnchor: { page: page.page },
        provenance: { kind: 'pdf-page', page: page.page },
      }),
    }));
  }
  if (!sections.length) throw new Error(`PDF ${filename} contains no extractable text. Run again with --ocr if the document is scanned.`);
  return {
    title: titleFromFilename(filename),
    sections,
    warnings: [...new Set(warnings)],
    extractor: ocr ? 'pdftotext+tesseract' : 'pdftotext',
  };
}

function paragraphText(xml) {
  const withBreaks = xml
    .replace(/<w:tab\b[^>]*\/>/giu, '\t')
    .replace(/<w:br\b[^>]*\/>/giu, '\n');
  return cleanText([...withBreaks.matchAll(/<w:t\b[^>]*>([\s\S]*?)<\/w:t>/giu)]
    .map((match) => decodeXmlEntities(match[1]))
    .join(''));
}

export function parseDocxDocumentXml(xml, filename = 'document.docx', {
  maxSectionChars = DEFAULT_MAX_SECTION_CHARS,
} = {}) {
  const paragraphs = [];
  let paragraphIndex = 0;
  for (const match of String(xml ?? '').matchAll(/<w:p\b[\s\S]*?<\/w:p>/giu)) {
    paragraphIndex += 1;
    const block = match[0];
    const text = paragraphText(block);
    if (!text) continue;
    const style = /<w:pStyle\b[^>]*w:val="([^"]+)"/iu.exec(block)?.[1] ?? null;
    paragraphs.push({ index: paragraphIndex, text, style });
  }
  if (!paragraphs.length) throw new Error(`DOCX ${filename} contains no text paragraphs.`);

  let title = titleFromFilename(filename);
  const firstTitle = paragraphs.find((paragraph) => /^(?:title|заголовок)$/iu.test(paragraph.style ?? ''));
  if (firstTitle) title = firstTitle.text;
  const sections = [];
  let heading = 'Содержание';
  let group = [];
  const flush = () => {
    if (!group.length) return;
    const id = slugify(heading, `section-${sections.length + 1}`);
    sections.push(...sectionChunks({
      id,
      title: heading,
      paragraphs: group,
      maxChars: maxSectionChars,
      anchor: (items) => ({
        provenance: {
          kind: 'docx-paragraphs',
          paragraphStart: items[0].index,
          paragraphEnd: items.at(-1).index,
        },
      }),
    }));
    group = [];
  };
  for (const paragraph of paragraphs) {
    const isTitle = paragraph === firstTitle;
    const isHeading = /(?:heading|заголовок)\s*[1-6]?/iu.test(paragraph.style ?? '');
    if (isTitle) continue;
    if (isHeading) {
      flush();
      heading = paragraph.text;
      continue;
    }
    group.push(paragraph);
  }
  flush();
  if (!sections.length) {
    sections.push(...sectionChunks({
      id: 'content',
      title: 'Содержание',
      paragraphs: paragraphs.filter((item) => item !== firstTitle),
      maxChars: maxSectionChars,
      anchor: (items) => ({
        provenance: {
          kind: 'docx-paragraphs',
          paragraphStart: items[0].index,
          paragraphEnd: items.at(-1).index,
        },
      }),
    }));
  }
  return { title, sections, warnings: [], extractor: 'docx-xml' };
}

export async function extractDocxDocument(filename, { runner = runCommand, maxSectionChars } = {}) {
  const result = await runner('unzip', ['-p', filename, 'word/document.xml']);
  return parseDocxDocumentXml(result.stdout.toString('utf8'), filename, { maxSectionChars });
}

export async function listDocumentSourceFiles(inputPath) {
  const absolute = path.resolve(inputPath);
  const inputStat = await stat(absolute);
  if (inputStat.isFile()) {
    return SUPPORTED_DOCUMENT_EXTENSIONS.has(path.extname(absolute).toLowerCase()) ? [absolute] : [];
  }
  const files = [];
  async function walk(directory) {
    const entries = await readdir(directory, { withFileTypes: true });
    for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name))) {
      if (entry.name.startsWith('.') || entry.name === 'node_modules') continue;
      const fullPath = path.join(directory, entry.name);
      if (entry.isDirectory()) await walk(fullPath);
      else if (SUPPORTED_DOCUMENT_EXTENSIONS.has(path.extname(entry.name).toLowerCase())) files.push(fullPath);
    }
  }
  await walk(absolute);
  return files;
}

async function writeJson(filename, value) {
  await mkdir(path.dirname(filename), { recursive: true });
  await writeFile(filename, `${JSON.stringify(value, null, 2)}\n`);
}

function uniqueAssetName(relative, used) {
  const extension = path.extname(relative).toLowerCase();
  const base = slugify(path.basename(relative, extension), 'document');
  let name = `${base}${extension}`;
  if (used.has(name)) name = `${base}-${stableId(relative).slice(-8)}${extension}`;
  used.add(name);
  return name;
}

export async function prepareDocumentDirectory({
  inputPath,
  outputPath,
  id,
  version = '1.0.0',
  title = id,
  description = 'Пакет, подготовленный из PDF/DOCX',
  language = 'ru',
  ocr = false,
  ocrLanguage = 'rus+eng',
  maxSectionChars = DEFAULT_MAX_SECTION_CHARS,
  runner = runCommand,
  generatedAt = new Date().toISOString(),
  onProgress = () => {},
} = {}) {
  if (!inputPath || !outputPath || !id) throw new TypeError('inputPath, outputPath and id are required.');
  const files = await listDocumentSourceFiles(inputPath);
  if (!files.length) throw new Error('No supported .pdf or .docx files found.');
  const outputRoot = path.resolve(outputPath);
  const inputAbsolute = path.resolve(inputPath);
  const inputRoot = (await stat(inputAbsolute)).isDirectory() ? inputAbsolute : path.dirname(inputAbsolute);
  const documentRoot = path.join(outputRoot, 'documents');
  const assetRoot = path.join(outputRoot, 'assets');
  await mkdir(documentRoot, { recursive: true });
  await mkdir(assetRoot, { recursive: true });
  const usedAssets = new Set();
  const warnings = [];
  let sections = 0;

  for (const [index, filename] of files.entries()) {
    const relative = path.relative(inputRoot, filename).split(path.sep).join('/');
    onProgress({ index, total: files.length, file: relative, stage: 'extract' });
    const extension = path.extname(filename).toLowerCase();
    const extracted = extension === '.pdf'
      ? await extractPdfDocument(filename, { runner, ocr, ocrLanguage, maxSectionChars })
      : await extractDocxDocument(filename, { runner, maxSectionChars });
    const assetName = uniqueAssetName(relative, usedAssets);
    await copyFile(filename, path.join(assetRoot, assetName));
    const documentId = `doc.${slugify(relative)}`;
    const document = {
      id: documentId,
      title: extracted.title,
      summary: `Извлечено из ${relative}`,
      authority: 'reference',
      effectiveFrom: null,
      source: {
        title: relative,
        path: `./assets/${assetName}`,
        mimeType: extension === '.pdf'
          ? 'application/pdf'
          : 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        extractor: extracted.extractor,
        preparedAt: generatedAt,
      },
      tags: [extension.slice(1)],
      sections: extracted.sections,
      ...(extracted.warnings.length ? { extractionWarnings: extracted.warnings } : {}),
    };
    if (extension === '.pdf') {
      document.asset = {
        url: `./assets/${assetName}`,
        mimeType: 'application/pdf',
        title: extracted.title,
        page: 1,
      };
    }
    await writeJson(path.join(documentRoot, `${slugify(relative)}.json`), document);
    warnings.push(...extracted.warnings.map((warning) => `${relative}: ${warning}`));
    sections += extracted.sections.length;
  }

  await Promise.all([
    writeJson(path.join(outputRoot, 'manifest.json'), {
      schemaVersion: 1,
      id,
      version,
      title,
      description,
      language,
      publishedAt: generatedAt,
      license: 'user-supplied',
      tags: ['user-pack', 'prepared-documents'],
    }),
    writeJson(path.join(outputRoot, 'entities.json'), []),
    writeJson(path.join(outputRoot, 'claims.json'), []),
    writeJson(path.join(outputRoot, 'relations.json'), []),
  ]);
  onProgress({ index: files.length, total: files.length, stage: 'done' });
  return {
    outputPath: outputRoot,
    files: files.length,
    sections,
    warnings,
  };
}
