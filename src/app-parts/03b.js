    dom.noteTargetSummary.textContent = 'Связанное утверждение отсутствует в активных пакетах. Заметка сохранится, но ссылка станет неразрешённой.';
    return;
  }
  const documentRecord = state.knowledge.documents.get(claim.source?.documentId);
  dom.noteTargetSummary.append(
    create('strong', { text: 'Связанное утверждение' }),
    create('div', { text: claim.text }),
    create('small', { text: `${documentRecord?.title ?? claim.source?.documentId} — ${claim.source?.sectionId}` }),
  );
}

function updateNoteRelatedPreview() {
  const entities = detectRelatedEntities(`${dom.noteTitle.value} ${dom.noteBody.value}`);
  dom.noteRelatedPreview.replaceChildren();
  if (!entities.length) {
    dom.noteRelatedPreview.textContent = 'Автоматические связи с понятиями появятся, когда в заметке встретятся термины из установленных пакетов.';
    return;
  }
  dom.noteRelatedPreview.append(create('strong', { text: 'Будут связаны понятия: ' }));
  for (const entity of entities) dom.noteRelatedPreview.append(create('span', { className: 'pill', text: entity.name }));
}

function renderNoteDialog(note = null, targetClaimId = null) {
  const editing = Boolean(note);
  dom.noteDialogTitle.textContent = editing ? 'Редактировать заметку' : 'Новая заметка';
  dom.noteId.value = note?.id ?? '';
  dom.noteTargetClaim.value = note?.targetClaimId ?? targetClaimId ?? '';
  dom.noteTitle.value = note?.title ?? '';
  dom.noteBody.value = note?.body ?? '';
  dom.noteRelation.value = note?.relation ?? 'observation';
  dom.deleteNoteButton.classList.toggle('hidden', !editing);
  renderNoteTarget(dom.noteTargetClaim.value);
  updateNoteRelatedPreview();
  showRoutedDialog(dom.noteDialog);
  return true;
}

function renderNoteRoute(route) {
  if (route.resourceId === 'new') return renderNoteDialog(null, route.claimId);
  const note = state.notes.find((item) => item.id === route.resourceId);
  return note ? renderNoteDialog(note) : false;
}

async function saveCurrentNote(event) {
  event.preventDefault();
  const previous = dom.noteId.value ? await storagePort.getOne('notes', dom.noteId.value) : null;
  const now = new Date().toISOString();
  const related = detectRelatedEntities(`${dom.noteTitle.value} ${dom.noteBody.value}`);
  const note = {
    id: dom.noteId.value || crypto.randomUUID(),
    title: dom.noteTitle.value.trim(),
    body: dom.noteBody.value.trim(),
    relation: dom.noteRelation.value,
    relationLabel: relationLabel(dom.noteRelation.value),
    targetClaimId: dom.noteTargetClaim.value || null,
    relatedEntityIds: related.map((entity) => entity.id),
    createdAt: previous?.createdAt ?? now,
    updatedAt: now,
  };
  await storagePort.putOne('notes', note);
  await refreshState();
  closeResourceChain();
  toast('Заметка сохранена и добавлена в локальный поиск.');
}

async function renderNotes() {
  dom.notesGrid.replaceChildren();
  if (!state.notes.length) {
    dom.notesGrid.append(create('section', { className: 'empty-state' }, [
      create('h2', { text: 'Заметок пока нет' }),
      create('p', { text: 'Добавьте наблюдение самостоятельно или откройте утверждение в документе и свяжите заметку с ним.' }),
    ]));
    return;
  }
  for (const note of state.notes) {
    const card = create('article', { className: 'note-card' });
    const createdAt = new Date(note.createdAt ?? note.updatedAt).toLocaleString('ru-RU');
    const updated = note.updatedAt && note.createdAt && note.updatedAt !== note.createdAt
      ? ` · изменено ${new Date(note.updatedAt).toLocaleString('ru-RU')}`
      : '';
    card.append(
      create('span', { className: 'pill accent', text: relationLabel(note.relation) }),
      create('h2', { text: note.title }),
      create('p', { text: note.body.length > 420 ? `${note.body.slice(0, 420)}…` : note.body }),
      create('footer', { text: `создано ${createdAt}${updated} · ${note.relatedEntityIds?.length ?? 0} связей` }),
    );
    card.tabIndex = 0;
    card.setAttribute('role', 'button');
    const open = () => navigateResource('note', note.id);
    card.addEventListener('click', open);
    card.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        open();
      }
    });
    dom.notesGrid.append(card);
  }
}

function downloadJson(filename, value) {
  const blob = new Blob([JSON.stringify(value, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const anchor = create('a', { href: url, download: filename });
  anchor.click();
  URL.revokeObjectURL(url);
}

function renderEvidence(evidence) {
  dom.answerOutput.replaceChildren();
  const overview = create('article', { className: 'answer-panel' });
  overview.append(
    create('h2', { text: 'Доказательная сводка' }),
    create('p', {
      text: evidence.sources.length
        ? `Найдено ${evidence.sources.length} справочных фрагментов и ${evidence.relatedNotes.length} личных заметок. Генеративная модель пока не использовалась.`
