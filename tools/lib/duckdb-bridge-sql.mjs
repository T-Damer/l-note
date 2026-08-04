import path from 'node:path';

import { quoteIdentifier, stringifyJson } from './sqlite-adapter-common.mjs';
import {
  DUCKDB_BRIDGE_CONFIG_KIND,
  DUCKDB_BRIDGE_SCHEMA_VERSION,
  validateDuckDbBridgeConfig,
} from './duckdb-bridge-config.mjs';

const FILE_TYPES = new Set(['csv', 'json', 'parquet']);
const RESERVED_TARGET_PREFIX = /^(?:sqlite_|lnote_)/iu;
const SECRET_FIELDS = new Map([
  ['host', 'HOST'],
  ['port', 'PORT'],
  ['database', 'DATABASE'],
  ['user', 'USER'],
  ['password', 'PASSWORD'],
]);

function sqlLiteral(value) {
  if (value === null || value === undefined) return 'NULL';
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new TypeError('DuckDB numeric options must be finite.');
    return String(value);
  }
  return `'${String(value).replaceAll("'", "''")}'`;
}

function safeName(value, label) {
  const name = String(value ?? '').trim();
  if (!/^[\p{L}_][\p{L}\p{N}_.-]*$/u.test(name)) {
    throw new Error(`${label} must contain only letters, numbers, _, . or -.`);
  }
  return name;
}

function tableName(value, label = 'table') {
  return safeName(value, label).replaceAll('.', '_').replaceAll('-', '_');
}

function targetTableName(value, label = 'target table') {
  const target = tableName(value, label);
  if (RESERVED_TARGET_PREFIX.test(target)) {
    throw new Error(`${label} must not use reserved SQLite/L-Note prefixes sqlite_ or lnote_.`);
  }
  return target;
}

function sourceParts(value, label) {
  const parts = Array.isArray(value) ? value : String(value ?? '').split('.');
  if (!parts.length || parts.length > 3) throw new Error(`${label} must have 1-3 identifier parts.`);
  return parts.map((part) => safeName(part, label));
}

function qualified(parts) {
  return parts.map(quoteIdentifier).join('.');
}

