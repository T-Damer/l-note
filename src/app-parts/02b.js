  for (const section of documentRecord.sections ?? []) {
    const article = create('article', { className: 'document-section', id: `section-${section.id}` });
    article.append(create('h3', { text: section.title }));
    const paragraph = create('p');
    appendEntityLinkedText(paragraph, section.text, section.entityIds ?? []);
    article.append(paragraph);

    const claims = claimsForSection(documentRecord.id, section.id);
    if (claims.length) {
      const claimList = create('div', { className: 'claim-list' });
      for (const claim of claims) {
        const claimCard = create('article', { className: 'claim-card' });
        const claimButton = create('button', { className: 'claim-open-button', type: 'button', text: claim.text });
        claimButton.addEventListener('click', () => navigateResource('statement', claim.id));
        const footer = create('footer');
        footer.append(create('span', { className: 'pill', text: claim.authority === 'reference' ? 'Утверждение источника' : claim.authority ?? 'Утверждение' }));
        const noteButton = create('button', { type: 'button', text: 'Добавить наблюдение' });
        noteButton.addEventListener('click', () => navigateResource('note', 'new', { claimId: claim.id }));
        footer.append(noteButton);
        claimCard.append(claimButton, footer);
        claimList.append(claimCard);
      }
      article.append(claimList);
    }
    dom.documentDialogBody.append(article);
  }

  if (documentRecord.source?.url) {
    dom.documentDialogBody.append(
      create('a', {
        className: 'source-link',
        href: documentRecord.source.url,
        target: '_blank',
        rel: 'noreferrer',
        text: 'Открыть внешний первоисточник ↗',
      }),
    );
  }
  showRoutedDialog(dom.documentDialog);
  queueMicrotask(() => {
    const sectionId = record.sectionId;
    if (sectionId) dom.documentDialogBody.querySelector(`#section-${CSS.escape(sectionId)}`)?.scrollIntoView({ block: 'start' });
  });
  return true;
}

function renderEntityDialog(entityId) {
  const entity = state.knowledge.entities.get(entityId);
  if (!entity) return false;
  dom.entityDialogHeading.replaceChildren(
    create('p', { className: 'eyebrow', text: entity.type ?? 'Понятие' }),
    create('h2', { text: entity.name }),
  );
  dom.entityDialogBody.replaceChildren();
  if (entity.description) dom.entityDialogBody.append(create('p', { className: 'entity-description', text: entity.description }));
  const aliases = create('div', { className: 'entity-aliases' });
  for (const alias of entity.aliases ?? []) aliases.append(create('span', { className: 'pill', text: alias }));
  if (aliases.childElementCount) dom.entityDialogBody.append(aliases);

  const relations = state.knowledge.relations.filter((relation) => relation.sourceId === entityId || relation.targetId === entityId);
  if (relations.length) {
    const accordion = create('details', { className: 'relation-accordion' });
    accordion.append(create('summary', { text: `Связи · ${relations.length}` }));
    const list = create('div', { className: 'relation-list' });
    for (const relation of relations) {
      const otherId = relation.sourceId === entityId ? relation.targetId : relation.sourceId;
      const other = state.knowledge.entities.get(otherId);
      const predicate = relationPredicateLabel(relation.predicate ?? relation.type);
      const button = create('button', {
        className: 'backlink-button',
        type: 'button',
      }, [
        create('strong', { text: `${predicate} → ${other?.name ?? otherId}` }),
        create('small', { text: relation.description ?? 'Связь из пакета знаний' }),
        create('span', { className: 'relation-strength', text: relationStrengthLabel(relation) }),
      ]);
      if (other) button.addEventListener('click', () => navigateResource('concept', other.id));
      list.append(button);
    }
    accordion.append(list);
    dom.entityDialogBody.append(accordion);
  }

  const mentions = state.knowledge.entityMentions.get(entityId) ?? [];
  if (mentions.length) {
    dom.entityDialogBody.append(create('h3', { text: 'Где встречается' }));
    const list = create('div', { className: 'backlink-list' });
    for (const mention of mentions) {
      const documentRecord = state.knowledge.documents.get(mention.documentId);
      const section = state.knowledge.sections.get(`${mention.documentId}/${mention.sectionId}`);
      const button = create('button', { className: 'backlink-button', type: 'button' }, [
        create('strong', { text: `${documentRecord?.title ?? mention.documentId} — ${section?.title ?? mention.sectionId}` }),
        create('small', { text: section?.text?.slice(0, 150) ?? '' }),
      ]);
      button.addEventListener('click', () => navigateResource('document', mention.documentId, { sectionId: mention.sectionId }));
      list.append(button);
    }
    dom.entityDialogBody.append(list);
  }

  const notes = state.notes.filter((note) => (note.relatedEntityIds ?? []).includes(entityId));
  if (notes.length) {
    dom.entityDialogBody.append(create('h3', { text: 'Личные заметки' }));
    const list = create('div', { className: 'backlink-list' });
    for (const note of notes) {
      const button = create('button', { className: 'backlink-button', type: 'button' }, [
        create('strong', { text: note.title }),
        create('small', { text: relationLabel(note.relation) }),
      ]);
      button.addEventListener('click', () => navigateResource('note', note.id));
      list.append(button);
    }
    dom.entityDialogBody.append(list);
  }
  showRoutedDialog(dom.entityDialog);
  return true;
}

