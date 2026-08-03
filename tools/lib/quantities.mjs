const NUMBER_UNIT = /(-?\d+(?:[.,]\d+)?)\s*(%|мг|г|кг|мкг|мл|л|мм|см|м|°c|ч|час(?:а|ов)?|дн(?:я|ей)?|недел(?:я|и|ь)|месяц(?:а|ев)?|лет|год(?:а|ов)?|mg|g|kg|mcg|ml|l|mm|cm|m|hours?|days?|weeks?|months?|years?)?/giu;

const UNIT_DEFINITIONS = Object.freeze({
  '%': ['percent', 1, '%'],
  '°c': ['temperature-c', 1, '°C'],
  'мкг': ['mass-mg', .001, 'мг'],
  mcg: ['mass-mg', .001, 'мг'],
  'мг': ['mass-mg', 1, 'мг'],
  mg: ['mass-mg', 1, 'мг'],
  'г': ['mass-mg', 1000, 'мг'],
  g: ['mass-mg', 1000, 'мг'],
  'кг': ['mass-mg', 1_000_000, 'мг'],
  kg: ['mass-mg', 1_000_000, 'мг'],
  'мл': ['volume-ml', 1, 'мл'],
  ml: ['volume-ml', 1, 'мл'],
  'л': ['volume-ml', 1000, 'мл'],
  l: ['volume-ml', 1000, 'мл'],
  'мм': ['length-mm', 1, 'мм'],
  mm: ['length-mm', 1, 'мм'],
  'см': ['length-mm', 10, 'мм'],
  cm: ['length-mm', 10, 'мм'],
  'м': ['length-mm', 1000, 'мм'],
  m: ['length-mm', 1000, 'мм'],
  'ч': ['duration-hour', 1, 'ч'],
  'час': ['duration-hour', 1, 'ч'],
  'часа': ['duration-hour', 1, 'ч'],
  'часов': ['duration-hour', 1, 'ч'],
  hour: ['duration-hour', 1, 'ч'],
  hours: ['duration-hour', 1, 'ч'],
  'дня': ['duration-day', 1, 'дн'],
  'дней': ['duration-day', 1, 'дн'],
  day: ['duration-day', 1, 'дн'],
  days: ['duration-day', 1, 'дн'],
  'неделя': ['duration-week', 1, 'нед'],
  'недели': ['duration-week', 1, 'нед'],
  'недель': ['duration-week', 1, 'нед'],
  week: ['duration-week', 1, 'нед'],
  weeks: ['duration-week', 1, 'нед'],
  'месяц': ['duration-month', 1, 'мес'],
  'месяца': ['duration-month', 1, 'мес'],
  'месяцев': ['duration-month', 1, 'мес'],
  month: ['duration-month', 1, 'мес'],
  months: ['duration-month', 1, 'мес'],
  'лет': ['duration-year', 1, 'лет'],
  'год': ['duration-year', 1, 'лет'],
  'года': ['duration-year', 1, 'лет'],
  'годов': ['duration-year', 1, 'лет'],
  year: ['duration-year', 1, 'лет'],
  years: ['duration-year', 1, 'лет'],
});

function normalized(value) {
  return String(value ?? '')
    .normalize('NFKC')
    .toLocaleLowerCase('ru-RU')
    .replaceAll('ё', 'е');
}

function rounded(value) {
  return Number(Number(value).toPrecision(12));
}

function quantityKey(rawUnit) {
  const unit = normalized(rawUnit).trim();
  return UNIT_DEFINITIONS[unit] ?? ['number', 1, ''];
}

export function extractComparableQuantities(value) {
  const byDimension = new Map();
  for (const match of normalized(value).matchAll(NUMBER_UNIT)) {
    const numeric = Number(match[1].replace(',', '.'));
    if (!Number.isFinite(numeric)) continue;
    const [dimension, factor, displayUnit] = quantityKey(match[2] || '');
    const entry = byDimension.get(dimension) ?? { dimension, displayUnit, values: new Set() };
    entry.values.add(rounded(numeric * factor));
    byDimension.set(dimension, entry);
  }
  return byDimension;
}

function sameSet(left, right) {
  return left.size === right.size && [...left].every((value) => right.has(value));
}

export function comparableQuantityDifferences(left, right) {
  const leftValues = extractComparableQuantities(left);
  const rightValues = extractComparableQuantities(right);
  const output = [];
  for (const [dimension, leftEntry] of leftValues) {
    const rightEntry = rightValues.get(dimension);
    if (!rightEntry || sameSet(leftEntry.values, rightEntry.values)) continue;
    output.push({
      dimension,
      unit: leftEntry.displayUnit || rightEntry.displayUnit,
      left: [...leftEntry.values].sort((a, b) => a - b),
      right: [...rightEntry.values].sort((a, b) => a - b),
    });
  }
  return output;
}
