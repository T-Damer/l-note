const DAY_MS = 24 * 60 * 60 * 1000;
const DIRECT_ARTIFACT_RELATIONS = new Set(['replaces', 'amends', 'corrects', 'retracts']);
const INVERSE_ARTIFACT_RELATIONS = Object.freeze({
  replaces: 'replaced_by',
  amends: 'amended_by',
  corrects: 'corrected_by',
  retracts: 'retracted_by',
});

function clean(value) {
  return String(value ?? '').trim();
}

function validCalendarDate(year, month, day) {
  const value = new Date(Date.UTC(year, month - 1, day));
  return value.getUTCFullYear() === year
    && value.getUTCMonth() === month - 1
    && value.getUTCDate() === day;
}

export function normalizeTemporal(value) {
  const source = clean(value);
  if (!source) return null;

  let match = source.match(/^(\d{4})$/u);
  if (match) {
    const year = Number(match[1]);
    if (year < 1) return null;
    return {
      value: source,
      precision: 'year',
      earliest: Date.UTC(year, 0, 1),
      latest: Date.UTC(year + 1, 0, 1) - DAY_MS,
    };
  }

  match = source.match(/^(\d{4})-(\d{2})$/u);
  if (match) {
    const year = Number(match[1]);
    const month = Number(match[2]);
    if (year < 1 || month < 1 || month > 12) return null;
    return {
      value: source,
      precision: 'month',
      earliest: Date.UTC(year, month - 1, 1),
      latest: Date.UTC(year, month, 1) - DAY_MS,
    };
  }

  match = source.match(/^(\d{4})-(\d{2})-(\d{2})$/u);
  if (match) {
    const year = Number(match[1]);
    const month = Number(match[2]);
    const day = Number(match[3]);
    if (year < 1 || !validCalendarDate(year, month, day)) return null;
    const point = Date.UTC(year, month - 1, day);
    return { value: source, precision: 'day', earliest: point, latest: point };
  }

  if (!/^\d{4}-\d{2}-\d{2}T.+(?:Z|[+-]\d{2}:\d{2})$/u.test(source)) return null;
  const point = Date.parse(source);
  if (!Number.isFinite(point)) return null;
  return { value: source, precision: 'instant', earliest: point, latest: point };
}

function temporalView(value) {
  const normalized = normalizeTemporal(value);
  return normalized ? { value: normalized.value, precision: normalized.precision } : null;
}

export function compareTemporalValues(leftValue, rightValue) {
  const left = normalizeTemporal(leftValue);
  const right = normalizeTemporal(rightValue);
  if (!left || !right) return 'unknown';
  if (left.earliest === right.earliest && left.latest === right.latest) return 'equal';
  if (left.earliest > right.latest) return 'source_after_target';
  if (left.latest < right.earliest) return 'source_before_target';
  return 'unknown';
}

function normalizedInterval(value = {}) {
  const from = normalizeTemporal(value.validFrom);
  const until = normalizeTemporal(value.validUntil);
  if (!from || !until) return null;
  if (from.earliest >= until.latest) return null;
  return { from, until };
}

function exactPoint(value) {
  return value && value.earliest === value.latest;
}

export function compareValidityIntervals(sourceValue, targetValue) {
  const source = normalizedInterval(sourceValue);
  const target = normalizedInterval(targetValue);
  if (!source || !target) return 'unknown';

  if (source.from.earliest === target.from.earliest
    && source.from.latest === target.from.latest
    && source.until.earliest === target.until.earliest
    && source.until.latest === target.until.latest) return 'equal';

  if (exactPoint(source.until) && exactPoint(target.from)
    && source.until.earliest === target.from.earliest) return 'meets';
  if (exactPoint(target.until) && exactPoint(source.from)
    && target.until.earliest === source.from.earliest) return 'met_by';

  if (source.until.latest < target.from.earliest) return 'before';
  if (target.until.latest < source.from.earliest) return 'after';

  const sourceCertainlyContains = source.from.latest <= target.from.earliest
    && source.until.earliest >= target.until.latest;
  const targetCertainlyContains = target.from.latest <= source.from.earliest
    && target.until.earliest >= source.until.latest;
  if (sourceCertainlyContains) return 'contains';
  if (targetCertainlyContains) return 'during';

  const certainlyOverlaps = source.from.latest < target.until.earliest
    && target.from.latest < source.until.earliest;
  return certainlyOverlaps ? 'overlaps' : 'unknown';
}

