import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';

export const OCR_REVIEW_KIND = 'lnote.ocr-review';
export const OCR_REVIEW_SCHEMA_VERSION = 1;
const DECISIONS = new Set(['pending', 'accept', 'dismiss']);

function clean(value) {
  return String(value ?? '')
    .replace(/\r\n?/gu, '\n')
    .replace(/[ \t]+\n/gu, '\n')
    .replace(/\n{3,}/gu, '\n\n')
    .trim();
}

export async function sha256File(filename) {
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(filename)) hash.update(chunk);
  return hash.digest('hex');
}

function number(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function wordFromTsv(fields) {
  const text = clean(fields.slice(11).join('\t'));
  const confidence = number(fields[10], -1);
  if (!text || confidence < 0) return null;
  return {
    text,
    confidence,
    block: number(fields[2]),
    paragraph: number(fields[3]),
    line: number(fields[4]),
    word: number(fields[5]),
    left: number(fields[6]),
    top: number(fields[7]),
    width: number(fields[8]),
    height: number(fields[9]),
  };
}

function reconstructedText(words) {
  const lines = new Map();
  for (const word of words) {
    const key = `${word.block}\u241f${word.paragraph}\u241f${word.line}`;
    const values = lines.get(key) ?? [];
    values.push(word);
    lines.set(key, values);
  }
  return [...lines.values()]
    .map((values) => values
      .sort((left, right) => left.word - right.word || left.left - right.left)
      .map((word) => word.text)
      .join(' '))
    .join('\n');
}

export function parseTesseractTsv(value, { lowConfidenceThreshold = 80 } = {}) {
  const rows = String(value ?? '').replace(/\r\n?/gu, '\n').split('\n');
  const words = [];
  let pageWidth = 0;
  let pageHeight = 0;
  for (const [index, row] of rows.entries()) {
    if (!row.trim() || index === 0 && row.startsWith('level\t')) continue;
    const fields = row.split('\t');
    if (fields.length < 11) continue;
    if (number(fields[0]) === 1) {
      pageWidth = number(fields[8]);
      pageHeight = number(fields[9]);
    }
    const word = wordFromTsv(fields);
    if (word) words.push(word);
  }
  const confidences = words.map((word) => word.confidence);
  const averageConfidence = confidences.length
    ? confidences.reduce((sum, value) => sum + value, 0) / confidences.length
    : null;
  return {
    text: clean(reconstructedText(words)),
    words,
    pageWidth,
    pageHeight,
    averageConfidence,
    minimumConfidence: confidences.length ? Math.min(...confidences) : null,
    lowConfidenceThreshold,
    lowConfidenceWords: words.filter((word) => word.confidence < lowConfidenceThreshold).length,
  };
}

function candidateDigest(input) {
  return createHash('sha256')
    .update([
      input.targetPackId,
      input.sourcePath,
      input.sourceSha256,
      String(input.page),
      input.language,
    ].join('\u241f'))
    .digest('hex')
    .slice(0, 16);
}

export function createOcrCandidate({
  targetPackId,
  sourcePath,
  sourceSha256,
  assetUrl,
  documentId,
  documentTitle,
  page,
  language,
  recognition,
} = {}) {
  if (!targetPackId || !sourcePath || !sourceSha256 || !documentId || !page) {
    throw new TypeError('OCR candidate requires pack, source, document and page identity.');
  }
  const originalText = clean(recognition?.text);
  const eligible = Boolean(originalText);
  return {
    id: `ocr-review.${candidateDigest({
      targetPackId,
      sourcePath,
      sourceSha256,
      page,
      language,
    })}`,
    decision: eligible ? 'pending' : 'dismiss',
    eligible,
    validationError: eligible ? null : 'OCR не распознал текст на странице.',
    sourcePath,
    sourceSha256,
    assetUrl,
    documentId,
    documentTitle,
    page,
    language,
    originalText,
    text: originalText,
    pageWidth: recognition?.pageWidth ?? 0,
    pageHeight: recognition?.pageHeight ?? 0,
    averageConfidence: recognition?.averageConfidence ?? null,
    minimumConfidence: recognition?.minimumConfidence ?? null,
    lowConfidenceThreshold: recognition?.lowConfidenceThreshold ?? 80,
    lowConfidenceWords: recognition?.lowConfidenceWords ?? 0,
    words: recognition?.words ?? [],
  };
}

function previousCandidate(review, candidate) {
  if (!review) return null;
  if (review.kind !== OCR_REVIEW_KIND || review.targetPackId !== candidate.targetPackId) return null;
  const prior = (review.candidates ?? []).find((item) => item.id === candidate.id);
  if (!prior) return null;
  if (prior.sourceSha256 !== candidate.sourceSha256
    || prior.sourcePath !== candidate.sourcePath
    || prior.page !== candidate.page) return null;
  return prior;
}

function mergeCandidate(candidate, review) {
  const prior = previousCandidate(review, candidate);
  if (!prior) return candidate;
  const decision = DECISIONS.has(prior.decision) ? prior.decision : 'pending';
  const text = clean(prior.text);
  const validationError = decision === 'accept' && !text
    ? 'Принятый OCR-текст не может быть пустым.'
    : candidate.validationError;
  return {
    ...candidate,
    decision: validationError && decision === 'accept' ? 'pending' : decision,
    text: text || candidate.originalText,
    validationError,
    reviewedBy: prior.reviewedBy ?? null,
    reviewedAt: prior.reviewedAt ?? null,
  };
}

export function createOcrReview({
  targetPackId,
  candidates = [],
  previousReview = null,
  generatedAt = new Date().toISOString(),
} = {}) {
  if (!targetPackId) throw new TypeError('targetPackId is required.');
  const normalized = candidates.map((candidate) => mergeCandidate({
    ...candidate,
    targetPackId,
  }, previousReview));
  return {
    schemaVersion: OCR_REVIEW_SCHEMA_VERSION,
    kind: OCR_REVIEW_KIND,
    generatedAt,
    targetPackId,
    instructions: 'Review every OCR page. Accepted edited text enters the pack; dismissed pages do not.',
    candidates: normalized.sort((left, right) => (
      left.sourcePath.localeCompare(right.sourcePath)
      || left.page - right.page
      || left.id.localeCompare(right.id)
    )),
  };
}

export function ocrReviewState(review) {
  if (review?.kind !== OCR_REVIEW_KIND) throw new TypeError('An OCR review is required.');
  const counts = { pending: 0, accept: 0, dismiss: 0 };
  for (const candidate of review.candidates ?? []) {
    const decision = DECISIONS.has(candidate.decision) ? candidate.decision : 'pending';
    counts[decision] += 1;
  }
  return { ...counts, complete: counts.pending === 0 };
}

export function acceptedOcrText(review, candidateId) {
  const candidate = review?.candidates?.find((item) => item.id === candidateId);
  if (!candidate || candidate.decision !== 'accept') return null;
  const text = clean(candidate.text);
  if (!text) throw new Error(`Accepted OCR candidate ${candidateId} has empty text.`);
  return {
    text,
    reviewedBy: candidate.reviewedBy ?? 'local-reviewer',
    reviewedAt: candidate.reviewedAt ?? review.reviewedAt ?? null,
  };
}
