import assert from 'node:assert/strict';
import test from 'node:test';

import { validatePack } from '../src/packs.js';
import { argumentsFrom } from '../tools/build-pack.mjs';
import { renderDiscrepancyReviewHtml } from '../tools/lib/discrepancy-review-html.mjs';
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
  effectiveFrom = date,
  effectiveUntil = null,
  publishedAt = date,
  modifiedAt = null,
  retrievedAt = null,
  edition = null,
  claimId = 'claim.main',
} = {}) {
  const entities = [{ id: 'subject.main', name: subject, aliases: [] }];
  if (object) entities.push({ id: 'object.main', name: object, aliases: [] });
  const source = {
    title,
    date,
    ...(publishedAt ? { publishedAt } : {}),
    ...(modifiedAt ? { modifiedAt } : {}),
    ...(retrievedAt ? { retrievedAt } : {}),
  };
  const document = {
    id: 'doc.main',
    title: `${title} document`,
    effectiveFrom,
    ...(effectiveUntil ? { effectiveUntil } : {}),
    source,
    ...(edition ? { edition } : {}),
    sections: [{
      id: 'section.main',
      title: 'Section',
      text: quote,
      entityIds: entities.map((entity) => entity.id),
      tags: [],
    }],
  };
  const pack = {
    schemaVersion: 1,
    id,
    version: '1.0.0',
    title,
    description: 'Test pack',
    language: 'ru',
    publishedAt: `${date}T00:00:00.000Z`,
    documents: [document],
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

test('detects a numeric difference and exposes issue chronology separately', () => {
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
  assert.deepEqual(candidate.signals, ['numeric_difference', 'later_issue_date']);
  assert.equal(candidate.chronology.issueOrder, 'source_after_target');
  assert.equal(candidate.chronology.validityRelation, 'unknown');
  assert.equal(candidate.sourceClaimId, 'claim.main');
  assert.equal(candidate.targetClaimId, 'reference.pack::claim.main');
  assert.equal(candidate.source.documentTitle, 'Новая редакция document');
  assert.equal(candidate.target.date, '2024-01-01');
  assert.match(candidate.reason, /5.*10.*мг/u);
});

test('chronology alone never creates a discrepancy candidate', () => {
  const target = fixturePack({
    id: 'target.same',
    statement: 'Индекс хранится на диске.',
    date: '2026-01-01',
  });
  const reference = fixturePack({
    id: 'reference.same',
    statement: 'Индекс хранится на диске.',
    date: '2022-01-01',
  });
  assert.deepEqual(detectStatementRelationCandidates({ pack: target, referencePacks: [reference] }), []);
});

test('a later issue date neither implies supersession nor raises confidence', () => {
  const target = fixturePack({
    id: 'target.later',
    statement: 'Рекомендуемая продолжительность составляет 5 дней.',
    date: '2026-01-01',
  });
  const older = fixturePack({
    id: 'reference.older',
    statement: 'Рекомендуемая продолжительность составляет 7 дней.',
    date: '2022-01-01',
  });
  const sameDate = fixturePack({
    id: 'reference.same-date',
    statement: 'Рекомендуемая продолжительность составляет 7 дней.',
    date: '2026-01-01',
  });
  const [laterCandidate] = detectStatementRelationCandidates({ pack: target, referencePacks: [older] });
  const [sameDateCandidate] = detectStatementRelationCandidates({ pack: target, referencePacks: [sameDate] });
  assert.equal(laterCandidate.suggestedType, 'contradicts');
  assert.ok(laterCandidate.signals.includes('later_issue_date'));
  assert.equal(laterCandidate.confidence, sameDateCandidate.confidence);
});

test('uses clearly disjoint validity periods as reviewed scope context', () => {
  const target = fixturePack({
    id: 'target.validity',
    statement: 'Рекомендуемая продолжительность составляет 5 дней.',
    effectiveFrom: '2025-01-01',
    effectiveUntil: '2026-01-01',
  });
  const reference = fixturePack({
    id: 'reference.validity',
    statement: 'Рекомендуемая продолжительность составляет 7 дней.',
    date: '2023-01-01',
    effectiveFrom: '2023-01-01',
    effectiveUntil: '2024-01-01',
  });
  const [candidate] = detectStatementRelationCandidates({ pack: target, referencePacks: [reference] });
  assert.equal(candidate.chronology.validityRelation, 'after');
  assert.ok(candidate.signals.includes('validity_intervals_do_not_overlap'));
  assert.equal(candidate.suggestedType, 'different_scope');
});

test('suggests supersedes only for an explicit replacement in the same edition series', () => {
  const target = fixturePack({
    id: 'target.replace',
    statement: 'Рекомендуемая продолжительность составляет 5 дней.',
    edition: {
      seriesId: 'guideline.duration',
      identifier: '2.0',
      comparisonAlgorithm: 'semver',
      status: 'active',
      predecessor: 'reference.replace::doc.main',
      relationToPredecessor: 'replaces',
    },
  });
  const reference = fixturePack({
    id: 'reference.replace',
    statement: 'Рекомендуемая продолжительность составляет 7 дней.',
    date: '2024-01-01',
    edition: {
      seriesId: 'guideline.duration',
      identifier: '1.0',
      comparisonAlgorithm: 'semver',
      status: 'retired',
    },
  });
  const [candidate] = detectStatementRelationCandidates({ pack: target, referencePacks: [reference] });
  assert.equal(candidate.chronology.sameSeries, true);
  assert.equal(candidate.chronology.versionOrder, 'source_after_target');
  assert.equal(candidate.chronology.explicitArtifactRelation, 'replaces');
  assert.ok(candidate.signals.includes('explicit_replacement'));
  assert.equal(candidate.suggestedType, 'supersedes');
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

test('creates a deterministic review and preserves accepted chronology evidence', () => {
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
  assert.deepEqual(reviewed.statementRelations[0].reviewEvidence.signals, ['numeric_difference']);
  assert.equal(reviewed.statementRelations[0].reviewEvidence.chronology.issueOrder, 'equal');
});

test('renders chronology safely in the offline review page', () => {
  const target = fixturePack({
    id: 'target.html',
    statement: 'Значение составляет 5 мг. </script><img src=x onerror=alert(1)>',
    modifiedAt: '2026-01-03T10:00:00Z',
  });
  const reference = fixturePack({
    id: 'reference.html',
    statement: 'Значение составляет 10 мг.',
    date: '2024-01-01',
  });
  const review = createDiscrepancyReview({ pack: target, referencePacks: [reference] });
  const html = renderDiscrepancyReviewHtml(review);
  assert.match(html, /Проверка разных сведений/u);
  assert.match(html, /Хронология и редакции/u);
  assert.match(html, /Более новая дата не означает автоматически/u);
  assert.match(html, /Скачать результат/u);
  assert.match(html, /application\/octet-stream/u);
  assert.doesNotMatch(html, /<img src=x/u);
  assert.doesNotMatch(html, /<\/script><img/u);
  const encoded = html.match(/<script id="review-data"[^>]*>([^<]+)<\/script>/u)?.[1];
  const decoded = JSON.parse(Buffer.from(encoded, 'base64').toString('utf8'));
  assert.equal(decoded.targetPackId, 'target.html');
  assert.equal(decoded.candidates.length, 1);
  assert.equal(decoded.candidates[0].chronology.issueOrder, 'source_after_target');
});

test('CLI accepts several comparison packs and review outputs', () => {
  const args = argumentsFrom([
    '--input', 'input',
    '--output', 'output.json',
    '--compare-pack', 'first.json',
    '--compare-pack', 'second.json',
    '--discrepancy-review-out', 'review.json',
    '--discrepancy-review-html', 'review.html',
  ]);
  assert.deepEqual(args.comparePack, ['first.json', 'second.json']);
  assert.equal(args.discrepancyReviewOut, 'review.json');
  assert.equal(args.discrepancyReviewHtml, 'review.html');
});
