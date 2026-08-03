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
const required = process.env.CI === 'true' || process.env.LNOTE_REQUIRE_PDF_E2E === '1';
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
  return candidates.find((candidate) => (
    spawnSync(candidate, ['--version'], { stdio: 'ignore' }).status === 0
  )) ?? null;
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

function staticServer() {
  const types = new Map([
    ['.html', 'text/html; charset=utf-8'],
    ['.js', 'text/javascript; charset=utf-8'],
    ['.json', 'application/json; charset=utf-8'],
    ['.pdf', 'application/pdf'],
    ['.wasm', 'application/wasm'],
  ]);
  return createServer(async (request, response) => {
    try {
      const url = new URL(request.url ?? '/', `http://${request.headers.host}`);
      let pathname = decodeURIComponent(url.pathname);
      if (pathname.endsWith('/')) pathname += 'index.html';
      const filename = resolve(dist, `.${pathname}`);
      if (filename !== dist && !filename.startsWith(`${dist}${sep}`)) throw new Error('Outside dist');
      const info = await stat(filename);
      if (!info.isFile()) throw new Error('Not a file');
      response.statusCode = 200;
      response.setHeader('Content-Type', types.get(extname(filename)) ?? 'application/octet-stream');
      response.setHeader('Cache-Control', 'no-store');
      createReadStream(filename).pipe(response);
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
  const message = 'Chrome/Chromium was not found; pdf-inspector browser smoke was skipped.';
  if (required) throw new Error(message);
  console.log(message);
  process.exit(0);
}
if (typeof WebSocket !== 'function') throw new Error('Node WebSocket support is required.');
await access(join(dist, 'vendor', 'pdf-inspector', 'pdf_inspector_wasm_bg.wasm'));

const server = staticServer();
await new Promise((resolvePromise, reject) => {
  server.once('error', reject);
  server.listen(0, '127.0.0.1', resolvePromise);
});
const address = server.address();
const appPort = typeof address === 'object' && address ? address.port : 4173;
const debugPort = 10_100 + Math.floor(Math.random() * 80);
const profile = await mkdtemp(join(tmpdir(), 'l-note-pdf-inspector-'));
const browser = spawn(executable, [
  '--headless=new',
  '--no-sandbox',
  '--disable-gpu',
  '--disable-default-apps',
  '--no-first-run',
  `--remote-debugging-port=${debugPort}`,
  `--user-data-dir=${profile}`,
  `http://127.0.0.1:${appPort}/#/library`,
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
  }, 'pdf-inspector smoke browser target did not become available');
  client = await CdpClient.connect(target.webSocketDebuggerUrl);
  await client.send('Runtime.enable');
  const result = await client.evaluate(`(async () => {
    const base = 'http://127.0.0.1:${appPort}/';
    const { inspectBrowserPdf } = await import(base + 'src/services/browser-pdf-inspector.js');
    const response = await fetch(base + 'assets/lnote-source-demo.pdf');
    const file = new File([await response.arrayBuffer()], 'lnote-source-demo.pdf', { type: 'application/pdf' });
    const parsed = await inspectBrowserPdf(file);
    return {
      pdfType: parsed.pdfType,
      pageCount: parsed.pageCount,
      parserVersion: parsed.parserVersion,
      markdownLength: parsed.markdown?.length ?? 0,
    };
  })()`);
  assert.ok(result.pageCount >= 1, JSON.stringify(result));
  assert.equal(result.parserVersion, '0.1.3');
  assert.ok(result.markdownLength > 20, JSON.stringify(result));
  console.log(`pdf-inspector browser smoke passed: ${result.pdfType}, ${result.pageCount} page(s).`);
} finally {
  client?.close();
  browser.kill('SIGKILL');
  await new Promise((resolvePromise) => server.close(resolvePromise));
  await rm(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
}