function semverParts(value) {
  const match = clean(value).match(/^v?(\d+)(?:\.(\d+))?(?:\.(\d+))?(?:-([0-9A-Za-z.-]+))?$/u);
  if (!match) return null;
  return {
    numbers: [Number(match[1]), Number(match[2] ?? 0), Number(match[3] ?? 0)],
    prerelease: match[4]?.split('.') ?? [],
  };
}

function comparePrerelease(left, right) {
  if (!left.length && !right.length) return 0;
  if (!left.length) return 1;
  if (!right.length) return -1;
  const length = Math.max(left.length, right.length);
  for (let index = 0; index < length; index += 1) {
    if (left[index] === undefined) return -1;
    if (right[index] === undefined) return 1;
    const leftNumber = /^\d+$/u.test(left[index]) ? Number(left[index]) : null;
    const rightNumber = /^\d+$/u.test(right[index]) ? Number(right[index]) : null;
    if (leftNumber !== null && rightNumber !== null && leftNumber !== rightNumber) {
      return leftNumber < rightNumber ? -1 : 1;
    }
    if (leftNumber !== null && rightNumber === null) return -1;
    if (leftNumber === null && rightNumber !== null) return 1;
    if (left[index] !== right[index]) return left[index] < right[index] ? -1 : 1;
  }
  return 0;
}

function compareSemver(leftValue, rightValue) {
  const left = semverParts(leftValue);
  const right = semverParts(rightValue);
  if (!left || !right) return null;
  for (let index = 0; index < left.numbers.length; index += 1) {
    if (left.numbers[index] !== right.numbers[index]) {
      return left.numbers[index] < right.numbers[index] ? -1 : 1;
    }
  }
  return comparePrerelease(left.prerelease, right.prerelease);
}

function numericComparison(leftValue, rightValue) {
  if (!/^[+-]?\d+$/u.test(clean(leftValue)) || !/^[+-]?\d+$/u.test(clean(rightValue))) return null;
  const left = BigInt(clean(leftValue));
  const right = BigInt(clean(rightValue));
  return left === right ? 0 : left < right ? -1 : 1;
}

function comparisonOrder(value) {
  if (value === null) return 'unknown';
  if (value === 0) return 'equal';
  return value > 0 ? 'source_after_target' : 'source_before_target';
}

export function compareEditionIdentifiers(sourceEdition, targetEdition) {
  const sourceValue = sourceEdition ?? {};
  const targetValue = targetEdition ?? {};
  const sourceIdentifier = clean(sourceValue.identifier);
  const targetIdentifier = clean(targetValue.identifier);
  const sourceAlgorithm = clean(sourceValue.comparisonAlgorithm).toLocaleLowerCase('en-US');
  const targetAlgorithm = clean(targetValue.comparisonAlgorithm).toLocaleLowerCase('en-US');
  if (!sourceIdentifier || !targetIdentifier || !sourceAlgorithm || sourceAlgorithm !== targetAlgorithm) {
    return 'unknown';
  }
  if (sourceAlgorithm === 'manual') return 'unknown';
  if (sourceAlgorithm === 'semver') return comparisonOrder(compareSemver(sourceIdentifier, targetIdentifier));
  if (sourceAlgorithm === 'integer') return comparisonOrder(numericComparison(sourceIdentifier, targetIdentifier));
  if (sourceAlgorithm === 'date') return compareTemporalValues(sourceIdentifier, targetIdentifier);
  if (sourceAlgorithm === 'lexical') {
    return sourceIdentifier === targetIdentifier
      ? 'equal'
      : sourceIdentifier > targetIdentifier ? 'source_after_target' : 'source_before_target';
  }
  return 'unknown';
}

