import { createHash } from 'node:crypto';

import { qualifyStatementId } from '../../src/helpers/statement-conflicts.js';
import {
  buildChronology,
  chronologySignals,
} from './chronology.mjs';
import { comparableQuantityDifferences } from './quantities.mjs';

const NEGATIONS = new Set(['не', 'нет', 'нельзя', 'запрещен', 'запрещено', 'without', 'not', 'no', 'never', 'contraindicated']);
const STOPWORDS = new Set([
  'для', 'при', 'или', 'как', 'что', 'это', 'его', 'ее', 'их', 'the', 'and', 'for', 'with', 'that', 'this',
  'из', 'на', 'по', 'в', 'во', 'к', 'до', 'от', 'с', 'со', 'a', 'an', 'of', 'to', 'in', 'is', 'are',
]);
const SCOPE_PATTERNS = [
  /(?<![\p{L}\p{N}_])(?:дети|детей|детям|детьми|детск\p{L}*|ребен\p{L}*|взросл\p{L}*|беременн\p{L}*|новорожденн\p{L}*|младенц\p{L}*)(?![\p{L}\p{N}_])/giu,
  /\b(?:children|child|adult\p{L}*|pregnan\p{L}*|newborn\p{L}*|infant\p{L}*)\b/giu,
  /(?<![\p{L}\p{N}_])(?:до|старше|младше|не менее|не более)\s+\d+(?:[.,]\d+)?\s*(?:лет|год\p{L}*|месяц\p{L}*|недел\p{L}*)(?![\p{L}\p{N}_])/giu,
  /\b(?:under|over|younger than|older than|at least|at most)\s+\d+(?:[.,]\d+)?\s*(?:years?|months?|weeks?)\b/giu,
];

function text(value) {
  return String(value ?? '').trim();
}

function normalized(value) {
  return text(value)
    .normalize('NFKC')
    .toLocaleLowerCase('ru-RU')
    .replaceAll('ё', 'е')
    .replace(/[^\p{L}\p{N}%.,°-]+/gu, ' ')
    .replace(/\s+/gu, ' ')
    .trim();
}

function tokens(value) {
  return new Set(normalized(value)
    .split(' ')
    .filter((token) => token.length >= 3 && !STOPWORDS.has(token)));
}

function intersectionSize(left, right) {
  let count = 0;
  for (const item of left) if (right.has(item)) count += 1;
  return count;
}

function tokenSimilarity(left, right) {
  const leftTokens = tokens(left);
  const rightTokens = tokens(right);
  const shared = intersectionSize(leftTokens, rightTokens);
  const denominator = Math.max(1, Math.min(leftTokens.size, rightTokens.size));
  return { shared, overlap: shared / denominator };
}

function hasNegation(value) {
  return normalized(value).split(' ').some((token) => NEGATIONS.has(token));
}

function scopeCues(value) {
  const output = new Set();
  const source = normalized(value);
  for (const pattern of SCOPE_PATTERNS) {
    const matcher = new RegExp(pattern.source, pattern.flags);
    for (const match of source.matchAll(matcher)) output.add(match[0]);
  }
  return [...output].sort();
}

