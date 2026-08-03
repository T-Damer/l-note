import { createHash } from 'node:crypto';

const ALLOWED_KINDS = new Set(['entity', 'claim', 'relation']);
const KIND_COLLECTION = Object.freeze({
  entity: 'entities',
  claim: 'claims',
  relation: 'relations',
});

function clean(value) {
  return String(value ?? '').trim();
}

function normalized(value) {
  return clean(value).normalize('NFKC').toLocaleLowerCase('ru-RU').replaceAll('ё', 'е');
}

function stableCandidateId(packId, documentId, sectionId, kind, value, index) {
  const digest = createHash('sha256')
    .update([packId, documentId, sectionId, kind, JSON.stringify(value), String(index)].join('\u241f'))
    .digest('hex')
    .slice(0, 16);
  return `semantic-review.${digest}`;
}

function contextSnippet(sectionText, quote, limit = 520) {
  const source = clean(sectionText);
  if (!source) return '';
  const needle = clean(quote);
  if (!needle) return source.slice(0, limit);
  const index = source.indexOf(needle);
  if (index < 0) return source.slice(0, limit);
  const padding = Math.max(0, Math.floor((limit - needle.length) / 2));
  const start = Math.max(0, index - padding);
  const end = Math.min(source.length, index + needle.length + padding);
  return `${start > 0 ? '…' : ''}${source.slice(start, end)}${end < source.length ? '…' : ''}`;
}

function entityData(item) {
  return {
    name: clean(item?.name),
    type: clean(item?.type) || 'term',
    aliases: [...new Set((Array.isArray(item?.aliases) ? item.aliases : [])
      .map(clean)
      .filter(Boolean))],
    description: clean(item?.description),
  };
}

function claimData(item) {
  return {
    text: clean(item?.text),
    subject: clean(item?.subject),
    object: clean(item?.object) || null,
    quote: clean(item?.quote),
  };
}

function relationData(item) {
  return {
    source: clean(item?.source),
    type: clean(item?.type),
    target: clean(item?.target),
    description: clean(item?.description),
  };
}

function candidateValidation(kind, data, sectionText) {
  if (kind === 'entity') {
    return data.name ? null : 'У понятия отсутствует название.';
  }
  if (kind === 'claim') {
    if (!data.text) return 'У утверждения отсутствует текст.';
    if (!data.quote) return 'У утверждения отсутствует точная цитата.';
    if (!sectionText.includes(data.quote)) return 'Цитата не найдена в исходном разделе.';
    return null;
  }
  if (!data.source || !data.target || !data.type) {
    return 'Для связи нужны исходное понятие, тип и целевое понятие.';
  }
  return null;
}

function normalizeCandidate({ pack, document, section, kind, item, index, provider }) {
  const data = kind === 'entity'
    ? entityData(item)
    : kind === 'claim'
      ? claimData(item)
      : relationData(item);
  const validationError = candidateValidation(kind, data, section.text);
  return {
    id: stableCandidateId(pack.id, document.id, section.id, kind, data, index),
    kind,
    decision: validationError ? 'dismiss' : 'pending',
    eligible: !validationError,
    validationError,
    provider,
    documentId: document.id,
    documentTitle: document.title,
    sectionId: section.id,
    sectionTitle: section.title,
    sourceQuote: kind === 'claim' ? data.quote : null,
    sourceContext: contextSnippet(section.text, kind === 'claim' ? data.quote : null),
    data,
  };
}

function proposalItems(proposal) {
  return [
    ['entity', Array.isArray(proposal?.entities) ? proposal.entities : []],
    ['claim', Array.isArray(proposal?.claims) ? proposal.claims : []],
    ['relation', Array.isArray(proposal?.relations) ? proposal.relations : []],
  ];
}

