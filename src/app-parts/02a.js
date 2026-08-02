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

async function runSearch(query) {
  const clean = String(query ?? '').trim();
  const requestId = Number(state.searchRequestId ?? 0) + 1;
  state.searchRequestId = requestId;
  state.currentQuery = clean;
  dom.searchInput.value = clean;
  dom.searchResults.replaceChildren();
  dom.searchResults.setAttribute('aria-busy', String(Boolean(clean)));
  if (!clean) {
    state.currentResults = [];
    dom.searchResults.removeAttribute('aria-busy');
    renderSearchEmpty();
    return [];
  }

  try {
    const results = await Promise.resolve(state.search.search(clean, {
      limit: 45,
      personalPriority: dom.personalPriority.checked,
    }));
    if (requestId !== state.searchRequestId || clean !== state.currentQuery) return [];
    state.currentResults = results;
    renderSearchResults({
      results,
      resultsContainer: dom.searchResults,
      emptyContainer: dom.searchEmpty,
      relationLabel,
      navigate: navigateResource,
    });
    await renderSuggestions();
    return results;
  } catch (error) {
    if (requestId !== state.searchRequestId) return [];
    dom.searchEmpty.replaceChildren(
      Text({ variant: 'title', text: 'Поиск временно недоступен' }),
      Text({ variant: 'muted', text: error instanceof Error ? error.message : String(error) }),
    );
    return [];
  } finally {
    if (requestId === state.searchRequestId) dom.searchResults.removeAttribute('aria-busy');
  }
}
