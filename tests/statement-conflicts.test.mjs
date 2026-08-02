import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildStatementConflictIndex,
  qualifyStatementId,
  resolveStatement,
  sectionConflictAnnotations,
  statementRelationLabel,
  statementsForSection,
  validateStatementRelations,
} from '../src/helpers/statement-conflicts.js';

const packs = [
  {
    id: 'pack.a',
    title: 'Источник A',
    publishedAt: '2026-01-01',
    documents: [{
      id: 'doc.a',
      title: 'Документ A',
      effectiveFrom: '2025-01-10',
      sections: [{ id: 'facts', text: 'Рекомендуемое значение составляет 5 мг.' }],
    }],
    claims: [{
      id: 'dose',
      text: 'Рекомендуемое значение составляет 5 мг.',
      source: { documentId: 'doc.a', sectionId: 'facts', quote: '5 мг' },
    }],
    statementRelations: [
      {
        id: 'dose-conflict-b',
        sourceClaimId: 'dose',
        targetClaimId: 'pack.b::dose',
        type: 'contradicts',
        status: 'confirmed',
        reason: 'В источниках указаны разные значения.',
      },
      {
        id: 'dose-conflict-c',
        sourceClaimId: 'dose',
        targetClaimId: 'pack.c::dose',
        type: 'different_scope',
        status: 'confirmed',
      },
    ],
  },
  {
    id: 'pack.b',
    title: 'Источник B',
    documents: [{
      id: 'doc.b',
      title: 'Документ B',
      effectiveFrom: '2026-02-20',
      sections: [{ id: 'facts', text: 'Рекомендуемое значение составляет 10 мг.' }],
    }],
    claims: [{
      id: 'dose',
      text: 'Рекомендуемое значение составляет 10 мг.',
      source: { documentId: 'doc.b', sectionId: 'facts', quote: '10 мг' },
    }],
    statementRelations: [],
  },
  {
    id: 'pack.c',
    title: 'Источник C',
    documents: [{
      id: 'doc.c',
      title: 'Документ C',
      effectiveFrom: '2024-09-01',
      sections: [{ id: 'facts', text: 'Для другой группы применяется значение 7 мг.' }],
    }],
    claims: [{
      id: 'dose',
      text: 'Для другой группы применяется значение 7 мг.',
      source: { documentId: 'doc.c', sectionId: 'facts', quote: '7 мг' },
    }],
    statementRelations: [],
  },
];

test('qualifies statement IDs without rewriting already qualified references', () => {
  assert.equal(qualifyStatementId('pack.a', 'dose'), 'pack.a::dose');
  assert.equal(qualifyStatementId('pack.a', 'pack.b::dose'), 'pack.b::dose');
  assert.equal(qualifyStatementId('', ''), '');
});

test('validates reviewed cross-document statement relations', () => {
  assert.deepEqual(validateStatementRelations(packs[0]), []);
  assert.match(statementRelationLabel('contradicts'), /Противоречит/u);
  const errors = validateStatementRelations({
    ...packs[0],
    statementRelations: [{
      id: 'broken',
      sourceClaimId: 'missing',
      targetClaimId: 'missing',
      type: 'unknown',
      confidence: 2,
    }],
  });
  assert.ok(errors.some((error) => error.includes('unknown local statement')));
  assert.ok(errors.some((error) => error.includes('unsupported')));
  assert.ok(errors.some((error) => error.includes('between 0 and 1')));
});

test('builds a symmetric conflict index with document names and dates', () => {
  const index = buildStatementConflictIndex(packs);
  assert.equal(index.conflicts.length, 2);
  assert.equal(index.unresolved.length, 0);
  const conflict = index.conflicts[0];
  assert.equal(conflict.source.claimRef, 'pack.a::dose');
  assert.equal(conflict.target.claimRef, 'pack.b::dose');
  assert.equal(conflict.source.documentTitle, 'Документ A');
  assert.equal(conflict.target.date, '2026-02-20');
  assert.equal(index.byClaim.get('pack.a::dose').length, 2);
  assert.equal(index.byClaim.get('pack.b::dose')[0], conflict);
});

test('groups several discrepancies under one exact inline marker', () => {
  const index = buildStatementConflictIndex(packs);
  const claims = statementsForSection(packs, 'pack.a', 'doc.a', 'facts');
  const text = packs[0].documents[0].sections[0].text;
  const annotations = sectionConflictAnnotations(text, claims, index);
  assert.equal(annotations.length, 1);
  assert.equal(annotations[0].exact, true);
  assert.equal(annotations[0].position, text.indexOf('5 мг') + 4);
  assert.deepEqual(annotations[0].claimRefs, ['pack.a::dose']);
  assert.equal(annotations[0].conflicts.length, 2);
});

test('resolves duplicate local IDs through pack-qualified statement routes', () => {
  assert.equal(resolveStatement(packs, 'pack.a::dose').text.includes('5 мг'), true);
  assert.equal(resolveStatement(packs, 'pack.b::dose').text.includes('10 мг'), true);
  assert.equal(resolveStatement(packs, 'dose').packId, 'pack.a');
});
