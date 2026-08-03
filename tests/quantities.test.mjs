import assert from 'node:assert/strict';
import test from 'node:test';

import {
  comparableQuantityDifferences,
  extractComparableQuantities,
} from '../tools/lib/quantities.mjs';

function values(map, dimension) {
  return [...(map.get(dimension)?.values ?? [])];
}

test('normalizes compatible mass, volume and length units', () => {
  const quantities = extractComparableQuantities('500 мг, 0.5 г, 1 л и 2 см');
  assert.deepEqual(values(quantities, 'mass-mg'), [500]);
  assert.deepEqual(values(quantities, 'volume-ml'), [1000]);
  assert.deepEqual(values(quantities, 'length-mm'), [20]);
});

test('does not report equivalent quantities written in different units', () => {
  assert.deepEqual(
    comparableQuantityDifferences('Рекомендуется 500 мг.', 'Рекомендуется 0,5 г.'),
    [],
  );
  assert.deepEqual(
    comparableQuantityDifferences('Объём 1 л.', 'Объём 1000 мл.'),
    [],
  );
});

test('reports a real difference after canonical conversion', () => {
  const [difference] = comparableQuantityDifferences(
    'Рекомендуется 500 мг.',
    'Рекомендуется 1 г.',
  );
  assert.equal(difference.dimension, 'mass-mg');
  assert.equal(difference.unit, 'мг');
  assert.deepEqual(difference.left, [500]);
  assert.deepEqual(difference.right, [1000]);
});

test('does not compare unrelated dimensions', () => {
  assert.deepEqual(comparableQuantityDifferences('5 мг', '5 мл'), []);
});
