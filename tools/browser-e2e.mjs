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
const required = process.env.CI === 'true' || process.env.LNOTE_REQUIRE_BROWSER_E2E === '1';
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
    const result = spawnSync(candidate, ['--version'], { stdio: 'ignore' });
    if (result.status === 0) return candidate;
  }
  return null;
}

async function waitFor(check, message, timeoutMs = 15_000) {
  const startedAt = Date.now();
  let lastError;
  while (Date.now() - startedAt < timeoutMs) {
    try {
      const value = await check();
      if (value) return value;
    } catch (error) {
      lastError = error;
    }
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 75));
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

function createStaticServer() {
  const types = new Map([
    ['.css', 'text/css; charset=utf-8'],
    ['.html', 'text/html; charset=utf-8'],
    ['.js', 'text/javascript; charset=utf-8'],
    ['.json', 'application/json; charset=utf-8'],
    ['.svg', 'image/svg+xml'],
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
    const id = this.nextId++;
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
  const message = 'Chrome/Chromium was not found; browser E2E was skipped.';
  if (required) throw new Error(message);
  console.log(message);
  process.exit(0);
}
if (typeof WebSocket !== 'function') throw new Error('Node WebSocket support is required for browser E2E.');
await access(join(dist, 'index.html'));

const server = createStaticServer();
await new Promise((resolvePromise, reject) => {
  server.once('error', reject);
  server.listen(0, '127.0.0.1', resolvePromise);
});
const address = server.address();
const appPort = typeof address === 'object' && address ? address.port : 4173;
const debugPort = 9_000 + Math.floor(Math.random() * 500);
const profileDir = await mkdtemp(join(tmpdir(), 'l-note-browser-e2e-'));
const directHash = '#/package/minimed.infectious.ru?from=library&depth=1';
const appUrl = `http://127.0.0.1:${appPort}/${directHash}`;
const browser = spawn(executable, [
  '--headless=new',
  '--no-sandbox',
  '--disable-gpu',
  '--disable-background-networking',
  '--disable-default-apps',
  '--no-first-run',
  '--window-size=1000,700',
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
  }, 'Browser target did not become available');

  client = await CdpClient.connect(target.webSocketDebuggerUrl);
  await client.send('Runtime.enable');
  await client.send('Page.enable');

  const packageOpen = () => client.evaluate(`
    document.readyState === 'complete' &&
    document.querySelector('#document-dialog')?.open === true &&
    document.querySelector('#document-dialog-heading')?.textContent.includes('MiniMed: детские инфекции')
  `);
  await waitFor(packageOpen, 'Direct package route was not restored');
  assert.match(await client.evaluate('location.hash'), /^#\/package\/minimed\.infectious\.ru/u);

  await client.send('Page.reload', { ignoreCache: true });
  await waitFor(packageOpen, 'Package dialog was not restored after reload');

  const scrollState = await client.evaluate(`(async () => {
    const dialog = document.querySelector('#document-dialog');
    const shell = dialog.querySelector('.dialog-shell');
    const body = dialog.querySelector('.dialog-body');
    const marker = document.createElement('div');
    marker.id = 'e2e-scroll-marker';
    marker.style.height = '4200px';
    marker.style.flex = '0 0 4200px';
    body.append(marker);
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    const result = {
      dialogOverflowY: getComputedStyle(dialog).overflowY,
      shellOverflowY: getComputedStyle(shell).overflowY,
      bodyOverflowY: getComputedStyle(body).overflowY,
      bodyScrollable: body.scrollHeight > body.clientHeight,
      bodyLocked: document.body.classList.contains('modal-open') && getComputedStyle(document.body).overflowY === 'hidden',
    };
    marker.remove();
    return result;
  })()`);
  assert.equal(scrollState.dialogOverflowY, 'hidden');
  assert.equal(scrollState.shellOverflowY, 'hidden');
  assert.equal(scrollState.bodyOverflowY, 'auto');
  assert.equal(scrollState.bodyScrollable, true);
  assert.equal(scrollState.bodyLocked, true);

  assert.equal(await client.evaluate(`(() => {
    const button = [...document.querySelectorAll('#document-dialog-body button')]
      .find((item) => item.textContent.includes('Скачать пакет'));
    button?.click();
    return Boolean(button);
  })()`), true);

  await waitFor(
    () => client.evaluate(`
      [...document.querySelectorAll('#document-dialog-body .backlink-button')]
        .some((button) => button.textContent.includes('Ротавирусный гастроэнтерит'))
    `),
    'Installed package contents did not appear',
  );

  const openRotavirus = () => client.evaluate(`(() => {
    const button = [...document.querySelectorAll('#document-dialog-body .backlink-button')]
      .find((item) => item.textContent.includes('Ротавирусный гастроэнтерит'));
    button?.click();
    return Boolean(button);
  })()`);
  assert.equal(await openRotavirus(), true);
  await waitFor(
    () => client.evaluate(`location.hash.startsWith('#/document/kr.rf.755_1.rotavirus') && document.querySelector('#document-dialog')?.open`),
    'Rotavirus document route did not open',
  );
  assert.equal(await client.evaluate(`!document.querySelector('#document-dialog .dialog-back-button')?.hidden`), true);

  await client.evaluate('history.back(); true');
  await waitFor(packageOpen, 'Back did not return to the package card');

  await client.send('Page.reload', { ignoreCache: true });
  await waitFor(packageOpen, 'Installed package route did not survive reload');
  assert.equal(await openRotavirus(), true);
  await waitFor(
    () => client.evaluate(`location.hash.startsWith('#/document/kr.rf.755_1.rotavirus')`),
    'Rotavirus route did not reopen',
  );

  assert.equal(await client.evaluate(`(() => {
    const button = document.querySelector('#document-dialog [data-action="close-resource-chain"]');
    button?.click();
    return Boolean(button);
  })()`), true);
  await waitFor(
    () => client.evaluate(`location.hash === '#/library' && ![...document.querySelectorAll('dialog')].some((item) => item.open)`),
    'Full close did not return to the base route',
  );

  await client.evaluate('history.back(); true');
  await new Promise((resolvePromise) => setTimeout(resolvePromise, 300));
  assert.equal(await client.evaluate(`location.hash === '#/library' && ![...document.querySelectorAll('dialog')].some((item) => item.open)`), true);

  assert.equal(await client.evaluate(`(() => {
    const button = document.querySelector('[data-action="toggle-library-view"]');
    button?.click();
    return Boolean(button);
  })()`), true);
  await waitFor(
    () => client.evaluate(`
      document.querySelector('[data-action="toggle-library-view"]')?.getAttribute('aria-pressed') === 'true' &&
      !document.querySelector('#knowledge-graph-view')?.classList.contains('hidden') &&
      document.querySelectorAll('#knowledge-graph-view .knowledge-graph-node').length > 0
    `),
    'Knowledge graph view did not open',
  );

  const mixedGraphNode = await client.evaluate(`(() => {
    const node = [...document.querySelectorAll('#knowledge-graph-view .knowledge-graph-node')]
      .find((item) => item.textContent.includes('Демонстрация: педиатрия и стоматология'));
    const fill = node?.querySelector('rect')?.getAttribute('fill') ?? '';
    return { found: Boolean(node), mixedGradient: fill.startsWith('url(#') };
  })()`);
  assert.equal(mixedGraphNode.found, true);
  assert.equal(mixedGraphNode.mixedGradient, true);

  assert.equal(await client.evaluate(`(() => {
    const node = [...document.querySelectorAll('#knowledge-graph-view .knowledge-graph-node')]
      .find((item) => item.textContent.includes('Демонстрация: педиатрия и стоматология'));
    node?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    return Boolean(node);
  })()`), true);
  await waitFor(
    () => client.evaluate(`
      location.hash.startsWith('#/package/lnote.mixed-domains.demo') &&
      document.querySelector('#document-dialog')?.open === true &&
      document.querySelector('#document-dialog-heading')?.textContent.includes('Демонстрация: педиатрия и стоматология')
    `),
    'Mixed-domain graph node did not open its routed package card',
  );

  assert.equal(await client.evaluate(`(() => {
    const button = [...document.querySelectorAll('#document-dialog-body button')]
      .find((item) => item.textContent.includes('Скачать пакет'));
    button?.click();
    return Boolean(button);
  })()`), true);
  await waitFor(
    () => client.evaluate(`
      [...document.querySelectorAll('#document-dialog-body .backlink-button')]
        .some((button) => button.textContent.includes('Как отображается междоменное знание'))
    `),
    'Mixed-domain package did not install from the graph route',
  );

  assert.equal(await client.evaluate(`(() => {
    const button = document.querySelector('#document-dialog [data-action="close-resource-chain"]');
    button?.click();
    return Boolean(button);
  })()`), true);
  await waitFor(
    () => client.evaluate(`
      location.hash === '#/library' &&
      ![...document.querySelectorAll('dialog')].some((item) => item.open) &&
      !document.querySelector('#knowledge-graph-view')?.classList.contains('hidden')
    `),
    'Graph route did not return to the active graph view after package installation',
  );
  assert.equal(await client.evaluate(`(() => {
    const node = [...document.querySelectorAll('#knowledge-graph-view .knowledge-graph-node')]
      .find((item) => item.textContent.includes('Демонстрация: педиатрия и стоматология'));
    return Boolean(node && !node.classList.contains('is-uninstalled'));
  })()`), true);

  console.log('Browser E2E passed: routing, single modal scroll, model-independent shell and graph installation flow.');
} finally {
  client?.close();
  browser.kill('SIGTERM');
  await waitForProcessExit(browser);
  if (browser.exitCode === null && browser.signalCode === null) {
    browser.kill('SIGKILL');
    await waitForProcessExit(browser, 1_000);
  }
  await new Promise((resolvePromise) => server.close(resolvePromise));
  await rm(profileDir, { recursive: true, force: true, maxRetries: 20, retryDelay: 100 });
}
