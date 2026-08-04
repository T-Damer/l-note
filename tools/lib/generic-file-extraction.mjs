import { readFile } from 'node:fs/promises';
import path from 'node:path';

import { decodeLikelyText, sourceExtension } from './document-formats.mjs';
import { slugify } from './pack-builder.mjs';

function cleanText(value) {
  return String(value ?? '')
    .replace(/\r\n?/gu, '\n')
    .replace(/[ \t]+\n/gu, '\n')
    .replace(/\n{3,}/gu, '\n\n')
    .trim();
}

function titleFromFilename(filename) {
  return path.basename(filename, path.extname(filename)).replace(/[-_]+/gu, ' ').trim() || 'Файл';
}

function splitText(text, maxChars) {
  const source = cleanText(text);
  if (!source) return [];
  const output = [];
  const paragraphs = source.split(/\n{2,}/gu).filter(Boolean);
  let current = '';
  const flush = () => {
    if (!current) return;
    output.push(current);
    current = '';
  };
  for (const paragraph of paragraphs) {
    if (current && current.length + paragraph.length + 2 > maxChars) flush();
    if (paragraph.length > maxChars) {
      flush();
      for (let offset = 0; offset < paragraph.length; offset += maxChars) {
        output.push(paragraph.slice(offset, offset + maxChars));
      }
    } else {
      current = current ? `${current}\n\n${paragraph}` : paragraph;
    }
  }
  flush();
  return output;
}

function sectionsForHeading(title, text, order, maxChars) {
  return splitText(text, maxChars).map((part, index) => ({
    id: index ? `${slugify(title, 'content')}-part-${index + 1}` : slugify(title, 'content'),
    title: index ? `${title} · часть ${index + 1}` : title,
    text: part,
    entityIds: [],
    tags: [],
    provenance: {
      kind: 'text-lines',
      lineStart: order.lineStart,
      lineEnd: order.lineEnd,
    },
  }));
}

function markdownSections(text, filename, maxChars) {
  const lines = cleanText(text).split('\n');
  let title = titleFromFilename(filename);
  let heading = 'Содержание';
  let startLine = 1;
  let body = [];
  let firstHeading = true;
  const sections = [];
  const flush = (endLine) => {
    const content = cleanText(body.join('\n'));
    if (content) sections.push(...sectionsForHeading(heading, content, {
      lineStart: startLine,
      lineEnd: endLine,
    }, maxChars));
    body = [];
  };
  for (const [index, line] of lines.entries()) {
    const match = /^(#{1,6})\s+(.+?)\s*$/u.exec(line);
    if (!match) {
      body.push(line);
      continue;
    }
    const headingText = cleanText(match[2]);
    if (firstHeading && match[1].length === 1 && !cleanText(body.join('\n')) && sections.length === 0) {
      title = headingText;
    } else {
      flush(index);
      heading = headingText;
      startLine = index + 2;
    }
    firstHeading = false;
  }
  flush(lines.length);
  if (!sections.length && cleanText(text)) {
    sections.push(...sectionsForHeading('Содержание', text, {
      lineStart: 1,
      lineEnd: lines.length,
    }, maxChars));
  }
  return { title, sections };
}

function plainTextSections(text, filename, maxChars) {
  const source = cleanText(text);
  const lines = source.split('\n');
  let title = titleFromFilename(filename);
  let body = source;
  if (lines.length > 1 && lines[0].length <= 140 && !/[{}<>;]$/u.test(lines[0])) {
    title = lines[0].replace(/^#+\s*/u, '').trim() || title;
    body = cleanText(lines.slice(1).join('\n')) || source;
  }
  return {
    title,
    sections: sectionsForHeading('Содержание', body, {
      lineStart: body === source ? 1 : 2,
      lineEnd: lines.length,
    }, maxChars),
  };
}

export async function tryExtractTextDocument(filename, {
  readFileFn = readFile,
  maxSectionChars = 5000,
} = {}) {
  const bytes = await readFileFn(filename);
  const text = decodeLikelyText(bytes);
  if (text === null) return null;
  const extension = sourceExtension(filename);
  const parsed = ['.md', '.markdown', '.mdx'].includes(extension)
    ? markdownSections(text, filename, maxSectionChars)
    : plainTextSections(text, filename, maxSectionChars);
  if (!parsed.sections.length) return null;
  return {
    ...parsed,
    ocrPages: [],
    warnings: [],
    extractor: extension ? `text-${extension.slice(1)}` : 'text-sniff',
    detectedFormat: extension ? extension.slice(1) : 'text',
    embeddedAssets: [],
  };
}

export function attachmentOnlyExtraction(filename, {
  relativePath = path.basename(filename),
  bytes = 0,
  sha256 = '',
  mimeType = 'application/octet-stream',
  reason = 'Автоматический парсер для этого файла не найден.',
} = {}) {
  const title = titleFromFilename(filename);
  const extension = sourceExtension(filename);
  return {
    title,
    sections: [{
      id: 'attachment',
      title: 'Файл для ручной разметки',
      text: [
        `Исходный файл: ${relativePath}`,
        `Тип: ${mimeType}`,
        `Размер: ${bytes} байт`,
        sha256 ? `SHA-256: ${sha256}` : '',
        `Статус: ${reason}`,
        'Файл сохранён в пакете. К этому разделу можно привязывать заметки, связи и ручные утверждения.',
      ].filter(Boolean).join('\n'),
      entityIds: [],
      tags: ['attachment-only', extension.slice(1)].filter(Boolean),
      provenance: {
        kind: 'attachment-only',
        sourcePath: relativePath,
        bytes,
        sha256: sha256 || null,
      },
    }],
    ocrPages: [],
    warnings: [reason],
    extractor: 'attachment-metadata',
    detectedFormat: extension ? extension.slice(1) : 'unknown',
    embeddedAssets: [],
  };
}
