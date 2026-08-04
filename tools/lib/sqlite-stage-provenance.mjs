function hasTable(database, name) {
  return Boolean(database.prepare(`
    SELECT 1 AS found
    FROM sqlite_schema
    WHERE type = 'table' AND name = ?
  `).get(name)?.found);
}

function parseConfig(value) {
  try {
    return JSON.parse(value);
  } catch {
    return { invalidJson: true };
  }
}

export function readSqliteStageSources(database) {
  if (!hasTable(database, 'lnote_stage_sources')) return new Map();
  const rows = database.prepare(`
    SELECT target_table, source_type, source_locator, source_config_json, staged_at
    FROM lnote_stage_sources
    ORDER BY target_table
  `).all();
  return new Map(rows.map((row) => [row.target_table, Object.freeze({
    adapter: 'duckdb-stage',
    sourceType: row.source_type,
    sourceLocator: row.source_locator,
    sourceConfig: parseConfig(row.source_config_json),
    stagedAt: row.staged_at,
  })]));
}
