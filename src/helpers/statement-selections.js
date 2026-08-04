import {
  qualifyDocumentId,
  qualifyStatementId,
} from './statement-conflicts.js';

function text(value) {
  return String(value ?? '').trim();
}

function unique(values) {
  return [...new Set(values)];
}

function normalizedRefs(packId, values) {
  return unique((values ?? [])
    .map((value) => qualifyStatementId(packId, value))
    .filter(Boolean));
}

export function validateStatementSelections(pack) {
  const selections = pack?.statementSelections;
  if (selections === undefined) return [];
  if (!Array.isArray(selections)) return ['statementSelections must be an array'];

  const errors = [];
  const localClaims = new Set((pack.claims ?? []).map((claim) => qualifyStatementId(pack.id, claim?.id)));
  const ids = new Set();
  const groupKeys = new Set();

  for (const [index, selection] of selections.entries()) {
    const path = `statementSelections[${index}]`;
    const id = text(selection?.id);
    const groupKey = text(selection?.groupKey);
    const claimRefs = normalizedRefs(pack.id, selection?.claimRefs);
    const preferredRefs = normalizedRefs(pack.id, selection?.preferredClaimRefs);

    if (!id) errors.push(`${path}.id must be a non-empty string`);
    else if (ids.has(id)) errors.push(`duplicate statement selection id: ${id}`);
    if (id) ids.add(id);

    if (!groupKey) errors.push(`${path}.groupKey must be a non-empty string`);
    else if (groupKeys.has(groupKey)) errors.push(`duplicate statement selection groupKey: ${groupKey}`);
    if (groupKey) groupKeys.add(groupKey);

    if (!Array.isArray(selection?.claimRefs) || claimRefs.length < 2) {
      errors.push(`${path}.claimRefs must contain at least two unique statements`);
    }
    if (!Array.isArray(selection?.preferredClaimRefs) || preferredRefs.length < 1) {
      errors.push(`${path}.preferredClaimRefs must contain at least one statement`);
    }
    for (const ref of preferredRefs) {
      if (!claimRefs.includes(ref)) errors.push(`${path}.preferredClaimRefs contains a statement outside claimRefs: ${ref}`);
    }
    for (const ref of claimRefs) {
      if (ref.startsWith(`${pack.id}::`) && !localClaims.has(ref)) {
        errors.push(`${path} references unknown local statement ${ref}`);
      }
    }

    if (selection?.status !== undefined && selection.status !== 'confirmed') {
      errors.push(`${path}.status must be confirmed`);
    }
    if (!text(selection?.reason)) errors.push(`${path}.reason must be a non-empty string`);
    if (!text(selection?.reviewedAt)) errors.push(`${path}.reviewedAt must be a non-empty string`);
    if (!text(selection?.reviewedBy)) errors.push(`${path}.reviewedBy must be a non-empty string`);
    if (selection?.validAt !== undefined && !text(selection.validAt)) {
      errors.push(`${path}.validAt must be a non-empty string when present`);
    }
    if (selection?.scope !== undefined && !text(selection.scope)) {
      errors.push(`${path}.scope must be a non-empty string when present`);
    }
  }
  return errors;
}

function indexResources(packs) {
  const claims = new Map();
  const documents = new Map();
  const packsById = new Map();
  for (const pack of packs ?? []) {
    packsById.set(pack.id, pack);
    for (const document of pack.documents ?? []) {
      documents.set(qualifyDocumentId(pack.id, document.id), { ...document, packId: pack.id });
    }
    for (const claim of pack.claims ?? []) {
      const claimRef = qualifyStatementId(pack.id, claim.id);
      claims.set(claimRef, { ...claim, claimRef, packId: pack.id });
    }
  }
  return { claims, documents, packsById };
}

function selectionSide(claimRef, resources) {
  const claim = resources.claims.get(claimRef);
  if (!claim) return null;
  const pack = resources.packsById.get(claim.packId);
  const documentRef = qualifyDocumentId(claim.packId, claim.source?.documentId);
  const document = resources.documents.get(documentRef);
  return Object.freeze({
    claimRef,
    claim,
    packId: claim.packId,
    packTitle: pack?.title ?? claim.packId,
    documentRef,
    documentTitle: document?.title ?? claim.source?.documentId ?? 'Документ',
    sectionId: claim.source?.sectionId ?? null,
    quote: claim.source?.quote ?? claim.text,
  });
}

function append(map, key, value) {
  const values = map.get(key) ?? [];
  values.push(value);
  map.set(key, values);
}

export function buildStatementSelectionIndex(packs = []) {
  const resources = indexResources(packs);
  const selections = [];
  const byClaim = new Map();
  const byGroup = new Map();
  const unresolved = [];

  for (const ownerPack of packs ?? []) {
    for (const record of ownerPack.statementSelections ?? []) {
      if (record?.status !== undefined && record.status !== 'confirmed') continue;
      const claimRefs = normalizedRefs(ownerPack.id, record.claimRefs);
      const preferredClaimRefs = normalizedRefs(ownerPack.id, record.preferredClaimRefs);
      const sides = claimRefs.map((ref) => selectionSide(ref, resources));
      const runtimeId = `${ownerPack.id}::${record.id}`;
      if (sides.some((side) => !side)) {
        unresolved.push(Object.freeze({ runtimeId, ownerPackId: ownerPack.id, record, claimRefs }));
        continue;
      }
      const preferred = new Set(preferredClaimRefs);
      const selection = Object.freeze({
        runtimeId,
        ownerPackId: ownerPack.id,
        ownerPackTitle: ownerPack.title,
        id: record.id,
        groupKey: record.groupKey,
        claimRefs,
        preferredClaimRefs,
        reason: text(record.reason),
        scope: text(record.scope) || null,
        validAt: text(record.validAt) || null,
        reviewedAt: record.reviewedAt,
        reviewedBy: record.reviewedBy,
        sides,
      });
      selections.push(selection);
      append(byGroup, selection.groupKey, selection);
      for (const side of sides) {
        append(byClaim, side.claimRef, Object.freeze({
          selection,
          preferred: preferred.has(side.claimRef),
        }));
      }
    }
  }

  return Object.freeze({ selections, byClaim, byGroup, unresolved, resources });
}

export function statementSelectionLabel(entry) {
  return entry?.preferred ? 'Текущее или предпочтительное' : 'Историческое или альтернативное';
}
