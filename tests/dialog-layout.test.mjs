import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function rule(source, selector) {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
  return new RegExp(`${escaped}\\s*\\{(?<body>[^}]*)\\}`, 'u').exec(source)?.groups?.body ?? '';
}

test('routed dialogs expose exactly one user-scrollable container', async () => {
  const source = await readFile(path.join(root, 'styles', '_dialog-scroll.scss'), 'utf8');

  assert.match(rule(source, '.sheet-dialog'), /overflow:\s*hidden/u);
  const shellRule = rule(source, '.dialog-shell');
  assert.match(shellRule, /display:\s*grid/u);
  assert.match(shellRule, /grid-template-rows:\s*auto\s+minmax\(0,\s*1fr\)\s+auto/u);
  assert.match(shellRule, /overflow:\s*hidden/u);
  assert.match(source, /html:has\(body\.modal-open\)[\s\S]*overflow:\s*hidden/u);

  const bodyRule = rule(source, '.dialog-body');
  assert.match(bodyRule, /min-height:\s*0/u);
  assert.match(bodyRule, /overflow-x:\s*hidden/u);
  assert.match(bodyRule, /overflow-y:\s*auto/u);
  assert.doesNotMatch(bodyRule, /overflow:\s*auto/u);
});

test('modal close controls stay in the right header column', async () => {
  const source = await readFile(path.join(root, 'styles', '_dialog-scroll.scss'), 'utf8');
  const closeRule = rule(source, ".dialog-header > [data-action='close-resource-chain']");
  assert.match(closeRule, /grid-column:\s*3/u);
  assert.match(closeRule, /justify-self:\s*end/u);
  assert.match(closeRule, /margin-left:\s*auto/u);
  assert.match(rule(source, '.dialog-heading'), /grid-column:\s*2/u);
});

test('mobile routed dialogs occupy the available viewport without delegating scroll to dialog', async () => {
  const source = await readFile(path.join(root, 'styles', '_dialog-scroll.scss'), 'utf8');
  assert.match(source, /height:\s*calc\(100dvh\s*-\s*env\(safe-area-inset-top\)\)/u);
  assert.match(source, /max-height:\s*calc\(100dvh\s*-\s*env\(safe-area-inset-top\)\)/u);
});
