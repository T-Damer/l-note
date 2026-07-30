import assert from 'node:assert/strict';
import test from 'node:test';

import { fieldClassName, switchClassName } from '../src/ui/components.js';

test('shared field and switch classes are centralized', () => {
  assert.equal(fieldClassName(), 'ui-field');
  assert.equal(fieldClassName('compact'), 'ui-field compact');
  assert.equal(switchClassName(), 'ui-switch');
  assert.equal(switchClassName('search-priority-switch', true), 'ui-switch is-disabled search-priority-switch');
});
