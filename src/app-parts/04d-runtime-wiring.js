import {
  createIndexedDbStoragePort,
  createMiniSearchPort,
  createWebLlmPort,
} from './adapters/runtime-adapters.js';
import { composeKnowledgeRuntime } from './core/runtime.js';
import { minimedDomainQueryPlanner } from './domain-plugins/minimed.js';

const storagePort = createIndexedDbStoragePort();
const domainQueryPlanners = [minimedDomainQueryPlanner];

state.localAi = createWebLlmPort();

installPack = async function installPackThroughStoragePort(pack, source = {}) {
  const validation = validatePack(pack);
  if (!validation.valid) throw new Error(validation.errors.join('\n'));
  const previous = await storagePort.getOne('packs', pack.id);
  await storagePort.putOne('packs', {
    id: pack.id,
    enabled: previous?.enabled ?? true,
    installedAt: new Date().toISOString(),
    sizeBytes: source.sizeBytes ?? packByteSize(pack),
    sourceUrl: source.url ?? previous?.sourceUrl ?? null,
    sha256: source.sha256 ?? previous?.sha256 ?? null,
    pack,
  });
  await refreshState();
};

refreshState = async function refreshStateThroughRuntime() {
  state.packRecords = await storagePort.getAll('packs');
  state.notes = (await storagePort.getAll('notes')).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));

  const runtime = composeKnowledgeRuntime({
    packRecords: state.packRecords,
    notes: state.notes,
    searchFactory: createMiniSearchPort,
    domainQueryPlanners,
  });
  Object.assign(state, runtime);

  dom.searchEngineStatus.textContent = `${state.search.kind}: ${state.search.count} записей`;
  dom.notesCount.textContent = state.notes.length ? String(state.notes.length) : '';
  renderSidebarStatus();
  await Promise.all([renderCatalog(), renderNotes(), renderStorageSummary()]);
  renderSearchEmpty();
  renderSuggestions();
  if (state.currentQuery) runSearch(state.currentQuery);
  state.ready = true;
  applyRouteFromLocation();
};