export function createSemanticReview({
  pack,
  sectionProposals = [],
  provider = 'unknown',
  generatedAt = new Date().toISOString(),
} = {}) {
  if (!pack?.id) throw new TypeError('A target pack is required.');
  const documents = new Map((pack.documents ?? []).map((document) => [document.id, document]));
  const candidates = [];
  for (const entry of sectionProposals) {
    const document = documents.get(entry.documentId);
    const section = document?.sections?.find((item) => item.id === entry.sectionId);
    if (!document || !section) continue;
    for (const [kind, items] of proposalItems(entry.proposal)) {
      items.forEach((item, index) => {
        candidates.push(normalizeCandidate({
          pack,
          document,
          section,
          kind,
          item,
          index,
          provider,
        }));
      });
    }
  }
  return {
    schemaVersion: 1,
    kind: 'lnote.semantic-proposal-review',
    generatedAt,
    targetPackId: pack.id,
    provider,
    instructions: 'Review every candidate. Only eligible candidates marked accept are applied to the pack.',
    candidates: candidates.sort((left, right) => (
      left.documentId.localeCompare(right.documentId)
      || left.sectionId.localeCompare(right.sectionId)
      || left.kind.localeCompare(right.kind)
      || left.id.localeCompare(right.id)
    )),
  };
}

function acceptedBySection(review) {
  const groups = new Map();
  for (const candidate of review.candidates ?? []) {
    if (candidate.decision !== 'accept') continue;
    if (!ALLOWED_KINDS.has(candidate.kind)) throw new Error(`Unsupported semantic candidate kind: ${candidate.kind}.`);
    if (!candidate.eligible || candidate.validationError) {
      throw new Error(`Candidate ${candidate.id} cannot be accepted: ${candidate.validationError ?? 'invalid proposal'}`);
    }
    const key = `${candidate.documentId}\u241f${candidate.sectionId}`;
    const group = groups.get(key) ?? {
      documentId: candidate.documentId,
      sectionId: candidate.sectionId,
      entities: [],
      claims: [],
      relations: [],
      candidates: [],
    };
    group[KIND_COLLECTION[candidate.kind]].push(candidate.data);
    group.candidates.push(candidate);
    groups.set(key, group);
  }
  return [...groups.values()];
}

function annotateReviewedRecords(pack, before, group, review, reviewedAt, reviewedBy) {
  const metadata = {
    reviewedAt,
    reviewedBy,
    proposedBy: review.provider,
  };
  for (const claim of pack.claims ?? []) {
    if (before.claims.has(claim.id)) continue;
    claim.authority = 'reviewed';
    Object.assign(claim, metadata);
  }
  for (const relation of pack.relations ?? []) {
    if (before.relations.has(relation.id)) continue;
    Object.assign(relation, metadata);
  }
  const acceptedNames = new Set(group.entities.map((item) => normalized(item.name)));
  for (const entity of pack.entities ?? []) {
    if (before.entities.has(entity.id)) continue;
    if (acceptedNames.size && !acceptedNames.has(normalized(entity.name))) continue;
    Object.assign(entity, metadata);
  }
}

export function applySemanticReview(pack, review, {
  mergeSection,
  reviewedAt = new Date().toISOString(),
  reviewedBy = 'local-reviewer',
} = {}) {
  if (review?.kind !== 'lnote.semantic-proposal-review' || review?.targetPackId !== pack?.id) {
    throw new Error('The semantic review does not belong to this pack.');
  }
  if (typeof mergeSection !== 'function') throw new TypeError('mergeSection is required.');
  const output = structuredClone(pack);
  for (const group of acceptedBySection(review)) {
    const document = output.documents.find((item) => item.id === group.documentId);
    const section = document?.sections?.find((item) => item.id === group.sectionId);
    if (!document || !section) throw new Error(`Reviewed source ${group.documentId}/${group.sectionId} no longer exists.`);
    const before = {
      entities: new Set(output.entities.map((item) => item.id)),
      claims: new Set(output.claims.map((item) => item.id)),
      relations: new Set(output.relations.map((item) => item.id)),
    };
    mergeSection(output, document, section, {
      entities: group.entities,
      claims: group.claims,
      relations: group.relations,
    });
    annotateReviewedRecords(output, before, group, review, reviewedAt, reviewedBy);
  }
  for (const document of output.documents) {
    for (const section of document.sections) section.entityIds = [...new Set(section.entityIds ?? [])].sort();
  }
  output.entities.sort((left, right) => left.name.localeCompare(right.name, output.language ?? 'ru'));
  output.claims.sort((left, right) => left.id.localeCompare(right.id));
  output.relations.sort((left, right) => left.id.localeCompare(right.id));
  return output;
}
