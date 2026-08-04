import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildChronology,
  chronologySignals,
  compareEditionIdentifiers,
  compareTemporalValues,
  compareValidityIntervals,
  normalizeTemporal,
} from '../tools/lib/chronology.mjs';

test('normalizes exact and partial ISO temporal values without inventing precision', () => {
  assert.equal(normalizeTemporal('2025').precision, 'year');
  assert.equal(normalizeTemporal('2025-03').precision, 'month');
  assert.equal(normalizeTemporal('2025-03-14').precision, 'day');
  assert.equal(normalizeTemporal('2025-03-14T10:30:00Z').precision, 'instant');
  assert.equal(normalizeTemporal('2025-13'), null);
  assert.equal(normalizeTemporal('2025-02-30'), null);
  assert.equal(normalizeTemporal('March 2025'), null);
});

test('orders partial dates only when every represented date has the same order', () => {
  assert.equal(compareTemporalValues('2025', '2024'), 'source_after_target');
  assert.equal(compareTemporalValues('2025-06', '2025'), 'unknown');
  assert.equal(compareTemporalValues('2025-06', '2025-06'), 'equal');
  assert.equal(compareTemporalValues('2025-06-01', '2025-06-02'), 'source_before_target');
});

test('compares bounded validity intervals conservatively', () => {
  assert.equal(compareValidityIntervals(
    { validFrom: '2025-01-01', validUntil: '2026-01-01' },
    { validFrom: '2023-01-01', validUntil: '2024-01-01' },
  ), 'after');
  assert.equal(compareValidityIntervals(
    { validFrom: '2024-01-01', validUntil: '2025-01-01' },
    { validFrom: '2025-01-01', validUntil: '2026-01-01' },
  ), 'meets');
  assert.equal(compareValidityIntervals(
    { validFrom: '2024-01-01', validUntil: '2027-01-01' },
    { validFrom: '2025-01-01', validUntil: '2026-01-01' },
  ), 'contains');
  assert.equal(compareValidityIntervals(
    { validFrom: '2025', validUntil: null },
    { validFrom: '2026', validUntil: null },
  ), 'unknown');
});

test('compares edition identifiers only under one explicit algorithm', () => {
  assert.equal(compareEditionIdentifiers(
    { identifier: '2.1.0', comparisonAlgorithm: 'semver' },
    { identifier: '2.0.9', comparisonAlgorithm: 'semver' },
  ), 'source_after_target');
  assert.equal(compareEditionIdentifiers(
    { identifier: '10', comparisonAlgorithm: 'integer' },
    { identifier: '2', comparisonAlgorithm: 'integer' },
  ), 'source_after_target');
  assert.equal(compareEditionIdentifiers(
    { identifier: '2025-03', comparisonAlgorithm: 'date' },
    { identifier: '2025', comparisonAlgorithm: 'date' },
  ), 'unknown');
  assert.equal(compareEditionIdentifiers(
    { identifier: '2.0', comparisonAlgorithm: 'semver' },
    { identifier: '1.0' },
  ), 'unknown');
  assert.equal(compareEditionIdentifiers(
    { identifier: 'new', comparisonAlgorithm: 'manual' },
    { identifier: 'old', comparisonAlgorithm: 'manual' },
  ), 'unknown');
});

test('orients explicit edition relations from source to target', () => {
  const chronology = buildChronology({
    documentId: 'doc.new',
    documentRef: 'new.pack::doc.new',
    publishedAt: '2025-01-01',
    validFrom: '2025-01-01',
    validUntil: '2026-01-01',
    edition: {
      seriesId: 'guideline.example',
      identifier: '2.0',
      comparisonAlgorithm: 'semver',
      status: 'active',
      predecessor: 'old.pack::doc.old',
      relationToPredecessor: 'replaces',
    },
  }, {
    documentId: 'doc.old',
    documentRef: 'old.pack::doc.old',
    publishedAt: '2023-01-01',
    validFrom: '2023-01-01',
    validUntil: '2024-01-01',
    edition: {
      seriesId: 'guideline.example',
      identifier: '1.0',
      comparisonAlgorithm: 'semver',
      status: 'retired',
    },
  });

  assert.equal(chronology.issueOrder, 'source_after_target');
  assert.equal(chronology.validityRelation, 'after');
  assert.equal(chronology.sameSeries, true);
  assert.equal(chronology.versionOrder, 'source_after_target');
  assert.equal(chronology.explicitArtifactRelation, 'replaces');
  assert.deepEqual(chronologySignals(chronology), [
    'same_edition_series',
    'later_issue_date',
    'validity_intervals_do_not_overlap',
    'later_edition',
    'explicit_replacement',
  ]);
});
