import { exportWorkspace, getEntities, listInstalledPacks } from './db.js';
import {
  configurePacksUI,
  importPackFile,
  loadCatalog,
  renderPacks,
} from './packs-ui.js';
import { renderNotes, resetNoteForm, startNoteFromResult, submitNote } from './notes-ui.js';
import {
  handleGenerateAnswer,
  handleLoadModel,
  renderResearchState,
  runResearch,
} from './research-ui.js';
import { rebuildSearchIndex } from './search.js';
import {
  configureSearchUI,
  renderPackFilter,
  renderSearchResults,
  runSearch,
} from './search-ui.js';
import { appBase, state } from './state.js';
import { $, $$, node, routeTo, toast } from './ui.js';

async function refreshLocalState({ rebuild = false } = {}) {
  [state.installed, state.entities] = await Promise.all([
    listInstalledPacks(),
    getEntities(),
  ]);
  if (rebuild) await rebuildSearchIndex();
  renderPackFilter();
  renderStatus();
  renderSearchResults();
}

function renderStatus() {
  const online = navigator.onLine;
  $('#network-status').textContent = online ? 'онлайн' : 'офлайн';
  $('#network-status').className = `status-pill ${
    online ? 'status-pill--online' : 'status-pill--offline'
  }`;
  $('#installed-count').textContent = `${state.installed.length} пакет(ов)`;
}

function applyRoute() {
  const route = location.hash.replace(/^#\/?/u, '') || 'search';
  $$('.route').forEach((section) =>
    section.toggleAttribute('hidden', section.dataset.route !== route),
  );
  $$('.nav-button').forEach((button) => {
    const active = button.dataset.route === route;
    button.classList.toggle('is-active', active);
    button.setAttribute('aria-current', active ? 'page' : 'false');
  });
  if (route === 'packs') renderPacks();
  if (route === 'notes') renderNotes();
  if (route === 'research') renderResearchState();
}

async function downloadWorkspace() {
  const workspace = await exportWorkspace();
  const blob = new Blob([JSON.stringify(workspace, null, 2)], {
    type: 'application/json',
  });
  const url = URL.createObjectURL(blob);
  const anchor = node('a', {
    href: url,
    download: `l-note-workspace-${new Date().toISOString().slice(0, 10)}.json`,
  });
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

async function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) return;
  try {
    await navigator.serviceWorker.register(new URL('sw.js', appBase), { scope: './' });
  } catch (error) {
    console.warn('Service worker registration failed', error);
  }
}

function bindEvents() {
  $$('.nav-button').forEach((button) =>
    button.addEventListener('click', () => routeTo(button.dataset.route)),
  );
  window.addEventListener('hashchange', applyRoute);
  window.addEventListener('online', renderStatus);
  window.addEventListener('offline', renderStatus);
  $('#search-form').addEventListener('submit', (event) => {
    event.preventDefault();
    runSearch();
  });
  $$('.example-query').forEach((button) =>
    button.addEventListener('click', () => {
      $('#search-input').value = button.dataset.query;
      runSearch();
    }),
  );
  $('#pack-file').addEventListener('change', (event) =>
    importPackFile(event.target.files?.[0]),
  );
  $('#workspace-export').addEventListener('click', downloadWorkspace);
  $('#note-form').addEventListener('submit', submitNote);
  $('#note-reset').addEventListener('click', () => resetNoteForm());
  $('#research-form').addEventListener('submit', (event) => {
    event.preventDefault();
    runResearch();
  });
  $('#ai-load').addEventListener('click', handleLoadModel);
  $('#ai-generate').addEventListener('click', handleGenerateAnswer);
  $('#entity-dialog-close').addEventListener('click', () => $('#entity-dialog').close());
}

async function init() {
  configurePacksUI({
    onKnowledgeChanged: () => refreshLocalState({ rebuild: true }),
  });
  configureSearchUI({ onStartNote: startNoteFromResult });
  bindEvents();
  await Promise.all([loadCatalog(), registerServiceWorker()]);
  await refreshLocalState({ rebuild: true });
  renderPacks();
  await renderNotes();
  applyRoute();

  if (!state.installed.length) $('#onboarding').removeAttribute('hidden');
  else $('#onboarding').setAttribute('hidden', '');
}

init().catch((error) => {
  console.error(error);
  toast(`Приложение не запустилось: ${error.message}`, 'error');
});
