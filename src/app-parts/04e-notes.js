const noteResourceView = createNoteResourceView({
  dialogView: noteDialogView,
  elements: {
    id: dom.noteId,
    targetClaimId: dom.noteTargetClaim,
    title: dom.noteTitle,
    body: dom.noteBody,
    relation: dom.noteRelation,
    dialogTitle: dom.noteDialogTitle,
    targetSummary: dom.noteTargetSummary,
    relatedPreview: dom.noteRelatedPreview,
    deleteButton: dom.deleteNoteButton,
  },
  navigate: navigateResource,
  getKnowledge: () => state.knowledge,
  getNotes: () => state.notes,
  detectRelated: detectRelatedEntities,
});

function renderNotes() {
  return renderNotesList({
    notes: state.notes,
    container: dom.notesGrid,
    navigate: navigateResource,
    relationLabel,
  });
}

async function saveCurrentNote(event) {
  event.preventDefault();
  const draft = noteResourceView.readDraft();
  const previous = draft.id ? await storagePort.getOne('notes', draft.id) : null;
  const related = detectRelatedEntities(`${draft.title} ${draft.body}`);
  const note = createNoteRecord({
    draft,
    previous,
    relatedEntityIds: related.map((entity) => entity.id),
    relationLabel,
  });
  await storagePort.putOne('notes', note);
  await refreshState();
  closeResourceChain();
  toast('Заметка сохранена и добавлена в локальный поиск.');
}

async function deleteCurrentNote() {
  const { id } = noteResourceView.readDraft();
  if (!id || !confirm('Удалить эту заметку?')) return;
  closeResourceChain();
  await storagePort.deleteOne('notes', id);
  await refreshState();
}

async function importNotesFile(file) {
  try {
    const records = normalizeImportedNotes(JSON.parse(await file.text()), {
      relationLabel,
      createId: () => crypto.randomUUID(),
    });
    for (const note of records) await storagePort.putOne('notes', note);
    await refreshState();
    toast(`Импортировано заметок: ${records.length}.`);
  } catch (error) {
    toast(error instanceof Error ? error.message : String(error), 'error');
  }
}

Object.assign(dom, { noteResourceView });
