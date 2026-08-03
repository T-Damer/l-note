import { createAdaptiveSearchPort } from './adapters/adaptive-search.js';
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
import { createInstalledPackRecord } from './services/installed-pack-record.js';

const storagePort = createIndexedDbStoragePort();
const domainQueryPlanners = [minimedDomainQueryPlanner];
const localModelPort = createWebLlmPort();
const speechRecognitionPort = createBrowserSpeechRecognitionPort();
const evidenceVerifierPort = createLexicalEvidenceVerifier();
const applicationAdapter = defineKnowledgeApplicationAdapter({
  id: 'lnote.web',
  storagePort,
  searchFactory: createAdaptiveSearchPort,
  domainQueryPlanners,
  localModelPort,
  speechRecognitionPort,
  evidenceVerifierPort,
  metadata: {
    platform: 'web',
    domainNeutralCore: true,
    medicalPolicyOwner: 'minimed',
  },
});

state.storage = applicationAdapter.storagePort;
state.search = createMiniSearchPort([], []);
state.localAi = applicationAdapter.localModelPort;
state.speechRecognition = applicationAdapter.speechRecognitionPort;
state.evidenceVerifier = applicationAdapter.evidenceVerifierPort;
state.applicationAdapter = applicationAdapter;

renderSidebarStatus = function renderSidebarStatusThroughStoragePort() {
  const offline = !navigator.onLine;
  const persistent = applicationAdapter.storagePort.mode() === 'persistent';
  dom.sidebarStatus.replaceChildren(
    create('strong', { text: offline ? 'Оффлайн-режим' : 'Локальное хранилище' }),
    create('span', {
      text: persistent ? 'Данные сохраняются в IndexedDB' : 'Данные живут до закрытия вкладки',
    }),
  );
};

installPack = async function installPackThroughStoragePort(pack, source = {}) {
  const validation = validatePack(pack);
  if (!validation.valid) throw new Error(validation.errors.join('\n'));
  const previous = await applicationAdapter.storagePort.getOne('packs', pack.id);
  await applicationAdapter.storagePort.putOne('packs', createInstalledPackRecord({
    pack,
    previous,
    source,
    fallbackSizeBytes: packByteSize(pack),
  }));
  await refreshState();
};

function updateSearchBackendStatus(search) {
  if (!search.async) {
    dom.searchEngineStatus.textContent = `${search.kind}: ${search.count} записей`;
    return;
  }
  dom.searchEngineStatus.textContent = `Дисковый индекс: подготовка ${search.count} записей…`;
  search.ready.then((stats) => {
    if (state.search !== search) return;
    const fallback = stats.storage === 'memory-fallback' ? ' · fallback в памяти' : '';
    dom.searchEngineStatus.textContent = `${search.kind}: ${stats.recordCount} записей${fallback}`;
  }).catch((error) => {
    if (state.search !== search) return;
    dom.searchEngineStatus.textContent = `Ошибка дискового индекса: ${error.message}`;
  });
}

refreshState = async function refreshStateThroughApplicationAdapter() {
  state.packRecords = await applicationAdapter.storagePort.getAll('packs');
  state.notes = (await applicationAdapter.storagePort.getAll('notes')).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));

  const previousSearch = state.search;
  const runtime = composeKnowledgeApplicationRuntime({
    adapter: applicationAdapter,
    packRecords: state.packRecords,
    notes: state.notes,
  });
  Object.assign(state, runtime);
  if (previousSearch !== state.search) previousSearch?.close?.();

  updateSearchBackendStatus(state.search);
  dom.notesCount.textContent = state.notes.length ? String(state.notes.length) : '';
  renderSidebarStatus();
  await Promise.all([renderCatalog(), renderNotes(), renderStorageSummary()]);
  renderLibraryGraph();
  renderSearchEmpty();
  await renderSuggestions();
  if (state.currentQuery) await runSearch(state.currentQuery);
  state.ready = true;
  applyRouteFromLocation();
};