function renderStatementDialog(claimId) {
  const claim = state.knowledge.claims.get(claimId);
  if (!claim) return false;
  dom.entityDialogHeading.replaceChildren(
    create('p', { className: 'eyebrow', text: 'Утверждение' }),
    create('h2', { text: claim.predicate ? relationPredicateLabel(claim.predicate) : 'Утверждение источника' }),
  );
  dom.entityDialogBody.replaceChildren();
  dom.entityDialogBody.append(create('p', { className: 'statement-text', text: claim.text }));

  const linkedEntities = [claim.subjectId, claim.objectId]
    .filter(Boolean)
    .map((id) => state.knowledge.entities.get(id))
    .filter(Boolean);
  if (linkedEntities.length) {
    const entities = create('div', { className: 'entity-aliases' });
    for (const entity of linkedEntities) {
      const button = create('button', { className: 'pill entity-pill-button', type: 'button', text: entity.name });
      button.addEventListener('click', () => navigateResource('concept', entity.id));
      entities.append(button);
    }
    dom.entityDialogBody.append(entities);
  }

  if (claim.source?.documentId) {
    const documentRecord = state.knowledge.documents.get(claim.source.documentId);
    const sourceButton = create('button', { className: 'backlink-button', type: 'button' }, [
      create('strong', { text: documentRecord?.title ?? claim.source.documentId }),
      create('small', { text: claim.source.quote ?? `Раздел: ${claim.source.sectionId ?? 'не указан'}` }),
    ]);
    sourceButton.addEventListener('click', () => navigateResource('document', claim.source.documentId, { sectionId: claim.source.sectionId }));
    dom.entityDialogBody.append(create('h3', { text: 'Источник' }), sourceButton);
  }

  const notes = state.knowledge.claimNotes.get(claimId) ?? [];
  if (notes.length) {
    dom.entityDialogBody.append(create('h3', { text: 'Личный слой' }));
    const noteList = create('div', { className: 'backlink-list' });
    for (const note of notes) {
      const button = create('button', { className: 'backlink-button', type: 'button' }, [
        create('strong', { text: note.title }),
        create('small', { text: relationLabel(note.relation) }),
      ]);
      button.addEventListener('click', () => navigateResource('note', note.id));
      noteList.append(button);
    }
    dom.entityDialogBody.append(noteList);
  }

  const addNote = create('button', { className: 'primary-button statement-note-button', type: 'button', text: 'Добавить наблюдение' });
  addNote.addEventListener('click', () => navigateResource('note', 'new', { claimId }));
  dom.entityDialogBody.append(addNote);
  showRoutedDialog(dom.entityDialog);
  return true;
}
