import assert from 'node:assert/strict';
import test from 'node:test';

import { validatePack } from '../src/packs.js';
import { argumentsFrom } from '../tools/build-pack.mjs';
import {
  applyDiscrepancyReview,
  createDiscrepancyReview,
  detectStatementRelationCandidates,
} from '../tools/lib/discrepancy-review.mjs';

function fixturePack({
  id,
  title = id,
  statement,
  quote = statement,
  subject = 'Общий предмет',
  object = null,
  date = '2026-01-01',
  claimId = 'claim.main',
} = {}) {
  const entities = [{ id: 'subject.main', name: subject, aliases: [] }];
  if (object) entities.push({ id: 'object.main', name: object, aliases: [] });
  const pack = {
    schemaVersion: 1,
    id,
    version: '1.0.0',
    title,
    description: 'Test pack',
    language: 'ru',
    publishedAt: `${date}T00:00:00.000Z`,
    documents: [{
      id: 'doc.main',
      title: `${title} document`,
      effectiveFrom: date,
      source: { title: title, date },
      sections: [{
        id: 'section.main',
        title: 'Section',
        text: quote,
        entityIds: entities.map((entity) => entity.id),
        tags: [],
      }],
    }],
    entities,
    claims: [{
      id: claimId,
      text: statement,
      subjectId: 'subject.main',
      ...(object ? { objectId: 'object.main' } : {}),
      source: { documentId: 'doc.main', sectionId: 'section.main', quote },
    }],
    relations: [],
  };
  assert.equal(validatePack(pack).valid, true);
  return pack;
}

test('detects a numeric difference against an existing prepared pack', () => {
  const target = fixturePack({
    id: 'target.pack',
    title: 'Новая редакция',
    statement: 'Для препарата рекомендуется доза 5 мг в сутки.',
  });
  const reference = fixturePack({
    id: 'reference.pack',
    title: 'Предыдущая редакция',
    statement: 'Для препарата рекомендуется доза 10 мг в сутки.',
    date: '2024-01-01',
  });

  const [candidate] = detectStatementRelationCandidates({ pack: target, referencePacks: [reference] });
  assert.ok(candidate);
  assert.equal(candidate.suggestedType, 'contradicts');
  assert.deepEqual(candidate.signals, ['numeric_difference']);
  assert.equal(candidate.sourceClaimId, 'claim.main');
  assert.equal(candidate.targetClaimId, 'reference.pack::claim.main');
  assert.equal(candidate.source.documentTitle, 'Новая редакция document');
  assert.equal(candidate.target.date, '2024-01-01');
  assert.match(candidate.reason, /5.*10.*мг/u);
});

test('detects negation and scope differences without selecting a winner', () => {
  const negated = fixturePack({
    id: 'target.negation',
    statement: 'Этот метод не рекомендуется для планового применения.',
  });
  const positive = fixturePack({
    id: 'reference.negation',
    statement: 'Этот метод рекомендуется для планового применения.',
  });
  const [negationCandidate] = detectStatementRelationCandidates({
    pack: negated,
    referencePacks: [positive],
  });
  assert.ok(negationCandidate.signals.includes('negation_difference'));
  assert.equal(negationCandidate.decision, 'pending');

  const children = fixturePack({
    id: 'target.children',
    statement: 'Метод применяется у детей старше 6 лет.',
  });
  const adults = fixturePack({
    id: 'reference.adults',
    statement: 'Метод применяется у взрослых старше 18 лет.',
  });
  const [scopeCandidate] = detectStatementRelationCandidates({
    pack: children,
    referencePacks: [adults],
  });
  assert.ok(scopeCandidate.signals.includes('scope_difference'));
  assert.equal(scopeCandidate.selectedType, 'different_scope');
});

test('ignores unrelated statements and already reviewed pairs', () => {
  const target = fixturePack({
    id: 'target.unrelated',
    subject: 'Хранение данных',
    statement: 'Индекс хранится на диске.',
  });
  const unrelated = fixturePack({
    id: 'reference.unrelated',
    subject: 'Питание растений',
    statement: 'Растению требуется регулярный полив.',
  });
  assert.deepEqual(detectStatementRelationCandidates({ pack: target, referencePacks: [unrelated] }), []);

  const related = fixturePack({
    id: 'reference.reviewed',
    subject: 'Хранение данных',
    statement: 'Индекс хранится в памяти.',
  });
  target.statementRelations = [{
    id: 'already-reviewed',
    sourceClaimId: 'claim.main',
    targetClaimId: 'reference.reviewed::claim.main',
    type: 'contradicts',
    status: 'confirmed',
  }];
  assert.deepEqual(detectStatementRelationCandidates({ pack: target, referencePacks: [related] }), []);
});

test('creates a deterministic review and applies only accepted decisions', () => {
  const target = fixturePack({
    id: 'target.review',
    statement: 'Рекомендуемая продолжительность составляет 5 дней.',
  });
  const reference = fixturePack({
    id: 'reference.review',
    statement: 'Рекомендуемая продолжительность составляет 7 дней.',
  });
  const first = createDiscrepancyReview({
    pack: target,
    referencePacks: [reference],
    generatedAt: '2026-08-03T00:00:00.000Z',
  });
  const second = createDiscrepancyReview({
    pack: target,
    referencePacks: [reference],
    generatedAt: '2026-08-03T00:00:00.000Z',
  });
  assert.deepEqual(first, second);
  assert.equal(first.candidates.length, 1);

  const pendingPack = applyDiscrepancyReview(target, first);
  assert.deepEqual(pendingPack.statementRelations, []);

  first.candidates[0].decision = 'accept';
  first.candidates[0].selectedType = 'different_scope';
  first.candidates[0].reason = 'Проверено вручную: разные условия.';
  const reviewed = applyDiscrepancyReview(target, first, {
    reviewedAt: '2026-08-03T01:00:00.000Z',
    reviewedBy: 'Reviewer',
  });
  assert.equal(validatePack(reviewed).valid, true);
  assert.equal(reviewed.statementRelations.length, 1);
  assert.equal(reviewed.statementRelations[0].type, 'different_scope');
  assert.equal(reviewed.statementRelations[0].status, 'confirmed');
  assert.equal(reviewed.statementRelations[0].detectedBy, 'rule+human-review');
  assert.equal(reviewed.statementRelations[0].reviewedBy, 'Reviewer');
});

test('CLI accepts several comparison packs without overwriting earlier paths', () => {
  const args = argumentsFrom([
    '--input', 'input',
    '--output', 'output.json',
    '--compare-pack', 'first.json',
    '--compare-pack', 'second.json',
    '--discrepancy-review-out', 'review.json',
  ]);
  assert.deepEqual(args.comparePack, ['first.json', 'second.json']);
  assert.equal(args.discrepancyReviewOut, 'review.json');
});
