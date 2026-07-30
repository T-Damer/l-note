import assert from 'node:assert/strict';
import test from 'node:test';

import { cardClassName, controlClassName } from '../src/ui/components.js';
import { iconName, iconNameForCategory, iconNameForSearchResult } from '../src/ui/icons.js';
import { textClassName, textVariant } from '../src/ui/text.js';

test('Text variants are centralized and have a safe body fallback', () => {
  assert.deepEqual(textVariant('title'), { tag: 'h2', className: 'text text--title' });
  assert.deepEqual(textVariant('missing'), { tag: 'p', className: 'text text--body' });
  assert.equal(textClassName('muted', 'extra'), 'text text--muted extra');
});

test('unknown icon categories use the centralized placeholder', () => {
  assert.equal(iconName('search'), 'magnifying-glass');
  assert.equal(iconName('forward'), 'arrow-right');
  assert.equal(iconName('graph'), 'share-network');
  assert.equal(iconName('list'), 'list-bullets');
  assert.equal(iconNameForCategory('педиатрия'), 'baby');
  assert.equal(iconNameForCategory('стоматология'), 'tooth');
  assert.equal(iconNameForCategory('unknown-domain'), 'placeholder');
});

test('search result icon selection handles reference and personal records', () => {
  assert.equal(iconNameForSearchResult({ kind: 'note', authority: 'personal' }), 'user-focus');
  assert.equal(iconNameForSearchResult({ kind: 'section', packTitle: 'MiniMed: дыхательная система' }), 'lungs');
  assert.equal(iconNameForSearchResult({ kind: 'section', packTitle: 'MiniMed: лекарственный реестр' }), 'pill');
  assert.equal(iconNameForSearchResult({ kind: 'section', packTitle: 'Неизвестный справочник' }), 'file-text');
});

test('shared controls and cards derive consistent classes', () => {
  assert.equal(controlClassName('primary', 'wide', true), 'primary-button button-with-icon wide');
  assert.equal(controlClassName('missing'), 'secondary-button');
  assert.equal(cardClassName('result', 'personal', true), 'ui-card ui-card--result ui-card--interactive personal');
});
