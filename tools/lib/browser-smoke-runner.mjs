import { createReadStream } from 'node:fs';
import { mkdtemp, rm, stat } from 'node:fs/promises';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { extname, join, resolve, sep } from 'node:path';
import { spawn, spawnSync } from 'node:child_process';

const BROWSER_CANDIDATES = [
  process.env.CHROME_BIN,
  'google-chrome-stable',
  'google-chrome',
  'chromium',
  'chromium-browser',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/Applications/Chromium.app/Contents/MacOS/Chromium',
].filter(Boolean);

function browserExecutable() {
  for (const candidate of BROWSER_CANDIDATES) {
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

function createStaticServer(dist) {
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

export class CdpClient {
  constructor(socket) {
    this.socket = socket;
    this.nextId = 1;
    this.pending = new Map();
    socket.addEventListener('message', async (event) => {
      const raw = typeof event.data === 'string'
        ? event.data
        : await event.data.text?.() ?? String(event.data);
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
      throw new Error(
        response.exceptionDetails.exception?.description
        ?? response.exceptionDetails.text
        ?? 'Evaluation failed',
      );
    }
    return response.result?.value;
  }

  close() {
    this.socket.close();
  }
}

export async function withStaticBrowser({
  dist = resolve(process.cwd(), 'dist'),
  pathname = '/',
  profilePrefix = 'l-note-browser-smoke-',
  required = process.env.CI === 'true',
  timeoutMs = 90_000,
  run,
} = {}) {
  const executable = browserExecutable();
  if (!executable) {
    const message = 'Chrome/Chromium was not found; browser smoke was skipped.';
    if (required) throw new Error(message);
    console.log(message);
    return null;
  }
  if (typeof WebSocket !== 'function') throw new Error('Node WebSocket support is required.');
  if (typeof run !== 'function') throw new TypeError('withStaticBrowser requires a run callback.');

  const server = createStaticServer(dist);
  await new Promise((resolvePromise, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolvePromise);
  });
  const address = server.address();
  const appPort = typeof address === 'object' && address ? address.port : 4173;
  const debugPort = 9_900 + Math.floor(Math.random() * 400);
  const profileDir = await mkdtemp(join(tmpdir(), profilePrefix));
  const baseUrl = `http://127.0.0.1:${appPort}`;
  const browser = spawn(executable, [
    '--headless=new',
    '--no-sandbox',
    '--disable-gpu',
    '--disable-default-apps',
    '--no-first-run',
    `--remote-debugging-port=${debugPort}`,
    `--user-data-dir=${profileDir}`,
    `${baseUrl}${pathname}`,
  ], { stdio: ['ignore', 'pipe', 'pipe'] });
  browser.stdout?.resume();
  browser.stderr?.resume();

  let client;
  try {
    const target = await waitFor(async () => {
      const response = await fetch(`http://127.0.0.1:${debugPort}/json/list`);
      if (!response.ok) return null;
      const targets = await response.json();
      return targets.find((item) => item.type === 'page' && item.url.startsWith(baseUrl));
    }, 'Browser smoke target did not become available', timeoutMs);
    client = await CdpClient.connect(target.webSocketDebuggerUrl);
    await client.send('Runtime.enable');
    return await run({ client, baseUrl, appPort, timeoutMs });
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
}
