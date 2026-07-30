import assert from 'node:assert/strict';
import test from 'node:test';
import {
  baseRouteHash,
  nextResourceRoute,
  parseHashRoute,
  resourceRouteHash,
} from '../src/router.js';

test('parses base pages and falls back to search', () => {
  assert.equal(parseHashRoute('#/ask').page, 'ask');
  assert.equal(parseHashRoute('#/unknown').page, 'search');
  assert.equal(baseRouteHash('library'), '#/library');
});

test('creates and parses a restorable document route', () => {
  const hash = resourceRouteHash('document', 'doc:respiratory/2026', {
    base: 'ask',
    depth: 2,
    sectionId: 'diagnosis',
  });
  const route = parseHashRoute(hash);
  assert.equal(route.kind, 'resource');
  assert.equal(route.resourceType, 'document');
  assert.equal(route.resourceId, 'doc:respiratory/2026');
  assert.equal(route.base, 'ask');
  assert.equal(route.depth, 2);
  assert.equal(route.sectionId, 'diagnosis');
});

test('nested resources preserve the base page and increment depth', () => {
  const first = nextResourceRoute(parseHashRoute('#/search'), 'concept', 'bronchiolitis');
  const second = nextResourceRoute(first, 'statement', 'claim:1');
  assert.equal(first.depth, 1);
  assert.equal(second.depth, 2);
  assert.equal(second.base, 'search');
  assert.equal(parseHashRoute(second.hash).resourceId, 'claim:1');
});

test('resource routes choose a sensible base when opened directly', () => {
  assert.equal(parseHashRoute('#/package/example').base, 'library');
  assert.equal(parseHashRoute('#/note/note-1').base, 'notes');
  assert.equal(parseHashRoute('#/concept/example').base, 'search');
});
