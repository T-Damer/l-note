import {
  SQLITE_FTS_BACKEND_ID,
  SQLITE_FTS_STORAGE_ID,
  rankSqliteFtsRows,
  selectSqliteFuzzyTerms,
  sqliteFtsMatchQuery,
  sqliteFtsRecordValues,
  sqliteVocabularyRange,
} from '../helpers/sqlite-fts.js';
import { tokenize } from '../search.js';

const SQLITE_WASM_VERSION = '1.3.1';
const SQLITE_WASM_MODULE = `https://esm.run/@subframe7536/sqlite-wasm@${SQLITE_WASM_VERSION}`;
const SQLITE_WASM_IDB_MODULE = `${SQLITE_WASM_MODULE}/idb`;
const SQLITE_WASM_URL = `https://cdn.jsdelivr.net/npm/@subframe7536/sqlite-wasm@${SQLITE_WASM_VERSION}/dist/wa-sqlite-async.wasm`;
const DATABASE_NAME = 'l-note-search.sqlite';
const SQLITE_ROW = 100;
const INSERT_SQL = `
  INSERT INTO records_fts(
    id, payload, title, document_title, body, aliases, entity_names, tags
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
`;
const SEARCH_SQL = `
  SELECT payload,
    -bm25(records_fts, 0.0, 0.0, 4.5, 3.5, 1.0, 5.0, 4.5, 1.4) AS score
  FROM records_fts
  WHERE records_fts MATCH ?
  ORDER BY score DESC
  LIMIT ?
`;
const SCHEMA_SQL = `
  PRAGMA journal_mode=DELETE;
  PRAGMA synchronous=NORMAL;
  PRAGMA temp_store=MEMORY;
  PRAGMA cache_size=-4096;
  CREATE VIRTUAL TABLE IF NOT EXISTS records_fts USING fts5(
    id UNINDEXED,
    payload UNINDEXED,
    title,
    document_title,
    body,
    aliases,
    entity_names,
    tags,
    tokenize = 'unicode61 remove_diacritics 2',
    prefix = '2 3 4 5'
  );
  CREATE VIRTUAL TABLE IF NOT EXISTS records_vocab
    USING fts5vocab(records_fts, 'row');
  CREATE TABLE IF NOT EXISTS search_meta(
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );
`;

function asObject(row, columns) {
  return Object.fromEntries(columns.map((column, index) => [column, row[index]]));
}

export class SqliteFtsRuntime {
  constructor({
    moduleUrl = SQLITE_WASM_MODULE,
    idbModuleUrl = SQLITE_WASM_IDB_MODULE,
    wasmUrl = SQLITE_WASM_URL,
  } = {}) {
    this.moduleUrl = moduleUrl;
    this.idbModuleUrl = idbModuleUrl;
    this.wasmUrl = wasmUrl;
    this.sqlite3 = null;
    this.database = null;
    this.connection = null;
    this.vfs = null;
    this.initializing = null;
  }

  async init() {
    if (this.database) return this;
    if (this.initializing) return this.initializing;
    this.initializing = this.initialize().catch((error) => {
      this.initializing = null;
      throw error;
    });
    return this.initializing;
  }

  async initialize() {
    const [sqliteModule, idbModule] = await Promise.all([
      import(this.moduleUrl),
      import(this.idbModuleUrl),
    ]);
    this.connection = await sqliteModule.initSQLite(
      idbModule.useIdbStorage(DATABASE_NAME, { url: this.wasmUrl }),
    );
    this.sqlite3 = this.connection.sqlite;
    this.database = this.connection.db ?? this.connection.pointer;
    this.vfs = this.connection.vfs;
    await this.sqlite3.exec(this.database, SCHEMA_SQL);
    return this;
  }

  async rows(sql, bindings = []) {
    await this.init();
    const output = [];
    for await (const statement of this.sqlite3.statements(this.database, sql)) {
      this.sqlite3.bind_collection(statement, bindings);
      let columns = null;
      while (await this.sqlite3.step(statement) === SQLITE_ROW) {
        columns ??= this.sqlite3.column_names(statement);
        output.push(asObject(this.sqlite3.row(statement), columns));
      }
    }
    return output;
  }

  async meta(key) {
    const rows = await this.rows('SELECT value FROM search_meta WHERE key = ?', [key]);
    return rows[0]?.value ?? null;
  }

  async writeMeta(values) {
    for await (const statement of this.sqlite3.statements(
      'INSERT OR REPLACE INTO search_meta(key, value) VALUES (?, ?)',
    )) {
      for (const [key, value] of Object.entries(values)) {
        this.sqlite3.bind_collection(statement, [key, String(value)]);
        await this.sqlite3.step(statement);
        await this.sqlite3.reset(statement);
        this.sqlite3.clear_bindings(statement);
      }
    }
  }

