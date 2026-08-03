import { selectPrebuiltSearchArtifact } from '../helpers/prebuilt-search-artifacts.js';
import { buildKnowledgeState, flattenKnowledge } from '../packs.js';
import { activeDomainQueryExpanders, defineSearchPort } from './ports.js';

const FINGERPRINT_SKIP_KEYS = new Set(['searchArtifacts']);

function mixFingerprint(state, value) {
  const code = Number(value) & 0xffff;
  state.first = Math.imul(state.first ^ code, 0x01000193) >>> 0;
  state.second = Math.imul(state.second ^ code, 0x85ebca6b) >>> 0;
  state.second = (state.second ^ (state.second >>> 13)) >>> 0;
}

function mixText(state, value) {
  const text = String(value);
  mixFingerprint(state, text.length);
  for (let index = 0; index < text.length; index += 1) {
    mixFingerprint(state, text.charCodeAt(index));
  }
}

function mixValue(state, value) {
  if (value === null) {
    mixText(state, 'null');
    return;
  }
  if (Array.isArray(value)) {
    mixText(state, 'array');
    mixFingerprint(state, value.length);
    for (const item of value) mixValue(state, item);
    return;
  }
  if (typeof value === 'object') {
    mixText(state, 'object');
    const keys = Object.keys(value)
      .filter((key) => !FINGERPRINT_SKIP_KEYS.has(key))
      .sort();
    mixFingerprint(state, keys.length);
    for (const key of keys) {
      mixText(state, key);
      mixValue(state, value[key]);
    }
    return;
  }
  mixText(state, typeof value);
  mixText(state, value);
}

function hexadecimal(value) {
  return value.toString(16).padStart(8, '0');
}

export function knowledgeCorpusFingerprint(packs = [], notes = []) {
  const state = {
    first: 0x811c9dc5,
    second: 0x9e3779b9,
  };
  mixText(state, 'lnote-corpus-v2');
  mixValue(state, packs);
  mixValue(state, notes);
  return `lnote-corpus-v2:${hexadecimal(state.first)}${hexadecimal(state.second)}`;
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
