const searchExamples = Object.freeze([
  'грудничок свистит при дыхании',
  'сатурация ниже 90 пневмония',
  'сыпь пошла с лица вниз',
  'ОАМ при температуре без очага',
  'fuzzy serch с опечаткой',
]);

renderSuggestions = async function renderAsyncSuggestions() {
  const requestId = Number(state.suggestionRequestId ?? 0) + 1;
  state.suggestionRequestId = requestId;
  let automatic = [];
  if (state.currentQuery) {
    try {
      automatic = await Promise.resolve(state.search.suggest(state.currentQuery, 3));
    } catch {
      automatic = [];
    }
  }
  if (requestId !== state.suggestionRequestId) return;
  const suggestions = [...new Set([...automatic, ...searchExamples])].slice(0, 7);
  dom.searchSuggestions.replaceChildren();
  for (const suggestion of suggestions) {
    const button = create('button', { type: 'button', text: suggestion });
    button.addEventListener('click', () => runSearch(suggestion));
    dom.searchSuggestions.append(button);
  }
};
