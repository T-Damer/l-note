import { buildKnowledgeState, flattenKnowledge } from '../packs.js';
import { activeDomainQueryExpanders, defineSearchPort } from './ports.js';

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

  const enabledPacks = packRecords
    .filter((record) => record?.enabled !== false && record?.pack)
    .map((record) => record.pack);
  const knowledge = buildKnowledgeState(enabledPacks, notes);
  const records = flattenKnowledge(enabledPacks, notes);
  const queryExpanders = activeDomainQueryExpanders(domainQueryPlanners, enabledPacks);
  const search = defineSearchPort(
    searchFactory(records, [...knowledge.entities.values()], { queryExpanders }),
  );

  return {
    enabledPacks,
    knowledge,
    records,
    search,
    capabilities: Object.freeze({
      search: true,
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
