import assert from 'node:assert/strict';
import test from 'node:test';

import { diffTextSegments } from '../src/helpers/text-diff.js';

test('highlights only changed values in two similar statements', () => {
  const diff = diffTextSegments(
    'Рекомендуемое значение составляет 5 мг.',
    'Рекомендуемое значение составляет 10 мг.',
  );
  assert.equal(diff.left.filter((item) => item.changed).map((item) => item.text).join(''), '5');
  assert.equal(diff.right.filter((item) => item.changed).map((item) => item.text).join(''), '10');
  assert.equal(diff.left.map((item) => item.text).join(''), 'Рекомендуемое значение составляет 5 мг.');
});

test('keeps identical statements unmarked', () => {
  const diff = diffTextSegments('Одинаковый текст.', 'Одинаковый текст.');
  assert.equal(diff.left.some((item) => item.changed), false);
  assert.equal(diff.right.some((item) => item.changed), false);
});
