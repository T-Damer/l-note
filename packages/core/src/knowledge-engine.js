import { FuzzyKnowledgeSearch } from '../../search/src/index.js';
import { referenceKey } from '../../contracts/src/index.js';

function uniqueBy(items, keyOf) {
  const seen = new Set();
  return items.filter((item) => {
    const key = keyOf(item);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export class KnowledgeEngine {
  constructor({ packs = [], notes = [] } = {}) {
    this.packs = [];
    this.notes = [];
    this.packMap = new Map();
    this.noteMap = new Map();
    this.searchIndex = new FuzzyKnowledgeSearch();
    this.setPacks(packs);
    this.setNotes(notes);
  }

  setPacks(packs) {
    this.packs = [...packs];
    this.packMap = new Map(this.packs.map((pack) => [pack.manifest.id, pack]));
    this.#rebuild();
  }

  setNotes(notes) {
    this.notes = [...notes];
    this.noteMap = new Map(this.notes.map((note) => [note.id, note]));
    this.#rebuild();
  }

  #rebuild() {
    if (!this.searchIndex) return;
    this.searchIndex.rebuild(this.packs, this.notes);
  }

  stats() {
    let documents = 0;
    let chunks = 0;
    let entities = 0;
    let claims = 0;

    for (const pack of this.packs) {
      documents += pack.documents.length;
      entities += pack.entities.length;
      claims += pack.claims.length;
      for (const document of pack.documents) {
        for (const section of document.sections) chunks += section.chunks.length;
      }
    }

    return {
      packs: this.packs.length,
      documents,
      chunks,
      entities,
      claims,
      notes: this.notes.length,
    };
  }

  listPacks() {
    return [...this.packs];
  }

  getPack(packId) {
    return this.packMap.get(packId) ?? null;
  }

  search(query, options) {
    return this.searchIndex.search(query, options);
  }

  suggest(query, options) {
    return this.searchIndex.suggest(query, options);
  }

  resolveResult(result) {
    if (result.kind === 'note') {
      const note = this.noteMap.get(result.noteId);
      return note ? { kind: 'note', note } : null;
    }

    const pack = this.packMap.get(result.packId);
    if (!pack) return null;
    const document = pack.documents.find((candidate) => candidate.id === result.documentId);
    const section = document?.sections.find((candidate) => candidate.id === result.sectionId);
    const chunk = section?.chunks.find((candidate) => candidate.id === result.chunkId);
    if (!document || !section || !chunk) return null;

    const entities = chunk.entityIds
      .map((entityId) => pack.entities.find((entity) => entity.id === entityId))
      .filter(Boolean);
    const claims = pack.claims.filter((claim) =>
      claim.evidence.some(
        (evidence) => evidence.documentId === document.id && evidence.chunkId === chunk.id,
      ),
    );

    return {
      kind: 'source',
      pack,
      document,
      section,
      chunk,
      entities,
      claims,
    };
  }

  resolveEvidence(packId, evidence) {
    const pack = this.packMap.get(packId);
    if (!pack) return null;
    const document = pack.documents.find((candidate) => candidate.id === evidence.documentId);
    const section = document?.sections.find((candidate) =>
      evidence.sectionId ? candidate.id === evidence.sectionId : true,
    );
    const chunk = document?.sections
      .flatMap((candidate) => candidate.chunks)
      .find((candidate) => candidate.id === evidence.chunkId);
    if (!document || !section || !chunk) return null;
    return { pack, document, section, chunk, evidence };
  }

  listEntityReferences() {
    return this.packs.flatMap((pack) =>
      pack.entities.map((entity) => ({
        packId: pack.manifest.id,
        packTitle: pack.manifest.title,
        itemId: entity.id,
        title: entity.canonicalName,
        type: entity.type,
      })),
    );
  }

  listClaimReferences() {
    return this.packs.flatMap((pack) =>
      pack.claims.map((claim) => ({
        packId: pack.manifest.id,
        packTitle: pack.manifest.title,
        itemId: claim.id,
        title: this.formatClaim(pack.manifest.id, claim),
      })),
    );
  }

  getEntityContext(reference) {
    const pack = this.packMap.get(reference.packId);
    if (!pack) return null;
    const entity = pack.entities.find((candidate) => candidate.id === reference.itemId);
    if (!entity) return null;

    const claims = pack.claims.filter(
      (claim) =>
        claim.subjectEntityId === entity.id || claim.objectEntityId === entity.id,
    );
    const outgoing = pack.relations.filter((relation) => relation.sourceEntityId === entity.id);
    const incoming = pack.relations.filter((relation) => relation.targetEntityId === entity.id);
    const mentions = [];

    for (const document of pack.documents) {
      for (const section of document.sections) {
        for (const chunk of section.chunks) {
          if (chunk.entityIds.includes(entity.id)) {
            mentions.push({ document, section, chunk });
          }
        }
      }
    }

    const linkedNotes = this.notes.filter((note) =>
      note.entityLinks.some((link) => referenceKey(link) === referenceKey(reference)),
    );

    return { pack, entity, claims, outgoing, incoming, mentions, linkedNotes };
  }

  getClaimContext(reference) {
    const pack = this.packMap.get(reference.packId);
    if (!pack) return null;
    const claim = pack.claims.find((candidate) => candidate.id === reference.itemId);
    if (!claim) return null;

    const links = pack.claimLinks
      .filter((link) => link.fromClaimId === claim.id || link.toClaimId === claim.id)
      .map((link) => ({
        ...link,
        otherClaim:
          pack.claims.find((candidate) =>
            candidate.id === (link.fromClaimId === claim.id ? link.toClaimId : link.fromClaimId),
          ) ?? null,
      }));
    const evidence = claim.evidence
      .map((locator) => this.resolveEvidence(reference.packId, locator))
      .filter(Boolean);

    return { pack, claim, links, evidence };
  }

  formatClaim(packId, claim) {
    const pack = this.packMap.get(packId);
    if (!pack) return claim.predicate;
    const subject = pack.entities.find((entity) => entity.id === claim.subjectEntityId);
    const object = claim.objectEntityId
      ? pack.entities.find((entity) => entity.id === claim.objectEntityId)
      : null;
    const value = object?.canonicalName ?? claim.value;
    return [subject?.canonicalName ?? claim.subjectEntityId, claim.predicate, value]
      .filter((part) => part !== null && part !== undefined && part !== '')
      .join(' — ');
  }

  buildEvidenceBundle(question, { limit = 8 } = {}) {
    const results = this.search(question, { limit });
    const sources = [];
    const selectedClaimRefs = [];
    const selectedEntityRefs = [];

    for (const result of results) {
      const resolved = this.resolveResult(result);
      if (!resolved) continue;
      if (resolved.kind === 'note') {
        sources.push({
          id: `note:${resolved.note.id}`,
          sourceKind: 'personal',
          title: resolved.note.title,
          section: 'Личная заметка',
          text: resolved.note.body,
          score: result.score,
          entityRefs: resolved.note.entityLinks,
        });
        selectedEntityRefs.push(...resolved.note.entityLinks);
        continue;
      }

      const sourceId = `${resolved.pack.manifest.id}:${resolved.document.id}:${resolved.chunk.id}`;
      const entityRefs = resolved.entities.map((entity) => ({
        packId: resolved.pack.manifest.id,
        itemId: entity.id,
      }));
      const claimRefs = resolved.claims.map((claim) => ({
        packId: resolved.pack.manifest.id,
        itemId: claim.id,
      }));
      sources.push({
        id: sourceId,
        sourceKind: 'reference',
        packId: resolved.pack.manifest.id,
        packTitle: resolved.pack.manifest.title,
        title: resolved.document.title,
        section: resolved.section.title,
        anchor: resolved.chunk.anchor,
        text: resolved.chunk.text,
        score: result.score,
        entityRefs,
        claimRefs,
      });
      selectedEntityRefs.push(...entityRefs);
      selectedClaimRefs.push(...claimRefs);
    }

    const entityRefs = uniqueBy(selectedEntityRefs, referenceKey);
    const claimRefs = uniqueBy(selectedClaimRefs, referenceKey);

    for (const entityRef of entityRefs) {
      const context = this.getEntityContext(entityRef);
      if (!context) continue;
      for (const claim of context.claims) {
        claimRefs.push({ packId: entityRef.packId, itemId: claim.id });
      }
    }

    const uniqueClaimRefs = uniqueBy(claimRefs, referenceKey);
    const claims = uniqueClaimRefs
      .map((reference) => {
        const context = this.getClaimContext(reference);
        if (!context) return null;
        return {
          id: `${reference.packId}:${context.claim.id}`,
          packId: reference.packId,
          text: this.formatClaim(reference.packId, context.claim),
          predicate: context.claim.predicate,
          qualifiers: context.claim.qualifiers,
          authority: context.claim.authority,
          confidence: context.claim.confidence,
          sourceKind: context.claim.sourceKind,
          evidenceSourceIds: context.evidence.map(
            (item) => `${reference.packId}:${item.document.id}:${item.chunk.id}`,
          ),
        };
      })
      .filter(Boolean);

    const claimIdSet = new Set(claims.map((claim) => claim.id));
    const claimLinks = [];
    for (const pack of this.packs) {
      for (const link of pack.claimLinks) {
        const from = `${pack.manifest.id}:${link.fromClaimId}`;
        const to = `${pack.manifest.id}:${link.toClaimId}`;
        if (claimIdSet.has(from) || claimIdSet.has(to)) {
          claimLinks.push({ from, to, relation: link.relation, reason: link.reason });
        }
      }
    }

    const personalClaims = this.notes
      .filter((note) => note.personalClaim)
      .filter((note) => {
        const subjectKey = referenceKey(note.personalClaim.subject);
        return entityRefs.some((reference) => referenceKey(reference) === subjectKey);
      })
      .map((note) => ({
        id: `note:${note.id}:claim`,
        noteId: note.id,
        title: note.title,
        subject: note.personalClaim.subject,
        predicate: note.personalClaim.predicate,
        value: note.personalClaim.value,
        relationTo: note.personalClaim.relationTo,
      }));

    return {
      schemaVersion: 1,
      question,
      createdAt: new Date().toISOString(),
      policy: {
        retrievalFirst: true,
        requireSourceIds: true,
        distinguishPersonalClaims: true,
        reportContradictions: true,
        abstainWhenUnsupported: true,
      },
      sources,
      claims,
      claimLinks,
      personalClaims,
    };
  }
}
