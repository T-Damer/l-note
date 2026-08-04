export const DEFAULT_SQLITE_SEARCH_DATABASE_NAME = 'l-note-search.db';

export function normalizeSqliteSearchDatabaseName(value = DEFAULT_SQLITE_SEARCH_DATABASE_NAME) {
  const name = String(value).trim();
  if (!/^[a-z0-9][a-z0-9._-]{0,95}$/iu.test(name)) {
    throw new TypeError('SQLite search databaseName must be a simple 1-96 character storage name.');
  }
  return name;
}
