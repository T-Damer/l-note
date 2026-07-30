import {
  createIndexedDbStoragePort,
  createMiniSearchPort,
  createWebLlmPort,
} from './adapters/runtime-adapters.js';
import {
  composeKnowledgeApplicationRuntime,
  defineKnowledgeApplicationAdapter,
} from './core/application-adapter.js';
import { minimedDomainQueryPlanner } from './domain-plugins/minimed.js';

const storagePort = createIndexedDbStoragePort();
const domainQueryPlanners = [minimedDomainQueryPlanner];
const localModelPort = createWebLlmPort();
const applicationAdapter = defineKnowledgeApplicationAdapter({
  id: 'lnote.web',
  storagePort,
  searchFactory: createMiniSearchPort,
  domainQueryPlanners,
  localModelPort,
  metadata: {
    platform: 'web',
    domainNeutralCore: true,
    medicalPolicyOwner: 'minimed',
  },
});

state.storage = applicationAdapter.storagePort;
state.search = createMiniSearchPort([], []);
state.localAi = applicationAdapter.localModelPort;
state.applicationAdapter = applicationAdapter;

renderSidebarStatus = function renderSidebarStatusThroughStoragePort() {
  const enabled = state.packRecords.filter((record) => record.enabled);
  const offline = !navigator.onLine;
  dom.sidebarStatus.replaceChildren(
    create('strong', { text: offline ? 'Оффлайн-режим' : 'Локальное хранилище' }),
    create('span', {
      text: `${enabled.length} пак. · ${applicationAdapter.storagePort.mode() === 'persistent' ? 'IndexedDB' : 'память вкладки'}`,
    }),
  );
};

installPack = async function installPackThroughStoragePort(pack, source = {}) {
  const validation = validatePack(pack);
  if (!validation.valid) throw new Error(validation.errors.join('\n'));
  const previous = await applicationAdapter.storagePort.getOne('packs', pack.id);
  await applicationAdapter.storagePort.putOne('packs', {
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

refreshState = async function refreshStateThroughApplicationAdapter() {
  state.packRecords = await applicationAdapter.storagePort.getAll('packs');
  state.notes = (await applicationAdapter.storagePort.getAll('notes')).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));

  const runtime = composeKnowledgeApplicationRuntime({
    adapter: applicationAdapter,
    packRecords: state.packRecords,
    notes: state.notes,
  });
  Object.assign(state, runtime);

  dom.searchEngineStatus.textContent = `${state.search.kind}: ${state.search.count} записей`;
  dom.notesCount.textContent = state.notes.length ? String(state.notes.length) : '';
  renderSidebarStatus();
  await Promise.all([renderCatalog(), renderNotes(), renderStorageSummary()]);
  renderLibraryGraph();
  renderSearchEmpty();
  renderSuggestions();
  if (state.currentQuery) runSearch(state.currentQuery);
  state.ready = true;
  applyRouteFromLocation();
};
