    toast(error instanceof Error ? error.message : String(error), 'error');
  }
}

function bindDialogCloseBehavior(dialog) {
  return bindRoutedDialog(dialog, () => closeResourceChain());
}

function bindEvents() {
  for (const button of dom.navButtons) button.addEventListener('click', () => routeTo(button.dataset.nav));
  document.querySelectorAll('[data-action="open-library"]').forEach((button) => button.addEventListener('click', () => routeTo('library')));
  document.querySelectorAll('[data-action="new-note"]').forEach((button) => button.addEventListener('click', () => navigateResource('note', 'new')));
  document.querySelectorAll('[data-action="close-resource-chain"]').forEach((button) => button.addEventListener('click', () => closeResourceChain()));
  document.querySelectorAll('[data-action="resource-back"]').forEach((button) => button.addEventListener('click', goBackInResourceChain));
  document.querySelectorAll('[data-action="export-notes"]').forEach((button) => button.addEventListener('click', () => downloadJson(`l-note-notes-${new Date().toISOString().slice(0, 10)}.json`, { schemaVersion: 1, exportedAt: new Date().toISOString(), notes: state.notes })));

  for (const dialog of [dom.documentDialog, dom.entityDialog, dom.noteDialog]) bindDialogCloseBehavior(dialog);

  dom.searchForm.addEventListener('submit', (event) => {
    event.preventDefault();
    runSearch(dom.searchInput.value);
  });
  dom.personalPriority.addEventListener('change', () => state.currentQuery && runSearch(state.currentQuery));
  dom.askForm.addEventListener('submit', handleAsk);
  document.querySelector('[data-action="load-local-ai"]').addEventListener('click', (event) => loadOrRunLocalAi(event.currentTarget));
  dom.noteForm.addEventListener('submit', saveCurrentNote);
  dom.noteTitle.addEventListener('input', () => noteResourceView.renderPreview());
  dom.noteBody.addEventListener('input', () => noteResourceView.renderPreview());
  dom.deleteNoteButton.addEventListener('click', deleteCurrentNote);
  dom.packFileInput.addEventListener('change', async () => {
    const file = dom.packFileInput.files?.[0];
    if (file) await importPackFile(file);
    dom.packFileInput.value = '';
  });
  dom.notesFileInput.addEventListener('change', async () => {
    const file = dom.notesFileInput.files?.[0];
    if (file) await importNotesFile(file);
    dom.notesFileInput.value = '';
  });
  window.addEventListener('popstate', () => applyRouteFromLocation());
  window.addEventListener('hashchange', () => applyRouteFromLocation());
  window.addEventListener('online', renderSidebarStatus);
  window.addEventListener('offline', renderSidebarStatus);
}

async function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) return;
  try {
    await navigator.serviceWorker.register('./service-worker.js', { scope: './' });
  } catch (error) {
    console.warn('Service worker registration failed', error);
  }
}

async function bootstrap() {
  ensureInitialRouteHistory();
  bindEvents();
  applyRouteFromLocation();
  await registerServiceWorker();
  try {
    await loadCatalog();
  } catch (error) {
    toast(error instanceof Error ? error.message : String(error), 'error');
  }
  await refreshState();
}