  async build(records, { fingerprint = '', onProgress = () => {} } = {}) {
    await this.init();
    const storedFingerprint = await this.meta('fingerprint');
    const storedCount = Number(await this.meta('recordCount') ?? 0);
    if (fingerprint && storedFingerprint === fingerprint && storedCount === records.length) {
      return { ...(await this.stats()), reused: true };
    }

    onProgress({ stage: 'schema', completed: 0, total: records.length });
    await this.sqlite3.exec(this.database, 'BEGIN IMMEDIATE; DELETE FROM records_fts; DELETE FROM search_meta;');
    try {
      for await (const statement of this.sqlite3.statements(this.database, INSERT_SQL)) {
        for (let index = 0; index < records.length; index += 1) {
          this.sqlite3.bind_collection(statement, sqliteFtsRecordValues(records[index]));
          await this.sqlite3.step(statement);
          await this.sqlite3.reset(statement);
          this.sqlite3.clear_bindings(statement);
          if (index % 200 === 0 || index === records.length - 1) {
            onProgress({ stage: 'records', completed: index + 1, total: records.length });
          }
        }
      }
      await this.writeMeta({
        fingerprint,
        recordCount: records.length,
        builtAt: new Date().toISOString(),
      });
      await this.sqlite3.exec(this.database, 'COMMIT;');
    } catch (error) {
      await this.sqlite3.exec(this.database, 'ROLLBACK;').catch(() => {});
      throw error;
    }
    await this.sqlite3.exec(this.database, "INSERT INTO records_fts(records_fts) VALUES('optimize');");
    onProgress({ stage: 'ready', completed: records.length, total: records.length });
    return { ...(await this.stats()), reused: false };
  }

  async searchRows(matchQuery, limit) {
    if (!matchQuery) return [];
    return this.rows(SEARCH_SQL, [matchQuery, Math.max(20, limit * 4)]);
  }

  async vocabulary(token, limit = 128, prefixLength = token.length) {
    const range = sqliteVocabularyRange(token, prefixLength);
    if (!range) return [];
    return this.rows(`
      SELECT term, doc AS documents
      FROM records_vocab
      WHERE term >= ? AND term < ?
      ORDER BY doc DESC
      LIMIT ?
    `, [range.lower, range.upper, limit]);
  }

  async fuzzyTerms(query) {
    const output = [];
    for (const token of tokenize(query)) {
      if (token.length <= 3) continue;
      let candidates = await this.vocabulary(token, 160, Math.min(2, token.length));
      if (!candidates.length) candidates = await this.vocabulary(token, 160, 1);
      output.push(...selectSqliteFuzzyTerms(token, candidates, 3));
    }
    return [...new Set(output)];
  }

  async search(query, options = {}) {
    const cleanQuery = String(query ?? '').trim();
    if (!cleanQuery) return [];
    const limit = Math.max(1, Math.floor(Number(options.limit ?? 40)));
    let rows = await this.searchRows(sqliteFtsMatchQuery(cleanQuery), limit);
    if (rows.length < Math.min(8, limit)) {
      const fuzzyTerms = await this.fuzzyTerms(cleanQuery);
      if (fuzzyTerms.length) {
        rows = await this.searchRows(sqliteFtsMatchQuery(cleanQuery, fuzzyTerms), limit);
      }
    }
    return rankSqliteFtsRows(rows, cleanQuery, options);
  }

  async suggest(query, limit = 5) {
    const token = tokenize(query).at(-1);
    if (!token) return [];
    const prefix = await this.vocabulary(token, Math.max(20, limit * 5));
    if (prefix.length) return prefix.slice(0, limit).map((row) => row.term);
    const fuzzy = await this.vocabulary(token, 160, Math.min(2, token.length));
    return selectSqliteFuzzyTerms(token, fuzzy, limit);
  }

  async stats() {
    await this.init();
    const [recordCount, tokenCount, builtAt, fingerprint, sqliteVersion] = await Promise.all([
      this.meta('recordCount'),
      this.rows('SELECT count(*) AS value FROM records_vocab').then((rows) => rows[0]?.value ?? 0),
      this.meta('builtAt'),
      this.meta('fingerprint'),
      this.rows('SELECT sqlite_version() AS value').then((rows) => rows[0]?.value ?? 'unknown'),
    ]);
    return {
      recordCount: Number(recordCount ?? 0),
      tokenCount: Number(tokenCount ?? 0),
      storage: SQLITE_FTS_STORAGE_ID,
      backend: SQLITE_FTS_BACKEND_ID,
      runtime: `@subframe7536/sqlite-wasm@${SQLITE_WASM_VERSION}`,
      sqliteVersion,
      builtAt,
      fingerprint,
    };
  }

  async clear() {
    await this.init();
    await this.sqlite3.exec(this.database, 'BEGIN; DELETE FROM records_fts; DELETE FROM search_meta; COMMIT;');
    return this.stats();
  }

  async close() {
    const connection = this.connection;
    this.database = null;
    this.connection = null;
    this.initializing = null;
    this.sqlite3 = null;
    this.vfs = null;
    await connection?.close?.();
  }
}