function sameValues(left, right) {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function resourceDate(pack, document) {
  return document?.effectiveFrom ?? document?.source?.publishedAt ?? document?.source?.date ?? pack?.publishedAt ?? null;
}

function editionMetadata(document) {
  const edition = document?.edition ?? document?.source?.edition;
  return edition && typeof edition === 'object' && !Array.isArray(edition) ? edition : null;
}

function claimResource(pack, claim) {
  const document = (pack.documents ?? []).find((item) => item.id === claim.source?.documentId);
  const section = document?.sections?.find((item) => item.id === claim.source?.sectionId);
  const entityById = new Map((pack.entities ?? []).map((item) => [item.id, item]));
  const subject = entityById.get(claim.subjectId);
  const object = entityById.get(claim.objectId);
  const documentId = document?.id ?? claim.source?.documentId ?? null;
  return {
    packId: pack.id,
    packTitle: pack.title,
    claimId: claim.id,
    claimRef: qualifyStatementId(pack.id, claim.id),
    text: claim.text,
    quote: claim.source?.quote ?? claim.text,
    subject: subject?.name ?? claim.subjectId ?? null,
    object: object?.name ?? claim.objectId ?? null,
    documentId,
    documentRef: documentId ? `${pack.id}::${documentId}` : null,
    documentTitle: document?.title ?? claim.source?.documentId ?? 'Документ',
    sectionId: section?.id ?? claim.source?.sectionId ?? null,
    sectionTitle: section?.title ?? claim.source?.sectionId ?? null,
    date: resourceDate(pack, document),
    publishedAt: document?.source?.publishedAt ?? document?.source?.date ?? null,
    modifiedAt: document?.source?.modifiedAt ?? null,
    retrievedAt: document?.source?.retrievedAt ?? document?.source?.preparedAt ?? null,
    validFrom: document?.effectiveFrom ?? null,
    validUntil: document?.effectiveUntil ?? null,
    edition: editionMetadata(document),
  };
}

function stableCandidateId(leftRef, rightRef, signals) {
  const digest = createHash('sha256')
    .update([leftRef, rightRef, ...signals].join('\u241f'))
    .digest('hex')
    .slice(0, 16);
  return `statement-review.${digest}`;
}

function pairKey(leftRef, rightRef) {
  return [leftRef, rightRef].sort().join('\u241f');
}

function existingPairKeys(packs) {
  const values = new Set();
  for (const pack of packs) {
    for (const relation of pack.statementRelations ?? []) {
      const left = qualifyStatementId(pack.id, relation.sourceClaimId);
      const right = qualifyStatementId(pack.id, relation.targetClaimId);
      if (left && right) values.add(pairKey(left, right));
    }
  }
  return values;
}

function contentSuggestedType({ scopeDifference, negationMismatch, objectMismatch }) {
  return scopeDifference && !negationMismatch && !objectMismatch
    ? 'different_scope'
    : 'contradicts';
}

function chronologySuggestedType(contentType, chronology) {
  if (chronology.explicitArtifactRelation === 'replaces') return 'supersedes';
  if (chronology.explicitArtifactRelation === 'amends') return 'refines';
  if (['before', 'after', 'meets', 'met_by'].includes(chronology.validityRelation)) {
    return 'different_scope';
  }
  return contentType;
}

function candidateFor(left, right) {
  const similarity = tokenSimilarity(left.text, right.text);
  const subjectMatches = left.subject && right.subject && normalized(left.subject) === normalized(right.subject);
  if (!subjectMatches && (similarity.shared < 3 || similarity.overlap < .45)) return null;

  const numbers = comparableQuantityDifferences(`${left.text} ${left.quote}`, `${right.text} ${right.quote}`);
  const negationMismatch = hasNegation(left.text) !== hasNegation(right.text);
  const leftScope = scopeCues(`${left.text} ${left.quote}`);
  const rightScope = scopeCues(`${right.text} ${right.quote}`);
  const scopeDifference = leftScope.length > 0 && rightScope.length > 0 && !sameValues(leftScope, rightScope);
  const objectMismatch = Boolean(
    subjectMatches && left.object && right.object && normalized(left.object) !== normalized(right.object),
  );
  if (!numbers.length && !negationMismatch && !scopeDifference && !objectMismatch) return null;

  const contentSignals = [];
  if (numbers.length) contentSignals.push('numeric_difference');
  if (negationMismatch) contentSignals.push('negation_difference');
  if (scopeDifference) contentSignals.push('scope_difference');
  if (objectMismatch) contentSignals.push('object_difference');
  const chronology = buildChronology(left, right);
  const signals = [...contentSignals, ...chronologySignals(chronology)];
  const contentType = contentSuggestedType({ scopeDifference, negationMismatch, objectMismatch });
  const suggestedType = chronologySuggestedType(contentType, chronology);
  const confidence = Math.min(
    .98,
    .5 + (subjectMatches ? .18 : 0) + similarity.overlap * .2 + contentSignals.length * .07,
  );
  const reasons = [];
  if (numbers.length) reasons.push(`различаются значения: ${numbers.map((item) => `${item.left.join('/')} ↔ ${item.right.join('/')} ${item.unit}`.trim()).join(', ')}`);
  if (negationMismatch) reasons.push('отрицание присутствует только в одном утверждении');
  if (scopeDifference) reasons.push(`различается область применения: ${leftScope.join(', ')} ↔ ${rightScope.join(', ')}`);
  if (objectMismatch) reasons.push(`различаются связанные значения: ${left.object} ↔ ${right.object}`);

  return {
    id: stableCandidateId(left.claimRef, right.claimRef, contentSignals),
    sourceClaimId: left.claimId,
    targetClaimId: right.packId === left.packId ? right.claimId : right.claimRef,
    suggestedType,
    selectedType: suggestedType,
    decision: 'pending',
    confidence: Number(confidence.toFixed(3)),
    reason: reasons.join('; '),
    signals,
    similarity: Number(similarity.overlap.toFixed(3)),
    chronology,
    source: left,
    target: right,
  };
}

export function detectStatementRelationCandidates({ pack, referencePacks = [], includeInternal = true } = {}) {
  if (!pack?.id) throw new TypeError('A target pack is required.');
  const targetClaims = (pack.claims ?? []).map((claim) => claimResource(pack, claim));
  const references = referencePacks.flatMap((reference) => (
    (reference.claims ?? []).map((claim) => claimResource(reference, claim))
  ));
  const existing = existingPairKeys([pack, ...referencePacks]);
  const candidates = [];

  for (const left of targetClaims) {
    for (const right of references) {
      if (existing.has(pairKey(left.claimRef, right.claimRef))) continue;
      const candidate = candidateFor(left, right);
      if (candidate) candidates.push(candidate);
    }
  }
  if (includeInternal) {
    for (let leftIndex = 0; leftIndex < targetClaims.length; leftIndex += 1) {
      for (let rightIndex = leftIndex + 1; rightIndex < targetClaims.length; rightIndex += 1) {
        const left = targetClaims[leftIndex];
        const right = targetClaims[rightIndex];
        if (existing.has(pairKey(left.claimRef, right.claimRef))) continue;
        const candidate = candidateFor(left, right);
        if (candidate) candidates.push(candidate);
      }
    }
  }
  return candidates.sort((left, right) => right.confidence - left.confidence || left.id.localeCompare(right.id));
}

export function createDiscrepancyReview({ pack, referencePacks = [], generatedAt = new Date().toISOString() } = {}) {
  return {
    schemaVersion: 1,
    kind: 'lnote.statement-relation-review',
    generatedAt,
    targetPackId: pack.id,
    referencePackIds: referencePacks.map((item) => item.id),
    instructions: 'For each candidate set decision to accept or dismiss. You may change selectedType and reason before applying the review.',
    candidates: detectStatementRelationCandidates({ pack, referencePacks }),
  };
}

function reviewEvidence(candidate) {
  const signals = Array.isArray(candidate.signals)
    ? candidate.signals.map(text).filter(Boolean).slice(0, 32)
    : [];
  const chronology = candidate.chronology && typeof candidate.chronology === 'object'
    ? JSON.parse(JSON.stringify(candidate.chronology))
    : null;
  return chronology || signals.length ? { signals, chronology } : null;
}

export function applyDiscrepancyReview(pack, review, {
  reviewedAt = new Date().toISOString(),
  reviewedBy = 'local-reviewer',
} = {}) {
  if (review?.kind !== 'lnote.statement-relation-review' || review?.targetPackId !== pack?.id) {
    throw new Error('The discrepancy review does not belong to this pack.');
  }
  const allowedTypes = new Set(['supports', 'contradicts', 'refines', 'supersedes', 'equivalent', 'different_scope']);
  const accepted = [];
  for (const candidate of review.candidates ?? []) {
    if (candidate.decision !== 'accept') continue;
    if (!allowedTypes.has(candidate.selectedType)) {
      throw new Error(`Candidate ${candidate.id} has an unsupported selectedType.`);
    }
    const evidence = reviewEvidence(candidate);
    accepted.push({
      id: candidate.id,
      sourceClaimId: candidate.sourceClaimId,
      targetClaimId: candidate.targetClaimId,
      type: candidate.selectedType,
      status: 'confirmed',
      confidence: candidate.confidence,
      reason: text(candidate.reason),
      detectedBy: 'rule+human-review',
      reviewedAt,
      reviewedBy,
      ...(evidence ? { reviewEvidence: evidence } : {}),
    });
  }
  const byId = new Map((pack.statementRelations ?? []).map((relation) => [relation.id, relation]));
  for (const relation of accepted) byId.set(relation.id, relation);
  return {
    ...pack,
    statementRelations: [...byId.values()].sort((left, right) => left.id.localeCompare(right.id)),
  };
}
