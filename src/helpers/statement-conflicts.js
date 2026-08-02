export const STATEMENT_RELATION_TYPES = Object.freeze([
  'supports',
  'contradicts',
  'refines',
  'supersedes',
  'equivalent',
  'different_scope',
]);

export const STATEMENT_RELATION_STATUSES = Object.freeze([
  'proposed',
  'confirmed',
  'dismissed',
]);

const RELATION_TYPES = new Set(STATEMENT_RELATION_TYPES);
const RELATION_STATUSES = new Set(STATEMENT_RELATION_STATUSES);
const DIVERGENCE_TYPES = new Set(['contradicts', 'supersedes', 'different_scope']);

function text(value) {
  return String(value ?? '').trim();
}

export function qualifyStatementId(packId, claimId) {
  const claim = text(claimId);
  if (!claim) return '';
  if (claim.includes('::')) return claim;
  const pack = text(packId);
  return pack ? `${pack}::${claim}` : claim;
}

export function qualifyDocumentId(packId, documentId) {
  return qualifyStatementId(packId, documentId);
}

export function statementSectionKey(packId, documentId, sectionId) {
  const documentRef = qualifyDocumentId(packId, documentId);
  const section = text(sectionId);
  return documentRef && section ? `${documentRef}/${section}` : '';
}

export function statementRelationLabel(type) {
  return {
    supports: 'Подтверждает',
    contradicts: 'Противоречит',
    refines: 'Уточняет',
    supersedes: 'Заменяет более раннее сведение',
    equivalent: 'Сообщает то же самое',
    different_scope: 'Относится к другим условиям',
  }[type] ?? 'Связано с другим утверждением';
}

export function validateStatementRelations(pack) {
  const relations = pack?.statementRelations;
  if (relations === undefined) return [];
  if (!Array.isArray(relations)) return ['statementRelations must be an array'];
  const errors = [];
  const localClaims = new Set((pack.claims ?? []).map((claim) => qualifyStatementId(pack.id, claim?.id)));
  const relationIds = new Set();

  for (const [index, relation] of relations.entries()) {
    const path = `statementRelations[${index}]`;
    const id = text(relation?.id);
    const sourceRef = qualifyStatementId(pack.id, relation?.sourceClaimId);
    const targetRef = qualifyStatementId(pack.id, relation?.targetClaimId);
    if (!id) errors.push(`${path}.id must be a non-empty string`);
    else if (relationIds.has(id)) errors.push(`duplicate statement relation id: ${id}`);
    if (id) relationIds.add(id);
    if (!sourceRef) errors.push(`${path}.sourceClaimId must be a non-empty string`);
    if (!targetRef) errors.push(`${path}.targetClaimId must be a non-empty string`);
    if (sourceRef && sourceRef === targetRef) errors.push(`${path} must reference two different statements`);
    if (!RELATION_TYPES.has(relation?.type)) errors.push(`${path}.type is unsupported`);
    if (relation?.status !== undefined && !RELATION_STATUSES.has(relation.status)) {
      errors.push(`${path}.status is unsupported`);
    }
    for (const ref of [sourceRef, targetRef]) {
      if (ref.startsWith(`${pack.id}::`) && !localClaims.has(ref)) {
        errors.push(`${path} references unknown local statement ${ref}`);
      }
    }
    if (relation?.confidence !== undefined) {
      const confidence = Number(relation.confidence);
      if (!Number.isFinite(confidence) || confidence < 0 || confidence > 1) {
        errors.push(`${path}.confidence must be between 0 and 1`);
      }
    }
  }
  return errors;
}

function sourceDate(pack, document) {
  return document?.effectiveFrom
    ?? document?.source?.publishedAt
    ?? document?.source?.date
    ?? pack?.publishedAt
    ?? null;
}

function indexPackResources(packs) {
  const claims = new Map();
  const documents = new Map();
  const packsById = new Map();
  for (const pack of packs ?? []) {
    packsById.set(pack.id, pack);
    for (const document of pack.documents ?? []) {
      documents.set(qualifyDocumentId(pack.id, document.id), { ...document, packId: pack.id });
    }
    for (const claim of pack.claims ?? []) {
      const runtimeId = qualifyStatementId(pack.id, claim.id);
      claims.set(runtimeId, {
        ...claim,
        id: claim.id,
        localId: claim.id,
        runtimeId,
        packId: pack.id,
      });
    }
  }
  return { claims, documents, packsById };
}

function conflictSide(claimRef, resources) {
  const claim = resources.claims.get(claimRef);
  if (!claim) return null;
  const documentRef = qualifyDocumentId(claim.packId, claim.source?.documentId);
  const document = resources.documents.get(documentRef);
  const pack = resources.packsById.get(claim.packId);
  return {
    claimRef,
    claim,
    documentRef,
    document,
    packId: claim.packId,
    packTitle: pack?.title ?? claim.packId,
    documentTitle: document?.title ?? claim.source?.documentId ?? 'Документ',
    sectionId: claim.source?.sectionId ?? null,
    quote: claim.source?.quote ?? claim.text,
    date: sourceDate(pack, document),
  };
}