function sameSeries(sourceEdition, targetEdition) {
  const sourceValue = sourceEdition ?? {};
  const targetValue = targetEdition ?? {};
  const source = clean(sourceValue.seriesId);
  const target = clean(targetValue.seriesId);
  if (!source || !target) return null;
  return source === target;
}

function matchesDocumentReference(reference, resource) {
  const value = clean(reference);
  return Boolean(value && [resource.documentRef, resource.documentId].filter(Boolean).includes(value));
}

function explicitArtifactRelation(source, target) {
  const sourceRelation = clean(source.edition?.relationToPredecessor).toLocaleLowerCase('en-US');
  if (DIRECT_ARTIFACT_RELATIONS.has(sourceRelation)
    && matchesDocumentReference(source.edition?.predecessor, target)) return sourceRelation;

  const targetRelation = clean(target.edition?.relationToPredecessor).toLocaleLowerCase('en-US');
  if (DIRECT_ARTIFACT_RELATIONS.has(targetRelation)
    && matchesDocumentReference(target.edition?.predecessor, source)) return INVERSE_ARTIFACT_RELATIONS[targetRelation];
  return null;
}

function sideView(resource = {}) {
  return {
    publishedAt: temporalView(resource.publishedAt),
    modifiedAt: temporalView(resource.modifiedAt),
    retrievedAt: temporalView(resource.retrievedAt),
    validFrom: temporalView(resource.validFrom),
    validUntil: temporalView(resource.validUntil),
    edition: resource.edition ? {
      seriesId: clean(resource.edition.seriesId) || null,
      identifier: clean(resource.edition.identifier) || null,
      comparisonAlgorithm: clean(resource.edition.comparisonAlgorithm) || null,
      status: clean(resource.edition.status) || 'unknown',
    } : null,
  };
}

export function buildChronology(source, target) {
  const seriesMatch = sameSeries(source.edition, target.edition);
  const versionOrder = seriesMatch === true
    ? compareEditionIdentifiers(source.edition, target.edition)
    : 'unknown';
  return {
    issueOrder: compareTemporalValues(source.publishedAt, target.publishedAt),
    validityRelation: compareValidityIntervals(source, target),
    sameSeries: seriesMatch,
    versionOrder,
    explicitArtifactRelation: explicitArtifactRelation(source, target),
    source: sideView(source),
    target: sideView(target),
  };
}

export function chronologySignals(chronology) {
  const signals = [];
  if (chronology.sameSeries === true) signals.push('same_edition_series');
  if (chronology.issueOrder === 'source_after_target') signals.push('later_issue_date');
  if (chronology.issueOrder === 'source_before_target') signals.push('earlier_issue_date');
  if (['before', 'after', 'meets', 'met_by'].includes(chronology.validityRelation)) {
    signals.push('validity_intervals_do_not_overlap');
  }
  if (chronology.versionOrder === 'source_after_target') signals.push('later_edition');
  if (chronology.versionOrder === 'source_before_target') signals.push('earlier_edition');
  const relationSignals = {
    replaces: 'explicit_replacement',
    replaced_by: 'explicit_replacement',
    amends: 'explicit_amendment',
    amended_by: 'explicit_amendment',
    corrects: 'explicit_correction',
    corrected_by: 'explicit_correction',
    retracts: 'explicit_retraction',
    retracted_by: 'explicit_retraction',
  };
  const relationSignal = relationSignals[chronology.explicitArtifactRelation];
  if (relationSignal) signals.push(relationSignal);
  return signals;
}
