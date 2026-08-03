#!/usr/bin/env node
import assert from 'node:assert/strict';
import { createReadStream } from 'node:fs';
import { access, mkdtemp, rm, stat } from 'node:fs/promises';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { extname, join, resolve, sep } from 'node:path';
import { spawn, spawnSync } from 'node:child_process';

import { buildPrebuiltSearchArtifact } from './build-search-artifact.mjs';

const root = process.cwd();
const dist = resolve(root, 'dist');
const smokePath = '/__sqlite-artifact-smoke__.html';
const required = process.env.CI === 'true' || process.env.LNOTE_REQUIRE_SQLITE_E2E === '1';
const candidates = [
  process.env.CHROME_BIN,
  'google-chrome-stable',
  'google-chrome',
  'chromium',
  'chromium-browser',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/Applications/Chromium.app/Contents/MacOS/Chromium',
].filter(Boolean);

function browserExecutable() {
  for (const candidate of candidates) {
    if (spawnSync(candidate, ['--version'], { stdio: 'ignore' }).status === 0) return candidate;
  }
  return null;
}

async function waitFor(check, message, timeoutMs = 90_000) {
  const startedAt = Date.now();
  let lastError;
  while (Date.now() - startedAt < timeoutMs) {
    try {
      const value = await check();
      if (value) return value;
    } catch (error) {
      lastError = error;
    }
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 100));
  }
  throw new Error(`${message}${lastError ? `: ${lastError.message}` : ''}`);
}

async function waitForProcessExit(child, timeoutMs = 2_000) {
  if (child.exitCode !== null || child.signalCode !== null) return;
  await Promise.race([
    new Promise((resolvePromise) => child.once('exit', resolvePromise)),
    new Promise((resolvePromise) => setTimeout(resolvePromise, timeoutMs)),
  ]);
}

async function closeServer(server) {
  await Promise.race([
    new Promise((resolvePromise) => {
      server.close(resolvePromise);
      server.closeIdleConnections?.();
      server.closeAllConnections?.();
    }),
    new Promise((resolvePromise) => setTimeout(resolvePromise, 2_000)),
  ]);
}

