import { selectPrebuiltSearchArtifact } from '../helpers/prebuilt-search-artifacts.js';
import { buildKnowledgeState, flattenKnowledge } from '../packs.js';
import { activeDomainQueryExpanders, defineSearchPort } from './ports.js';

function orderedFingerprintParts(values) {
  return values.filter(Boolean).sort().join('|');
}

export function knowledgeCorpusFingerprint(packs = [], notes = []) {
  const packParts = packs.map((pack) => [
    pack.id,
    pack.version,
    pack.documents?.length ?? 0,
    pack.entities?.length ?? 0,
    pack.claims?.length ?? 0,
    pack.relations?.length ?? 0,
  ].join(':'));
  const noteParts = notes.map((note) => [
    note.id,
    note.updatedAt ?? note.createdAt ?? '',
    String(note.title ?? '').length,
    String(note.body ?? '').length,
    note.relation ?? 'observation',
  ].join(':'));
  return `lnote-corpus-v1:${orderedFingerprintParts(packParts)}::${orderedFingerprintParts(noteParts)}`;
}

/**
 * Compose the headless state consumed by the web shell. The function contains
 * no DOM, medical terminology, IndexedDB or WebLLM assumptions.
 */
export function composeKnowledgeRuntime({
  packRecords = [],
  notes = [],
  searchFactory,
  domainQueryPlanners = [],
}) {
  if (typeof searchFactory !== 'function') {
    throw new TypeError('composeKnowledgeRuntime requires a searchFactory function.');
  }

  const enabledPackRecords = packRecords
    .filter((record) => record?.enabled !== false && record?.pack);
  const enabledPacks = enabledPackRecords.map((record) => record.pack);
  const knowledge = buildKnowledgeState(enabledPacks, notes);
  const flattenedRecords = flattenKnowledge(enabledPacks, notes);
  const queryExpanders = activeDomainQueryExpanders(domainQueryPlanners, enabledPacks);
  const corpusFingerprint = knowledgeCorpusFingerprint(enabledPacks, notes);
  const prebuiltSearchArtifact = selectPrebuiltSearchArtifact({
    packRecords: enabledPackRecords,
    notes,
    corpusFingerprint,
  });
  const search = defineSearchPort(
    searchFactory(flattenedRecords, [...knowledge.entities.values()], {
      queryExpanders,
      corpusFingerprint,
      prebuiltSearchArtifact,
    }),
  );
  const records = search.retainsRecords === false ? [] : flattenedRecords;

  return {
    enabledPacks,
    knowledge,
    records,
    search,
    corpusFingerprint,
    prebuiltSearchArtifact,
    capabilities: Object.freeze({
      search: true,
      asynchronousSearch: Boolean(search.async),
      diskBackedSearch: search.retainsRecords === false,
      prebuiltSearchArtifact: Boolean(prebuiltSearchArtifact),
      fuzzySearch: true,
      personalOverlay: true,
      domainQueryPlannerIds: Object.freeze(
        domainQueryPlanners
          .filter((planner) => enabledPacks.some((pack) => planner.appliesToPack(pack)))
          .map((planner) => planner.id),
      ),
    }),
  };
}
