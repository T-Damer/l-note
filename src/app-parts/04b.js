    toast(error instanceof Error ? error.message : String(error), 'error');
  }
}

async function importNotesFile(file) {
  try {
    const payload = JSON.parse(await file.text());
    const notes = Array.isArray(payload) ? payload : payload.notes;
    if (!Array.isArray(notes)) throw new Error('Файл не содержит массива notes.');
    let imported = 0;
    for (const input of notes) {
      if (!input || typeof input.title !== 'string' || typeof input.body !== 'string') continue;
      const now = new Date().toISOString();
      await storagePort.putOne('notes', {
        id: typeof input.id === 'string' ? input.id : crypto.randomUUID(),
        title: input.title.slice(0, 160),
        body: input.body.slice(0, 12000),
        relation: ['observation', 'refines', 'contradicts', 'supports', 'supersedes'].includes(input.relation) ? input.relation : 'observation',
        relationLabel: relationLabel(input.relation),
        targetClaimId: typeof input.targetClaimId === 'string' ? input.targetClaimId : null,
        relatedEntityIds: Array.isArray(input.relatedEntityIds) ? input.relatedEntityIds.filter((id) => typeof id === 'string') : [],
        createdAt: input.createdAt ?? now,
        updatedAt: input.updatedAt ?? now,
      });
      imported += 1;
    }
    await refreshState();
    toast(`Импортировано заметок: ${imported}.`);
  } catch (error) {
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
  dom.noteTitle.addEventListener('input', updateNoteRelatedPreview);
  dom.noteBody.addEventListener('input', updateNoteRelatedPreview);
  dom.deleteNoteButton.addEventListener('click', async () => {
    const id = dom.noteId.value;
    if (!id || !confirm('Удалить эту заметку?')) return;
    closeResourceChain();
    await storagePort.deleteOne('notes', id);
    await refreshState();
  });
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
  try {
    await ensureWelcomeNote(storagePort);
  } catch (error) {
    console.warn('Welcome note could not be seeded.', error);
  }
  await refreshState();
}
