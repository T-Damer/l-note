import { spawn } from 'node:child_process';
import { access, mkdir, readFile, rm, stat } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';

import { inspectSqliteDatabase } from './sqlite-source-import.mjs';
import {
  DUCKDB_BRIDGE_CONFIG_KIND,
  DUCKDB_BRIDGE_SCHEMA_VERSION,
} from './duckdb-bridge-config.mjs';
import { buildDuckDbStageSql } from './duckdb-bridge-sql.mjs';

const DEFAULT_TIMEOUT_MS = 30 * 60 * 1000;
const DEFAULT_MAX_OUTPUT_BYTES = 4 * 1024 * 1024;
const DEFAULT_INIT_PATH = fileURLToPath(new URL('../duckdb-empty-init.sql', import.meta.url));

function redact(value, secrets) {
  let output = String(value ?? '');
  for (const secret of secrets ?? []) {
    if (secret) output = output.replaceAll(secret, '[REDACTED]');
  }
  return output;
}

function appendChunk(chunks, chunk, total, maxBytes, child) {
  const next = total + chunk.byteLength;
  if (next > maxBytes) {
    child.kill('SIGKILL');
    throw new Error(`DuckDB output exceeded ${maxBytes} bytes.`);
  }
  chunks.push(chunk);
  return next;
}

export function runDuckDb({
  executable = 'duckdb',
  sql,
  cwd = process.cwd(),
  environment = process.env,
  initPath = DEFAULT_INIT_PATH,
  timeoutMs = DEFAULT_TIMEOUT_MS,
  maxOutputBytes = DEFAULT_MAX_OUTPUT_BYTES,
  redactions = [],
} = {}) {
  if (!sql) return Promise.reject(new TypeError('DuckDB SQL is required.'));
  return new Promise((resolve, reject) => {
    const child = spawn(executable, ['-init', initPath, ':memory:'], {
      cwd,
      env: environment,
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    const stdout = [];
    const stderr = [];
    let stdoutBytes = 0;
    let stderrBytes = 0;
    let settled = false;
    const finish = (callback) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      callback();
    };
    const timer = setTimeout(() => {
      child.kill('SIGKILL');
      finish(() => reject(new Error(`DuckDB exceeded ${timeoutMs} ms.`)));
    }, timeoutMs);
    child.once('error', (error) => {
      finish(() => reject(new Error(`Unable to run ${executable}: ${error.message}`)));
    });
    child.stdout.on('data', (chunk) => {
      try {
        stdoutBytes = appendChunk(stdout, chunk, stdoutBytes, maxOutputBytes, child);
      } catch (error) {
        finish(() => reject(error));
      }
    });
    child.stderr.on('data', (chunk) => {
      try {
        stderrBytes = appendChunk(stderr, chunk, stderrBytes, maxOutputBytes, child);
      } catch (error) {
        finish(() => reject(error));
      }
    });
    child.once('close', (code, signal) => {
      finish(() => {
        const out = redact(Buffer.concat(stdout).toString('utf8'), redactions);
        const errorText = redact(Buffer.concat(stderr).toString('utf8'), redactions).trim();
        if (code !== 0) {
          reject(new Error(`DuckDB failed (${signal ?? code}): ${errorText || out || 'no output'}`));
          return;
        }
        resolve({ stdout: out, stderr: errorText });
      });
    });
    child.stdin.end(sql);
  });
}

export function inspectDuckDbExecutable(executable = 'duckdb', {
  runner = runDuckDb,
} = {}) {
  return runner({ executable, sql: 'SELECT version();\n' })
    .then((result) => ({ executable, output: result.stdout.trim() || result.stderr.trim() }));
}

function hasGlob(value) {
  return /[*?\[\]{}]/u.test(String(value ?? ''));
}

async function validateLocalSources(config, configDirectory) {
  for (const source of config.sources ?? []) {
    if (!['csv', 'json', 'parquet', 'sqlite'].includes(source?.type)) continue;
    if (hasGlob(source.path)) continue;
    await access(path.resolve(configDirectory, source.path));
  }
}

async function ensureOutputTarget(outputPath, force) {
  const output = path.resolve(outputPath);
  await mkdir(path.dirname(output), { recursive: true });
  try {
    await stat(output);
    if (!force) throw new Error(`${output} already exists. Use --force to replace it.`);
    await rm(output, { force: true });
  } catch (error) {
    if (error?.code !== 'ENOENT') throw error;
  }
  return output;
}

function verifyStagingDatabase(filename, expectedTargets) {
  const database = new DatabaseSync(filename, {
    readOnly: true,
    allowExtension: false,
    enableDoubleQuotedStringLiterals: false,
    timeout: 5_000,
  });
  try {
    const metadata = database.prepare('SELECT * FROM lnote_stage_metadata LIMIT 1').get();
    if (Number(metadata?.schema_version) !== DUCKDB_BRIDGE_SCHEMA_VERSION
      || metadata?.kind !== DUCKDB_BRIDGE_CONFIG_KIND) {
      throw new Error('DuckDB staging metadata is missing or incompatible.');
    }
    const actual = new Set(database.prepare('SELECT target_table FROM lnote_stage_sources').all()
      .map((row) => row.target_table));
    for (const target of expectedTargets) {
      if (!actual.has(target)) throw new Error(`DuckDB staging table is missing: ${target}`);
    }
    return { stagedAt: metadata.staged_at, targetCount: actual.size };
  } finally {
    database.close();
  }
}

export async function stageDuckDbSources({
  config,
  configPath,
  outputPath,
  executable = 'duckdb',
  force = false,
  environment = process.env,
  stagedAt = new Date().toISOString(),
  runner = runDuckDb,
  onProgress = () => {},
} = {}) {
  if (!config) {
    if (!configPath) throw new TypeError('config or configPath is required.');
    config = JSON.parse(await readFile(path.resolve(configPath), 'utf8'));
  }
  if (!outputPath) throw new TypeError('outputPath is required.');
  const configDirectory = configPath ? path.dirname(path.resolve(configPath)) : process.cwd();
  await validateLocalSources(config, configDirectory);
  const output = await ensureOutputTarget(outputPath, force);
  const plan = buildDuckDbStageSql(config, {
    outputPath: output,
    configDirectory,
    environment,
    stagedAt,
  });
  onProgress({ stage: 'duckdb', targets: plan.targets.length });
  try {
    await runner({
      executable,
      sql: plan.sql,
      cwd: configDirectory,
      environment,
      redactions: plan.redactions,
    });
    const verified = verifyStagingDatabase(output, plan.targets);
    const objects = inspectSqliteDatabase(output)
      .filter((object) => !object.name.startsWith('lnote_'));
    onProgress({ stage: 'done', targets: plan.targets.length });
    return {
      outputPath: output,
      bytes: (await stat(output)).size,
      targets: plan.targets,
      objects,
      stagedAt: verified.stagedAt,
    };
  } catch (error) {
    await rm(output, { force: true });
    throw error;
  }
}
