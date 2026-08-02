async function renderCatalog() {
  const installedById = new Map(state.packRecords.map((record) => [record.id, record]));
  const entries = [...state.catalog.packs];
  for (const record of state.packRecords) {
