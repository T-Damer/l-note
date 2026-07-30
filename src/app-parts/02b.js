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
        claimCard.append(create('p', { text: claim.text }));
        const footer = create('footer');
        footer.append(create('span', { className: 'pill', text: claim.authority === 'reference' ? 'Утверждение источника' : claim.authority ?? 'Утверждение' }));
        const noteButton = create('button', { type: 'button', text: 'Добавить наблюдение' });
        noteButton.addEventListener('click', () => openNoteDialog(null, claim.id));
        footer.append(noteButton);
        claimCard.append(footer);
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
        text: 'Открыть первоисточник ↗',
      }),
    );
  }
  if (dom.entityDialog.open) dom.entityDialog.close();
  dom.documentDialog.showModal();
  queueMicrotask(() => dom.documentDialogBody.querySelector(`#section-${CSS.escape(record.sectionId)}`)?.scrollIntoView({ block: 'start' }));
}

function openEntity(entityId) {
  const entity = state.knowledge.entities.get(entityId);
  if (!entity) return;
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
    dom.entityDialogBody.append(create('h3', { text: 'Связи' }));
    const list = create('div', { className: 'relation-list' });
    for (const relation of relations) {
      const otherId = relation.sourceId === entityId ? relation.targetId : relation.sourceId;
      const other = state.knowledge.entities.get(otherId);
      const button = create('button', {
        className: 'backlink-button',
        type: 'button',
      }, [
        create('strong', { text: `${relation.predicate ?? relation.type ?? 'related_to'} → ${other?.name ?? otherId}` }),
        create('small', { text: relation.description ?? 'Связь из пакета знаний' }),
      ]);
      if (other) button.addEventListener('click', () => openEntity(other.id));
      list.append(button);
    }
    dom.entityDialogBody.append(list);
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
      button.addEventListener('click', () => {
        dom.entityDialog.close();
        openDocument({ documentId: mention.documentId, sectionId: mention.sectionId });
      });
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
      button.addEventListener('click', () => {
        dom.entityDialog.close();
