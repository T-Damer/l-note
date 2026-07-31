    dom.noteTargetSummary.textContent = 'Связанное утверждение отсутствует в активных пакетах. Заметка сохранится, но ссылка станет неразрешённой.';
    return;
  }
  const documentRecord = state.knowledge.documents.get(claim.source?.documentId);
  const targetButton = create('button', { className: 'backlink-button', type: 'button' }, [
    Text({ variant: 'body', as: 'strong', text: claim.text }),
    Text({ variant: 'caption', text: `${documentRecord?.title ?? claim.source?.documentId} — ${claim.source?.sectionId}` }),
  ]);
  targetButton.addEventListener('click', () => navigateResource('statement', claim.id));
  dom.noteTargetSummary.append(
    Text({ variant: 'label', text: 'Связанное утверждение' }),
    targetButton,
  );
}

function updateNoteRelatedPreview(savedNote = null) {
  const detected = detectRelatedEntities(`${dom.noteTitle.value} ${dom.noteBody.value}`);
  const savedIds = new Set(savedNote?.relatedEntityIds ?? []);
  const savedEntities = [...savedIds]
    .map((id) => state.knowledge.entities.get(id))
    .filter(Boolean);
  const proposedEntities = detected.filter((entity) => !savedIds.has(entity.id));

  dom.noteRelatedPreview.replaceChildren();
  if (savedEntities.length) {
    dom.noteRelatedPreview.append(Text({ variant: 'label', text: 'Связано со справочником' }));
    const links = create('div', { className: 'entity-aliases' });
    for (const entity of savedEntities) {
      const button = create('button', {
        className: 'pill entity-pill-button',
        type: 'button',
        text: entity.name,
      });
      button.addEventListener('click', () => navigateResource('concept', entity.id));
      links.append(button);
    }
    dom.noteRelatedPreview.append(links);
  }

  if (proposedEntities.length) {
    dom.noteRelatedPreview.append(Text({
      variant: 'label',
      text: savedEntities.length ? 'Дополнительно будут связаны' : 'Будут связаны понятия',
    }));
    const proposed = create('div', { className: 'entity-aliases' });
    for (const entity of proposedEntities) proposed.append(create('span', { className: 'pill', text: entity.name }));
    dom.noteRelatedPreview.append(proposed);
  }

  if (!savedEntities.length && !proposedEntities.length) {
    dom.noteRelatedPreview.textContent = 'Автоматические связи с понятиями появятся, когда в заметке встретятся термины из установленных пакетов.';
  }
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
  updateNoteRelatedPreview(note);
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
      Text({ variant: 'title', text: 'Заметок пока нет' }),
      Text({ variant: 'muted', text: 'Добавьте наблюдение самостоятельно или откройте утверждение в документе и свяжите заметку с ним.' }),
    ]));
    return;
  }
  for (const note of state.notes) {
    const open = () => navigateResource('note', note.id);
    const card = Card({
      kind: 'note',
      className: 'note-card',
      interactive: true,
      ariaLabel: `Открыть заметку ${note.title}`,
      onActivate: open,
    });
    const createdAt = new Date(note.createdAt ?? note.updatedAt).toLocaleString('ru-RU');
    const updated = note.updatedAt && note.createdAt && note.updatedAt !== note.createdAt
      ? ` · изменено ${new Date(note.updatedAt).toLocaleString('ru-RU')}`
      : '';
    card.append(
      create('span', { className: 'pill accent', text: relationLabel(note.relation) }),
      Text({ variant: 'title', as: 'h2', text: note.title }),
      Text({ variant: 'muted', text: note.body.length > 420 ? `${note.body.slice(0, 420)}…` : note.body }),
      Text({ variant: 'caption', as: 'footer', text: `создано ${createdAt}${updated} · ${note.relatedEntityIds?.length ?? 0} связей` }),
    );
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
  return renderEvidenceView({
    evidence,
    output: dom.answerOutput,
    relationLabel,
    onOpenSource(source) {
      navigateResource('document', source.result.documentId, {
        sectionId: source.result.sectionId,
      });
    },
  });
}
