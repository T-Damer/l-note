export const appBase = new URL('../', import.meta.url);
export const catalogUrl = new URL('packs/catalog.json', appBase);

export const state = {
  catalog: [],
  installed: [],
  entities: [],
  searchResults: [],
  searchExpansion: null,
  selectedResult: null,
  currentQuery: '',
  researchEvidence: [],
  editingNoteId: null,
};
