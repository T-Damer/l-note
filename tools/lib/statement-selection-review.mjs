import { createHash } from 'node:crypto';

import { qualifyStatementId } from '../../src/helpers/statement-conflicts.js';

export const STATEMENT_PREFERENCE_CHOICES = Object.freeze([
  'none',
  'source',
  'target',
  'both',
]);

const CHOICES = new Set(STATEMENT_PREFERENCE_CHOICES);

function text(value) {
  return String(value ?? '').trim();
}

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

function selectionId(groupKey) {
  const digest = createHash('sha256').update(groupKey).digest('hex').slice(0, 16);
  return `statement-selection.${digest}`;
}

function pairRefs(packId, candidate) {
  return unique([
    qualifyStatementId(packId, candidate.sourceClaimId),
    qualifyStatementId(packId, candidate.targetClaimId),
  ]);
}

function preferredRefs(choice, refs) {
  if (choice === 'source') return refs.slice(0, 1);
  if (choice === 'target') return refs.slice(1, 2);
  if (choice === 'both') return refs;
  return [];
}

function selectionFromCandidate(packId, candidate, current, context) {
  const choice = text(candidate.preferredChoice) || 'none';
  if (!CHOICES.has(choice)) throw new Error(`Candidate ${candidate.id} has an unsupported preferredChoice.`);
  if (choice === 'none') return current;

  const refs = pairRefs(packId, candidate);
  if (refs.length !== 2) throw new Error(`Candidate ${candidate.id} cannot create a statement selection.`);
  const groupKey = text(candidate.selectionGroupKey) || candidate.id;
  const previousRefs = current?.claimRefs ?? [];
  const previousPreferred = (current?.preferredClaimRefs ?? []).filter((ref) => !refs.includes(ref));
  const reason = text(candidate.selectionReason) || text(candidate.reason);
  if (!reason) throw new Error(`Candidate ${candidate.id} requires a selection reason.`);

  return {
    id: current?.id ?? selectionId(groupKey),
    groupKey,
    claimRefs: unique([...previousRefs, ...refs]),
    preferredClaimRefs: unique([...previousPreferred, ...preferredRefs(choice, refs)]),
    status: 'confirmed',
    reason,
    ...(text(candidate.selectionScope) ? { scope: text(candidate.selectionScope) } : {}),
    ...(text(candidate.selectionValidAt) ? { validAt: text(candidate.selectionValidAt) } : {}),
    reviewedAt: context.reviewedAt,
    reviewedBy: context.reviewedBy,
  };
}

export function applyStatementSelectionChoices(pack, candidates, {
  reviewedAt,
  reviewedBy,
} = {}) {
  const byGroup = new Map((pack.statementSelections ?? []).map((selection) => [selection.groupKey, selection]));
  for (const candidate of candidates ?? []) {
    if (candidate.decision !== 'accept') continue;
    const choice = text(candidate.preferredChoice) || 'none';
    if (choice === 'none') continue;
    const groupKey = text(candidate.selectionGroupKey) || candidate.id;
    const selection = selectionFromCandidate(pack.id, candidate, byGroup.get(groupKey), {
      reviewedAt,
      reviewedBy,
    });
    byGroup.set(groupKey, selection);
  }
  if (!byGroup.size && !Object.hasOwn(pack, 'statementSelections')) return pack;
  return {
    ...pack,
    statementSelections: [...byGroup.values()].sort((left, right) => left.id.localeCompare(right.id)),
  };
}
