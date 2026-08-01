#!/usr/bin/env node
import assert from 'node:assert/strict';
import { createReadStream } from 'node:fs';
import { access, mkdtemp, rm, stat } from 'node:fs/promises';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { extname, join, resolve, sep } from 'node:path';
import { spawn, spawnSync } from 'node:child_process';

const root = process.cwd();
const dist = resolve(root, 'dist');
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

function createStaticServer() {
  const types = new Map([
    ['.css', 'text/css; charset=utf-8'],
    ['.html', 'text/html; charset=utf-8'],
    ['.js', 'text/javascript; charset=utf-8'],
    ['.json', 'application/json; charset=utf-8'],
    ['.svg', 'image/svg+xml'],
    ['.wasm', 'application/wasm'],
    ['.woff2', 'font/woff2'],
    ['.webmanifest', 'application/manifest+json; charset=utf-8'],
  ]);
  return createServer(async (request, response) => {
    try {
      const url = new URL(request.url ?? '/', `http://${request.headers.host}`);
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
      const raw = typeof event.data === 'string' ? event.data : await event.data.text?.() ?? String(event.data);
      const message = JSON.parse(raw);
      if (!message.id) return;
      const pending = this.pending.get(message.id);
      if (!pending) return;
      this.pending.delete(message.id);
      if (message.error) pending.reject(new Error(message.error.message));
      else pending.resolve(message.result);
    });
    socket.addEventListener('close', () => {
      for (const pending of this.pending.values()) pending.reject(new Error('CDP socket closed'));
      this.pending.clear();
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
      throw new Error(response.exceptionDetails.exception?.description ?? response.exceptionDetails.text ?? 'Evaluation failed');
    }
    return response.result?.value;
  }

  close() {
    this.socket.close();
  }
}

const executable = browserExecutable();
if (!executable) {
  const message = 'Chrome/Chromium was not found; SQLite browser smoke was skipped.';
  if (required) throw new Error(message);
  console.log(message);
  process.exit(0);
}
if (typeof WebSocket !== 'function') throw new Error('Node WebSocket support is required.');
await access(join(dist, 'index.html'));

const server = createStaticServer();
await new Promise((resolvePromise, reject) => {
  server.once('error', reject);
  server.listen(0, '127.0.0.1', resolvePromise);
});
const address = server.address();
const appPort = typeof address === 'object' && address ? address.port : 4173;
const debugPort = 9_500 + Math.floor(Math.random() * 400);
const profileDir = await mkdtemp(join(tmpdir(), 'l-note-sqlite-smoke-'));
const appUrl = `http://127.0.0.1:${appPort}/#/search`;
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
    return targets.find((item) => item.type === 'page' && item.url.startsWith(`http://127.0.0.1:${appPort}/`));
  }, 'SQLite smoke browser target did not become available');
  client = await CdpClient.connect(target.webSocketDebuggerUrl);
  await client.send('Runtime.enable');

  const result = await client.evaluate(`(async () => {
    const { createSqliteFtsSearchPort } = await import('./src/adapters/sqlite-fts-search.js');
    const records = [{
      id: 'section:smoke:bronchiolitis',
      kind: 'section',
      packId: 'smoke',
      packTitle: 'SQLite smoke',
      documentId: 'smoke.bronchiolitis',
      documentTitle: 'Бронхиолит у детей',
      sectionId: 'clinical',
      title: 'Свистящее дыхание',
      body: 'При бронхиолите возможно свистящее дыхание и затруднение выдоха.',
      aliases: 'бронхообструкция',
      entityNames: 'Бронхиолит',
      tags: 'педиатрия дыхательная система',
      authority: 'reference',
    }];
    let firstPort;
    let reopenedPort;
    try {
      firstPort = createSqliteFtsSearchPort();
      const firstBuild = await firstPort.build(records, { fingerprint: 'browser-sqlite-smoke-v1' });
      const exact = await firstPort.search('бронхиолит', { limit: 5 });
      const fuzzy = await firstPort.search('бронхиалит', { limit: 5 });
      const suggestions = await firstPort.suggest('бронхи', 5);
      await firstPort.close();
      firstPort = null;

      reopenedPort = createSqliteFtsSearchPort();
      const reopenedBuild = await reopenedPort.build(records, { fingerprint: 'browser-sqlite-smoke-v1' });
      const reopenedExact = await reopenedPort.search('бронхиолит', { limit: 5 });
      return {
        firstBuild,
        reopenedBuild,
        exactId: exact[0]?.id ?? null,
        fuzzyId: fuzzy[0]?.id ?? null,
        reopenedExactId: reopenedExact[0]?.id ?? null,
        suggestions,
      };
    } finally {
      await firstPort?.close?.();
      await reopenedPort?.close?.();
    }
  })()`);

  assert.equal(result.firstBuild.backend, 'sqlite-fts5-idb-v1');
  assert.equal(result.firstBuild.storage, 'indexeddb-vfs');
  assert.equal(result.firstBuild.recordCount, 1);
  assert.equal(result.reopenedBuild.reused, true);
  assert.equal(result.exactId, 'section:smoke:bronchiolitis');
  assert.equal(result.fuzzyId, 'section:smoke:bronchiolitis');
  assert.equal(result.reopenedExactId, 'section:smoke:bronchiolitis');
  assert.ok(result.suggestions.includes('бронхиолит'));
  console.log(`SQLite browser smoke passed: SQLite ${result.firstBuild.sqliteVersion}, persisted FTS5 index reopened from IndexedDB.`);
} finally {
  client?.close();
  browser.kill('SIGTERM');
  await waitForProcessExit(browser);
  if (browser.exitCode === null && browser.signalCode === null) {
    browser.kill('SIGKILL');
    await waitForProcessExit(browser, 1_000);
  }
  await closeServer(server);
  await rm(profileDir, { recursive: true, force: true, maxRetries: 20, retryDelay: 100 });
}
