  for (const range of ranges) {
    const last = merged.at(-1);
    if (last && range[0] <= last[1]) last[1] = Math.max(last[1], range[1]);
    else merged.push([...range]);
  }
  let cursor = 0;
  for (const [start, end] of merged) {
    container.append(document.createTextNode(text.slice(cursor, start)));
    container.append(create('mark', { text: text.slice(start, end) }));
    cursor = end;
  }
  container.append(document.createTextNode(text.slice(cursor)));
}

function runSearch(query) {
  const clean = String(query ?? '').trim();
  state.currentQuery = clean;
  dom.searchInput.value = clean;
  dom.searchResults.replaceChildren();
  if (!clean) {
    state.currentResults = [];
    renderSearchEmpty();
    return [];
  }
  state.currentResults = state.search.search(clean, {
    limit: 45,
    personalPriority: dom.personalPriority.checked,
  });
  dom.searchEmpty.replaceChildren();
  if (!state.currentResults.length) {
    dom.searchEmpty.append(
      create('h2', { text: 'Ничего не найдено' }),
      create('p', { text: 'Попробуйте сократить запрос, использовать сокращение или установить дополнительный пакет знаний.' }),
    );
    return [];
  }

  for (const result of state.currentResults) {
    const card = create('article', { className: `result-card${result.kind === 'note' ? ' personal' : ''}` });
    const header = create('header');
    const titleGroup = create('div', {}, [
      create('h2', { text: result.title }),
      create('div', { className: 'document-name', text: result.documentTitle || result.packTitle }),
    ]);
    const typePill = create('span', {
      className: `pill ${result.kind === 'note' ? 'accent' : 'blue'}`,
      text: result.kind === 'note' ? relationLabel(result.relation) : result.packTitle,
    });
    header.append(titleGroup, typePill);
    const snippet = create('p');
    appendHighlighted(snippet, result.snippet ?? result.body, result.queryTerms ?? []);
    const footer = create('footer');
    footer.append(
      create('span', { className: 'pill muted', text: result.kind === 'note' ? 'Личная запись' : 'Справочный источник' }),
      create('span', {
        title: 'Относительная релевантность внутри текущей поисковой выдачи, а не вероятность диагноза.',
        text: `релевантность ${result.relevance ?? 0}%`,
      }),
    );
    card.append(header, snippet, footer);
    card.tabIndex = 0;
    card.setAttribute('role', 'button');
    const open = () => {
      if (result.kind === 'note') navigateResource('note', result.noteId);
      else navigateResource('document', result.documentId, { sectionId: result.sectionId });
    };
    card.addEventListener('click', open);
    card.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        open();
      }
    });
    dom.searchResults.append(card);
  }
  renderSuggestions();
  return state.currentResults;
}

function entityTerms(entity) {
  return [entity.name, ...(entity.aliases ?? [])].filter(Boolean).sort((a, b) => b.length - a.length);
}

function appendEntityLinkedText(container, text, entityIds) {
  const entities = entityIds.map((id) => state.knowledge.entities.get(id)).filter(Boolean);
  const candidates = entities.flatMap((entity) => entityTerms(entity).map((term) => ({ term, entity })));
  candidates.sort((a, b) => b.term.length - a.term.length);
  if (!candidates.length) {
    container.textContent = text;
    return;
  }
  const escaped = candidates.map(({ term }) => term.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&'));
  const regex = new RegExp(`(${escaped.join('|')})`, 'giu');
  let cursor = 0;
  for (const match of text.matchAll(regex)) {
    const index = match.index ?? 0;
    container.append(document.createTextNode(text.slice(cursor, index)));
    const matched = match[0];
    const candidate = candidates.find(({ term }) => normalizeText(term) === normalizeText(matched));
    if (candidate) {
      const button = create('button', { className: 'entity-link', text: matched, type: 'button' });
      button.addEventListener('click', () => navigateResource('concept', candidate.entity.id));
      container.append(button);
    } else container.append(document.createTextNode(matched));
    cursor = index + matched.length;
  }
  container.append(document.createTextNode(text.slice(cursor)));
}

function claimsForSection(documentId, sectionId) {
  return [...state.knowledge.claims.values()].filter(
    (claim) => claim.source?.documentId === documentId && claim.source?.sectionId === sectionId,
  );
}

function renderDocumentDialog(record) {
  const documentRecord = findDocumentForSection(state.knowledge, record);
  if (!documentRecord) return false;
  dom.documentDialogHeading.replaceChildren(
    create('p', { className: 'eyebrow', text: documentRecord.packTitle }),
    create('h2', { text: documentRecord.title }),
    create('p', { text: documentRecord.source?.title ?? 'Локальный источник' }),
  );
  dom.documentDialogBody.replaceChildren();
  if (documentRecord.summary) dom.documentDialogBody.append(create('p', { className: 'document-summary', text: documentRecord.summary }));
