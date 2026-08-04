export const DUCKDB_BRIDGE_SCHEMA_VERSION = 1;
export const DUCKDB_BRIDGE_CONFIG_KIND = 'lnote.duckdb-stage';

const CONFIG_FIELDS = new Set(['schemaVersion', 'kind', 'sources']);
const FILE_FIELDS = new Set(['type', 'path', 'table', 'options']);
const DATABASE_FIELDS = new Set(['type', 'path', 'alias', 'tables']);
const REMOTE_FIELDS = new Set(['type', 'alias', 'secretEnv', 'tables']);
const TABLE_FIELDS = new Set(['source', 'target']);
const SECRET_FIELDS = new Set(['host', 'port', 'database', 'user', 'password']);
const FILE_TYPES = new Set(['csv', 'json', 'parquet']);
const DATABASE_TYPES = new Set(['sqlite', 'postgres', 'mysql']);
const FORBIDDEN_FIELDS = new Set([
  'sql',
  'query',
  'where',
  'connection',
  'connectionString',
  'dsn',
  'password',
  'token',
]);

function assertObject(value, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${label} must be an object.`);
  }
}

function assertFields(value, allowed, label) {
  for (const key of Object.keys(value)) {
    if (FORBIDDEN_FIELDS.has(key)) {
      throw new Error(`${label}.${key} is forbidden. Use declarative fields and environment-backed secrets.`);
    }
    if (!allowed.has(key)) throw new Error(`${label}.${key} is unsupported.`);
  }
}

function assertSecretFields(value, label) {
  for (const key of Object.keys(value)) {
    if (!SECRET_FIELDS.has(key)) throw new Error(`${label}.${key} is unsupported.`);
  }
}

function assertTables(source, label) {
  if (!Array.isArray(source.tables) || !source.tables.length) {
    throw new Error(`${label}.tables must be a non-empty array.`);
  }
  for (const [index, table] of source.tables.entries()) {
    assertObject(table, `${label}.tables[${index}]`);
    assertFields(table, TABLE_FIELDS, `${label}.tables[${index}]`);
    if (!table.source) throw new Error(`${label}.tables[${index}].source is required.`);
  }
}

function assertSecretEnv(source, label) {
  assertObject(source.secretEnv, `${label}.secretEnv`);
  assertSecretFields(source.secretEnv, `${label}.secretEnv`);
  for (const [field, environmentName] of Object.entries(source.secretEnv)) {
    if (!/^[A-Z_][A-Z0-9_]*$/u.test(String(environmentName))) {
      throw new Error(`${label}.secretEnv.${field} must name an environment variable.`);
    }
  }
  for (const required of ['host', 'database', 'user', 'password']) {
    if (!source.secretEnv[required]) throw new Error(`${label}.secretEnv.${required} is required.`);
  }
}

export function validateDuckDbBridgeConfig(config) {
  assertObject(config, 'DuckDB config');
  assertFields(config, CONFIG_FIELDS, 'DuckDB config');
  if (config.schemaVersion !== DUCKDB_BRIDGE_SCHEMA_VERSION
    || config.kind !== DUCKDB_BRIDGE_CONFIG_KIND) {
    throw new Error(`DuckDB config must be ${DUCKDB_BRIDGE_CONFIG_KIND} schema version ${DUCKDB_BRIDGE_SCHEMA_VERSION}.`);
  }
  if (!Array.isArray(config.sources) || !config.sources.length) {
    throw new Error('DuckDB config.sources must be a non-empty array.');
  }
  for (const [index, source] of config.sources.entries()) {
    const label = `DuckDB config.sources[${index}]`;
    assertObject(source, label);
    if (FILE_TYPES.has(source.type)) {
      assertFields(source, FILE_FIELDS, label);
      if (!source.path || !source.table) throw new Error(`${label} requires path and table.`);
      continue;
    }
    if (!DATABASE_TYPES.has(source.type)) throw new Error(`${label}.type is unsupported.`);
    if (source.type === 'sqlite') {
      assertFields(source, DATABASE_FIELDS, label);
      if (!source.path) throw new Error(`${label}.path is required.`);
      assertTables(source, label);
      continue;
    }
    assertFields(source, REMOTE_FIELDS, label);
    assertSecretEnv(source, label);
    assertTables(source, label);
  }
  return config;
}
