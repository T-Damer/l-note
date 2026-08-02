import assert from 'node:assert/strict';
import test from 'node:test';

import { createRoutedResourceRenderer } from '../src/pages/routed-resource-renderer.js';

test('routes a supported resource to its registered renderer', () => {
  const calls = [];
  const renderer = createRoutedResourceRenderer({
    renderers: {
      document(route) {
        calls.push(route);
        return true;
      },
    },
  });
  const route = { kind: 'resource', resourceType: 'document', resourceId: 'doc-1' };

  assert.equal(renderer.render(route), true);
  assert.deepEqual(calls, [route]);
  assert.equal(renderer.supports('document'), true);
  assert.equal(renderer.supports('concept'), false);
});

test('reports a missing or failed resource through one callback', () => {
  const missing = [];
  const renderer = createRoutedResourceRenderer({
    renderers: {
      concept() { return false; },
    },
    onMissing(route) { missing.push(route); },
  });
  const unsupported = { kind: 'resource', resourceType: 'statement', resourceId: 'claim-1' };
  const failed = { kind: 'resource', resourceType: 'concept', resourceId: 'concept-1' };

  assert.equal(renderer.render(unsupported), false);
  assert.equal(renderer.render(failed), false);
  assert.deepEqual(missing, [unsupported, failed]);
});

test('ignores page routes without invoking the missing callback', () => {
  let missingCalls = 0;
  const renderer = createRoutedResourceRenderer({
    onMissing() { missingCalls += 1; },
  });

  assert.equal(renderer.render({ kind: 'page', page: 'search' }), false);
  assert.equal(renderer.render(null), false);
  assert.equal(missingCalls, 0);
});