function appendIndex(map, key, value) {
  if (!key) return;
  const values = map.get(key) ?? [];
  if (!values.some((entry) => entry.runtimeId === value.runtimeId)) values.push(value);
  map.set(key, values);
}

export function buildStatementConflictIndex(packs = []) {
  const resources = indexPackResources(packs);
  const conflicts = [];
  const byClaim = new Map();
  const bySection = new Map();
  const unresolved = [];
  const seen = new Set();

  for (const ownerPack of packs ?? []) {
    for (const relation of ownerPack.statementRelations ?? []) {
      if (!DIVERGENCE_TYPES.has(relation?.type) || relation?.status === 'dismissed') continue;
      const sourceRef = qualifyStatementId(ownerPack.id, relation.sourceClaimId);
      const targetRef = qualifyStatementId(ownerPack.id, relation.targetClaimId);
      const runtimeId = `${ownerPack.id}::${relation.id}`;
      if (seen.has(runtimeId)) continue;
      seen.add(runtimeId);
      const source = conflictSide(sourceRef, resources);
      const target = conflictSide(targetRef, resources);
      if (!source || !target) {
        unresolved.push({ runtimeId, relation, sourceRef, targetRef });
        continue;
      }
      const conflict = Object.freeze({
        runtimeId,
        ownerPackId: ownerPack.id,
        type: relation.type,
        status: relation.status ?? 'confirmed',
        reason: text(relation.reason),
        detectedBy: relation.detectedBy ?? 'package-author',
        confidence: Number.isFinite(Number(relation.confidence)) ? Number(relation.confidence) : null,
        source,
        target,
      });
      conflicts.push(conflict);
      appendIndex(byClaim, source.claimRef, conflict);
      appendIndex(byClaim, target.claimRef, conflict);
      appendIndex(bySection, statementSectionKey(source.packId, source.claim.source?.documentId, source.sectionId), conflict);
      appendIndex(bySection, statementSectionKey(target.packId, target.claim.source?.documentId, target.sectionId), conflict);
    }
  }
  return Object.freeze({ conflicts, byClaim, bySection, unresolved, resources });
}

export function statementsForSection(packs, packId, documentId, sectionId) {
  const output = [];
  for (const pack of packs ?? []) {
    if (pack.id !== packId) continue;
    for (const claim of pack.claims ?? []) {
      if (claim.source?.documentId !== documentId || claim.source?.sectionId !== sectionId) continue;
      output.push({
        ...claim,
        localId: claim.id,
        runtimeId: qualifyStatementId(pack.id, claim.id),
        packId: pack.id,
      });
    }
  }
  return output;
}

export function resolveStatement(packs, claimId) {
  const requested = text(claimId);
  if (!requested) return null;
  const qualified = requested.includes('::');
  for (const pack of packs ?? []) {
    const localId = qualified && requested.startsWith(`${pack.id}::`)
      ? requested.slice(pack.id.length + 2)
      : requested;
    const claim = (pack.claims ?? []).find((item) => item.id === localId);
    if (!claim || (qualified && qualifyStatementId(pack.id, claim.id) !== requested)) continue;
    return {
      ...claim,
      localId: claim.id,
      runtimeId: qualifyStatementId(pack.id, claim.id),
      packId: pack.id,
    };
  }
  return null;
}

export function resolveDocument(packs, documentId) {
  const requested = text(documentId);
  if (!requested) return null;
  const qualified = requested.includes('::');
  for (const pack of packs ?? []) {
    const localId = qualified && requested.startsWith(`${pack.id}::`)
      ? requested.slice(pack.id.length + 2)
      : requested;
    const document = (pack.documents ?? []).find((item) => item.id === localId);
    if (!document || (qualified && qualifyDocumentId(pack.id, document.id) !== requested)) continue;
    return {
      ...document,
      localId: document.id,
      runtimeId: qualifyDocumentId(pack.id, document.id),
      packId: pack.id,
      packTitle: pack.title,
    };
  }
  return null;
}

export function sectionConflictAnnotations(sectionText, claims, conflictIndex) {
  const sourceText = String(sectionText ?? '');
  const groups = new Map();
  for (const claim of claims ?? []) {
    const conflicts = conflictIndex?.byClaim?.get(claim.runtimeId) ?? [];
    if (!conflicts.length) continue;
    const quote = text(claim.source?.quote);
    const quoteIndex = quote ? sourceText.indexOf(quote) : -1;
    const position = quoteIndex >= 0 ? quoteIndex + quote.length : sourceText.length;
    const group = groups.get(position) ?? { position, claimRefs: new Set(), conflicts: new Map(), exact: quoteIndex >= 0 };
    group.claimRefs.add(claim.runtimeId);
    for (const conflict of conflicts) group.conflicts.set(conflict.runtimeId, conflict);
    group.exact ||= quoteIndex >= 0;
    groups.set(position, group);
  }
  return [...groups.values()]
    .sort((left, right) => left.position - right.position)
    .map((group) => ({
      position: group.position,
      claimRefs: [...group.claimRefs],
      conflicts: [...group.conflicts.values()],
      exact: group.exact,
    }));
}
