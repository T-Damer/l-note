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
      Text({ variant: 'title', text: 'Ничего не найдено' }),
      Text({ variant: 'muted', text: 'Попробуйте сократить запрос, использовать сокращение или установить дополнительный пакет знаний.' }),
    );
    return [];
  }

  for (const result of state.currentResults) {
    const open = () => {
      if (result.kind === 'note') navigateResource('note', result.noteId);
      else navigateResource('document', result.documentId, { sectionId: result.sectionId });
    };
    const card = Card({
      kind: 'result',
      className: `result-card${result.kind === 'note' ? ' personal' : ''}`,
      interactive: true,
      ariaLabel: `Открыть ${result.title}`,
      onActivate: open,
    });
    const header = create('header');
    const titleGroup = create('div', {}, [
      Text({ variant: 'title', as: 'h2', text: result.title }),
      create('div', { className: 'document-name', text: result.documentTitle || result.packTitle }),
    ]);
    const typeLabel = result.kind === 'note' ? relationLabel(result.relation) : result.packTitle;
    const typePill = create(
      'span',
      { className: `pill result-type-pill ${result.kind === 'note' ? 'accent' : 'blue'}` },
      [
        Icon({ name: iconNameForSearchResult(result), className: 'result-type-icon' }),
        document.createTextNode(typeLabel),
      ],
    );
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
    dom.searchResults.append(card);
  }
  renderSuggestions();
  return state.currentResults;
}
