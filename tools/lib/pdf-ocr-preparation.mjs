import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import {
  acceptedOcrText,
  createOcrCandidate,
  parseTesseractTsv,
} from './ocr-review.mjs';

function clean(value) {
  return String(value ?? '')
    .replace(/\r\n?/gu, '\n')
    .replace(/[ \t]+\n/gu, '\n')
    .replace(/\n{3,}/gu, '\n\n')
    .trim();
}

function sectionParts(text, maxChars) {
  const source = clean(text);
  if (source.length <= maxChars) return [source];
  const parts = [];
  let current = '';
  for (const paragraph of source.split(/\n{2,}/gu).filter(Boolean)) {
    if (current && current.length + paragraph.length + 2 > maxChars) {
      parts.push(current);
      current = '';
    }
    if (paragraph.length > maxChars) {
      if (current) parts.push(current);
      current = '';
      for (let offset = 0; offset < paragraph.length; offset += maxChars) {
        parts.push(paragraph.slice(offset, offset + maxChars));
      }
    } else {
      current = current ? `${current}\n\n${paragraph}` : paragraph;
    }
  }
  if (current) parts.push(current);
  return parts.filter(Boolean);
}

export function pdfPageSections({
  page,
  text,
  maxChars = 5_000,
  provenance = { kind: 'pdf-page', page },
} = {}) {
  return sectionParts(text, maxChars).map((part, index) => ({
    id: index ? `page-${page}-part-${index + 1}` : `page-${page}`,
    title: index ? `Страница ${page} · часть ${index + 1}` : `Страница ${page}`,
    text: part,
    entityIds: [],
    tags: [],
    assetAnchor: { page },
    provenance,
  }));
}

async function recognizePage(filename, page, { runner, language, workDir }) {
  const prefix = path.join(workDir, `page-${page}`);
  await runner('pdftoppm', [
    '-f', String(page),
    '-l', String(page),
    '-png',
    '-singlefile',
    filename,
    prefix,
  ]);
  const image = `${prefix}.png`;
  const result = await runner('tesseract', [image, 'stdout', '-l', language, 'tsv']);
  return parseTesseractTsv(result.stdout.toString('utf8'));
}

export async function recognizeMissingPdfPages(filename, pages, {
  runner,
  language = 'rus+eng',
} = {}) {
  const missing = pages.filter((page) => !page.text);
  if (!missing.length) return [];
  const workDir = await mkdtemp(path.join(tmpdir(), 'l-note-ocr-'));
  try {
    const output = [];
    for (const page of missing) {
      output.push({
        page: page.page,
        recognition: await recognizePage(filename, page.page, {
          runner,
          language,
          workDir,
        }),
      });
    }
    return output;
  } finally {
    await rm(workDir, { recursive: true, force: true });
  }
}

export function createPdfOcrCandidates({
  targetPackId,
  sourcePath,
  sourceSha256,
  assetUrl,
  documentId,
  documentTitle,
  language,
  ocrPages = [],
} = {}) {
  return ocrPages.map(({ page, recognition }) => createOcrCandidate({
    targetPackId,
    sourcePath,
    sourceSha256,
    assetUrl,
    documentId,
    documentTitle,
    page,
    language,
    recognition,
  }));
}

export function acceptedPdfOcrSections(review, candidates, {
  maxChars = 5_000,
} = {}) {
  const sections = [];
  for (const candidate of candidates) {
    const accepted = acceptedOcrText(review, candidate.id);
    if (!accepted) continue;
    sections.push(...pdfPageSections({
      page: candidate.page,
      text: accepted.text,
      maxChars,
      provenance: {
        kind: 'pdf-page-ocr',
        page: candidate.page,
        ocrReviewId: candidate.id,
        sourceSha256: candidate.sourceSha256,
        language: candidate.language,
        averageConfidence: candidate.averageConfidence,
        minimumConfidence: candidate.minimumConfidence,
        lowConfidenceWords: candidate.lowConfidenceWords,
        reviewedAt: accepted.reviewedAt,
        reviewedBy: accepted.reviewedBy,
      },
    }));
  }
  return sections;
}