async function removeTemporaryPath(pathname) {
  for (let attempt = 0; attempt < 30; attempt += 1) {
    try {
      await rm(pathname, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
      return;
    } catch (error) {
      if (!['ENOTEMPTY', 'EBUSY', 'EPERM'].includes(error?.code) || attempt === 29) {
        console.warn(`Temporary smoke path could not be removed: ${pathname}`, error);
        return;
      }
      await new Promise((resolvePromise) => setTimeout(resolvePromise, 100 + attempt * 25));
    }
  }
}

function createStaticServer() {
  const types = new Map([
    ['.html', 'text/html; charset=utf-8'],
    ['.js', 'text/javascript; charset=utf-8'],
    ['.json', 'application/json; charset=utf-8'],
    ['.wasm', 'application/wasm'],
  ]);
  return createServer(async (request, response) => {
    try {
      const url = new URL(request.url ?? '/', `http://${request.headers.host}`);
      if (url.pathname === smokePath) {
        response.statusCode = 200;
        response.setHeader('Content-Type', 'text/html; charset=utf-8');
        response.setHeader('Cache-Control', 'no-store');
        response.end('<!doctype html><meta charset="utf-8"><title>SQLite artifact smoke</title>');
        return;
      }
      let pathname = decodeURIComponent(url.pathname);
      if (pathname.endsWith('/')) pathname += 'index.html';
      const filePath = resolve(dist, `.${pathname}`);
      if (filePath !== dist && !filePath.startsWith(`${dist}${sep}`)) throw new Error('Path outside dist');
      const info = await stat(filePath);
      if (!info.isFile()) throw new Error('Not a file');
      response.statusCode = 200;
      response.setHeader('Content-Type', types.get(extname(filePath)) ?? 'application/octet-stream');
      response.setHeader('Cache-Control', 'no-store');
      createReadStream(filePath).pipe(response);
    } catch {
      response.statusCode = 404;
      response.end('Not found');
    }
  });
}

class CdpClient {
  constructor(socket) {
    this.socket = socket;
    this.nextId = 1;
    this.pending = new Map();
    socket.addEventListener('message', async (event) => {
      const raw = typeof event.data === 'string' ? event.data : await event.data.text();
      const message = JSON.parse(raw);
      if (!message.id) return;
      const pending = this.pending.get(message.id);
      if (!pending) return;
      this.pending.delete(message.id);
      if (message.error) pending.reject(new Error(message.error.message));
      else pending.resolve(message.result);
    });
  }

  static async connect(url) {
    const socket = new WebSocket(url);
    await new Promise((resolvePromise, reject) => {
      socket.addEventListener('open', resolvePromise, { once: true });
      socket.addEventListener('error', () => reject(new Error('Unable to open CDP socket')), { once: true });
    });
    return new CdpClient(socket);
  }

  send(method, params = {}) {
    const id = this.nextId;
    this.nextId += 1;
    return new Promise((resolvePromise, reject) => {
      this.pending.set(id, { resolve: resolvePromise, reject });
      this.socket.send(JSON.stringify({ id, method, params }));
    });
  }

  async evaluate(expression) {
    const response = await this.send('Runtime.evaluate', {
      expression,
      awaitPromise: true,
      returnByValue: true,
    });
    if (response.exceptionDetails) {
      throw new Error(response.exceptionDetails.exception?.description ?? response.exceptionDetails.text);
    }
    return response.result?.value;
  }

  close() {
    this.socket.close();
  }
}

const executable = browserExecutable();
if (!executable) {
  const message = 'Chrome/Chromium was not found; prebuilt SQLite artifact smoke was skipped.';
  if (required) throw new Error(message);
  console.log(message);
  process.exit(0);
}
if (typeof WebSocket !== 'function') throw new Error('Node WebSocket support is required.');
await access(join(dist, 'index.html'));

const databaseName = 'prebuilt-search-smoke.sqlite';
const packName = 'prebuilt-search-smoke.pack.json';
const databasePath = join(dist, databaseName);
const packPath = join(dist, packName);
await buildPrebuiltSearchArtifact({
  inputPath: join(root, 'packs', 'lnote-guide.pack.json'),
  databasePath,
  packOutputPath: packPath,
  artifactUrl: `./${databaseName}`,
  builtAt: '2026-08-03T00:00:00.000Z',
});

const server = createStaticServer();
await new Promise((resolvePromise, reject) => {
  server.once('error', reject);
  server.listen(0, '127.0.0.1', resolvePromise);
});
const address = server.address();
const appPort = typeof address === 'object' && address ? address.port : 4173;
const debugPort = 9_900 + Math.floor(Math.random() * 80);
const profileDir = await mkdtemp(join(tmpdir(), 'l-note-prebuilt-search-'));
const appUrl = `http://127.0.0.1:${appPort}${smokePath}`;
const browser = spawn(executable, [
  '--headless=new',
  '--no-sandbox',
  '--disable-gpu',
  '--disable-default-apps',
  '--no-first-run',
  `--remote-debugging-port=${debugPort}`,
  `--user-data-dir=${profileDir}`,
  appUrl,
], { stdio: ['ignore', 'pipe', 'pipe'] });
browser.stdout?.resume();
browser.stderr?.resume();

let client;
try {
  const target = await waitFor(async () => {
    const response = await fetch(`http://127.0.0.1:${debugPort}/json/list`);
    if (!response.ok) return null;
    const targets = await response.json();
    return targets.find((item) => item.type === 'page' && item.url === appUrl);
  }, 'Prebuilt SQLite smoke browser target did not become available');
  client = await CdpClient.connect(target.webSocketDebuggerUrl);
  await client.send('Runtime.enable');

  const result = await client.evaluate(`(async () => {
    const baseUrl = 'http://127.0.0.1:${appPort}/';
    const [{ createSqliteFtsSearchPort }, { flattenKnowledge }, { knowledgeCorpusFingerprint }] = await Promise.all([
      import(baseUrl + 'src/adapters/sqlite-fts-search.js'),
      import(baseUrl + 'src/packs.js'),
      import(baseUrl + 'src/core/runtime.js'),
    ]);
    const pack = await fetch(baseUrl + '${packName}').then((response) => response.json());
    const blob = await fetch(baseUrl + '${databaseName}').then((response) => response.blob());
    const records = flattenKnowledge([pack], []);
    const fingerprint = knowledgeCorpusFingerprint([pack], []);
    const descriptor = { ...pack.searchArtifacts[0], blob };

    const importedPort = createSqliteFtsSearchPort();
    const imported = await importedPort.build(records, { fingerprint, artifact: descriptor });
    const importedResults = await importedPort.search('sqlite', { limit: 5 });
    await importedPort.close();

    const fallbackPort = createSqliteFtsSearchPort();
    const fallback = await fallbackPort.build(records, {
      fingerprint,
      artifact: { ...descriptor, sha256: '0'.repeat(64) },
    });
    const fallbackResults = await fallbackPort.search('sqlite', { limit: 5 });
    await fallbackPort.close();
    return {
      imported,
      importedResultId: importedResults[0]?.id ?? null,
      fallback,
      fallbackResultId: fallbackResults[0]?.id ?? null,
    };
  })()`);

  const diagnostics = JSON.stringify(result);
  console.log(`Prebuilt SQLite browser smoke result: ${diagnostics}`);
  assert.equal(result.imported.imported, true, `Expected verified artifact import: ${diagnostics}`);
  assert.equal(result.imported.reused, true, `Expected imported artifact reuse: ${diagnostics}`);
  assert.match(result.importedResultId, /^section:lnote\.guide:/u, `Imported artifact search failed: ${diagnostics}`);
  assert.equal(result.fallback.artifactFallback, true, `Expected corrupt-artifact fallback: ${diagnostics}`);
  assert.match(result.fallbackResultId, /^section:lnote\.guide:/u, `Fallback search failed: ${diagnostics}`);
  console.log('Prebuilt SQLite browser smoke passed: verified import, search and corrupt-artifact fallback.');
} finally {
  try {
    await client?.send('Browser.close');
  } catch {
    // Closing the browser also closes the CDP socket.
  }
  client?.close();
  await waitForProcessExit(browser, 5_000);
  if (browser.exitCode === null && browser.signalCode === null) {
    browser.kill('SIGTERM');
    await waitForProcessExit(browser, 3_000);
  }
  if (browser.exitCode === null && browser.signalCode === null) {
    browser.kill('SIGKILL');
    await waitForProcessExit(browser, 1_000);
  }
  await closeServer(server);
  await Promise.all([
    removeTemporaryPath(profileDir),
    removeTemporaryPath(databasePath),
    removeTemporaryPath(packPath),
  ]);
}