function resolveLocalPath(value, configDirectory) {
  const input = String(value ?? '').trim();
  if (!input) throw new Error('Local DuckDB source path is required.');
  if (/^[a-z]+:\/\//iu.test(input)) throw new Error('Remote file URLs are not supported by this bridge.');
  return path.resolve(configDirectory, input).split(path.sep).join('/');
}

function optionEntries(options, allowed) {
  const output = [];
  for (const [key, value] of Object.entries(options ?? {})) {
    if (!allowed.has(key)) throw new Error(`Unsupported DuckDB reader option: ${key}`);
    output.push(`${key} = ${sqlLiteral(value)}`);
  }
  return output;
}

function fileReader(source, configDirectory) {
  const filename = resolveLocalPath(source.path, configDirectory);
  if (source.type === 'parquet') {
    const options = optionEntries(source.options, new Set([
      'union_by_name', 'filename', 'file_row_number', 'hive_partitioning',
    ]));
    return { filename, expression: `read_parquet(${[sqlLiteral(filename), ...options].join(', ')})` };
  }
  if (source.type === 'csv') {
    const options = optionEntries(source.options, new Set([
      'header', 'all_varchar', 'auto_detect', 'union_by_name', 'filename',
      'delim', 'quote', 'escape', 'nullstr',
    ]));
    return { filename, expression: `read_csv(${[sqlLiteral(filename), ...options].join(', ')})` };
  }
  const options = optionEntries(source.options, new Set([
    'format', 'records', 'auto_detect', 'union_by_name', 'filename', 'maximum_object_size',
  ]));
  return { filename, expression: `read_json_auto(${[sqlLiteral(filename), ...options].join(', ')})` };
}

function secretSql(source, index, environment) {
  const secretName = `lnote_${source.type}_secret_${index + 1}`;
  const values = [];
  const redactions = [];
  for (const [field, sqlName] of SECRET_FIELDS) {
    const environmentName = source.secretEnv[field];
    if (!environmentName) continue;
    const value = environment[environmentName];
    if (value === undefined || value === '') throw new Error(`Missing environment variable ${environmentName}.`);
    if (field === 'port' && !/^\d+$/u.test(String(value))) {
      throw new Error(`${environmentName} must contain a numeric port.`);
    }
    values.push(`${sqlName} ${field === 'port' ? sqlLiteral(Number(value)) : sqlLiteral(value)}`);
    if (field === 'password') redactions.push(String(value));
  }
  return {
    secretName,
    redactions,
    sql: `CREATE TEMPORARY SECRET ${quoteIdentifier(secretName)} (TYPE ${source.type}, ${values.join(', ')});`,
  };
}

function metadataInsert(target, sourceType, locator, config, stagedAt) {
  return `INSERT INTO lnote_stage.lnote_stage_sources VALUES (${[
    sqlLiteral(target),
    sqlLiteral(sourceType),
    sqlLiteral(locator),
    sqlLiteral(stringifyJson(config)),
    sqlLiteral(stagedAt),
  ].join(', ')});`;
}

function localFileSource(source, context) {
  const target = targetTableName(source.table, 'file source table');
  context.claimTarget(target);
  const reader = fileReader(source, context.configDirectory);
  context.statements.push(`CREATE TABLE lnote_stage.${quoteIdentifier(target)} AS SELECT * FROM ${reader.expression};`);
  context.statements.push(metadataInsert(
    target,
    source.type,
    reader.filename,
    { type: source.type, path: source.path, options: source.options ?? {} },
    context.stagedAt,
  ));
}

function databaseTables(source, context, { alias, locator, type }) {
  for (const table of source.tables) {
    const sourceIdentifiers = sourceParts(table.source, `${type} table source`);
    const target = targetTableName(table.target ?? sourceIdentifiers.at(-1), `${type} target table`);
    context.claimTarget(target);
    context.statements.push(
      `CREATE TABLE lnote_stage.${quoteIdentifier(target)} AS SELECT * FROM ${qualified([alias, ...sourceIdentifiers])};`,
    );
    context.statements.push(metadataInsert(
      target,
      type,
      `${locator}:${sourceIdentifiers.join('.')}`,
      {
        type,
        alias,
        source: sourceIdentifiers,
        target,
        secretEnv: source.secretEnv ? { ...source.secretEnv } : undefined,
      },
      context.stagedAt,
    ));
  }
}

function sqliteSource(source, context, index) {
  const alias = tableName(source.alias ?? `sqlite_${index + 1}`, 'SQLite alias');
  const filename = resolveLocalPath(source.path, context.configDirectory);
  context.statements.push(`ATTACH ${sqlLiteral(filename)} AS ${quoteIdentifier(alias)} (TYPE sqlite, READ_ONLY);`);
  databaseTables(source, context, { alias, locator: filename, type: 'sqlite' });
}

function remoteSource(source, context, index) {
  const alias = tableName(source.alias ?? `${source.type}_${index + 1}`, 'remote alias');
  const secret = secretSql(source, index, context.environment);
  context.redactions.push(...secret.redactions);
  context.statements.push(secret.sql);
  context.statements.push(
    `ATTACH '' AS ${quoteIdentifier(alias)} (TYPE ${source.type}, READ_ONLY, SECRET ${quoteIdentifier(secret.secretName)});`,
  );
  databaseTables(source, context, { alias, locator: `${source.type}:${alias}`, type: source.type });
}

function extensionsFor(sources) {
  const values = new Set(['sqlite']);
  for (const source of sources) {
    if (source.type === 'json') values.add('json');
    if (source.type === 'postgres') values.add('postgres');
    if (source.type === 'mysql') values.add('mysql');
  }
  return [...values];
}

export function buildDuckDbStageSql(config, {
  outputPath,
  configDirectory = process.cwd(),
  environment = process.env,
  stagedAt = new Date().toISOString(),
} = {}) {
  validateDuckDbBridgeConfig(config);
  if (!outputPath) throw new TypeError('outputPath is required.');
  const targets = new Set();
  const statements = [
    'SET allow_unsigned_extensions = false;',
    'SET allow_community_extensions = false;',
    'SET autoinstall_known_extensions = false;',
    'SET autoload_known_extensions = false;',
  ];
  for (const extension of extensionsFor(config.sources)) {
    statements.push(`INSTALL ${extension};`, `LOAD ${extension};`);
  }
  statements.push(
    `ATTACH ${sqlLiteral(path.resolve(outputPath).split(path.sep).join('/'))} AS lnote_stage (TYPE sqlite);`,
    'CREATE TABLE lnote_stage.lnote_stage_metadata(schema_version INTEGER, kind VARCHAR, staged_at VARCHAR);',
    `INSERT INTO lnote_stage.lnote_stage_metadata VALUES (${DUCKDB_BRIDGE_SCHEMA_VERSION}, ${sqlLiteral(DUCKDB_BRIDGE_CONFIG_KIND)}, ${sqlLiteral(stagedAt)});`,
    'CREATE TABLE lnote_stage.lnote_stage_sources(target_table VARCHAR PRIMARY KEY, source_type VARCHAR, source_locator VARCHAR, source_config_json VARCHAR, staged_at VARCHAR);',
  );
  const context = {
    statements,
    redactions: [],
    environment,
    configDirectory,
    stagedAt,
    claimTarget(target) {
      if (targets.has(target)) throw new Error(`Duplicate DuckDB target table: ${target}`);
      targets.add(target);
    },
  };
  for (const [index, source] of config.sources.entries()) {
    if (FILE_TYPES.has(source.type)) localFileSource(source, context);
    else if (source.type === 'sqlite') sqliteSource(source, context, index);
    else remoteSource(source, context, index);
  }
  statements.push('CHECKPOINT lnote_stage;', 'DETACH lnote_stage;');
  return {
    sql: `${statements.join('\n')}\n`,
    targets: [...targets],
    redactions: [...new Set(context.redactions.filter(Boolean))],
  };
}
