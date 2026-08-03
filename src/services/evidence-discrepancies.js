import {
  buildStatementConflictIndex,
  qualifyStatementId,
  statementSectionKey,
} from '../helpers/statement-conflicts.js';

function sourceSectionKey(source) {
  const result = source?.result ?? {};
  return statementSectionKey(result.packId, result.documentId, result.sectionId);
}

function sideSectionKey(side) {
  return statementSectionKey(
    side?.packId,
    side?.claim?.source?.documentId,
    side?.sectionId,
  );
}

function sideSource(side) {
  const section = side?.document?.sections?.find((item) => item.id === side.sectionId);
  if (!side || !section) return null;
  return {
    id: '',
    supplemental: true,
    result: {
      id: `section:${side.packId}:${side.claim.source.documentId}:${side.sectionId}`,
      kind: 'section',
      packId: side.packId,
      packTitle: side.packTitle,
      documentId: side.claim.source.documentId,
      documentTitle: side.documentTitle,
      sectionId: side.sectionId,
      title: section.title,
      body: section.text,
      aliases: '',
      entityNames: '',
      entityIds: section.entityIds ?? [],
      tags: [...(side.document?.tags ?? []), ...(section.tags ?? [])].join(' '),
      authority: side.document?.authority ?? 'reference',
      effectiveFrom: side.document?.effectiveFrom ?? null,
      sourceTitle: side.document?.source?.title ?? side.documentTitle,
      claimIds: [side.claim.localId ?? side.claim.id],
    },
    document: side.document,
    section,
    claims: [side.claim],
  };
}

function relatedConflicts(source, conflictIndex) {
  const result = source?.result ?? {};
  const conflicts = [];
  for (const claimId of result.claimIds ?? []) {
    conflicts.push(...(conflictIndex.byClaim.get(qualifyStatementId(result.packId, claimId)) ?? []));
  }
  conflicts.push(...(conflictIndex.bySection.get(sourceSectionKey(source)) ?? []));
  return conflicts;
}

function evidenceSide(side, evidenceId) {
  return Object.freeze({
    evidenceId,
    claimRef: side.claimRef,
    claim: side.claim,
    packId: side.packId,
    packTitle: side.packTitle,
    documentRef: side.documentRef,
    documentTitle: side.documentTitle,
    sectionId: side.sectionId,
    quote: side.quote,
    date: side.date,
  });
}

function boundedLimit(value) {
  return Math.max(0, Math.floor(Number(value) || 0));
}

export function addConfirmedDiscrepancyEvidence({
  sources = [],
  packs = [],
  limit = 2,
} = {}) {
  const budget = boundedLimit(limit);
  const conflictIndex = buildStatementConflictIndex(packs);
  const candidates = [];
  const seen = new Set();
  for (const source of sources) {
    for (const conflict of relatedConflicts(source, conflictIndex)) {
      if (conflict.status !== 'confirmed' || seen.has(conflict.runtimeId)) continue;
      seen.add(conflict.runtimeId);
      candidates.push(conflict);
    }
  }

  const selected = [];
  const sourceBySection = new Map(sources.map((source) => [sourceSectionKey(source), source]));
  const supplementalAfter = new Map();
  let supplementalCount = 0;
  for (const conflict of candidates) {
    if (selected.length >= budget) break;
    const missingSides = [conflict.source, conflict.target]
      .filter((side) => !sourceBySection.has(sideSectionKey(side)));
    if (supplementalCount + missingSides.length > budget) continue;
    const created = [];
    for (const side of missingSides) {
      const source = sideSource(side);
      if (!source) continue;
      sourceBySection.set(sideSectionKey(side), source);
      created.push(source);
      supplementalCount += 1;
    }
    if (created.length !== missingSides.length) continue;
    const anchor = sources.find((source) => (
      sourceSectionKey(source) === sideSectionKey(conflict.source)
      || sourceSectionKey(source) === sideSectionKey(conflict.target)
    ));
    if (anchor && created.length) {
      supplementalAfter.set(anchor, [...(supplementalAfter.get(anchor) ?? []), ...created]);
    }
    selected.push(conflict);
  }

  const orderedSources = [];
  for (const source of sources) {
    orderedSources.push(source, ...(supplementalAfter.get(source) ?? []));
  }
  const evidenceIdBySection = new Map();
  const numberedSources = orderedSources.map((source, index) => {
    const numbered = Object.freeze({ ...source, id: `S${index + 1}` });
    evidenceIdBySection.set(sourceSectionKey(numbered), numbered.id);
    return numbered;
  });

  const discrepancies = selected.map((conflict) => Object.freeze({
    id: conflict.runtimeId,
    type: conflict.type,
    status: conflict.status,
    reason: conflict.reason,
    detectedBy: conflict.detectedBy,
    confidence: conflict.confidence,
    source: evidenceSide(
      conflict.source,
      evidenceIdBySection.get(sideSectionKey(conflict.source)),
    ),
    target: evidenceSide(
      conflict.target,
      evidenceIdBySection.get(sideSectionKey(conflict.target)),
    ),
  }));

  return Object.freeze({ sources: numberedSources, discrepancies });
}
