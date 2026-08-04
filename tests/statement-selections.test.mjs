import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { validatePack } from '../src/packs.js';
import {
  buildStatementSelectionIndex,
  statementSelectionLabel,
  validateStatementSelections,
} from '../src/helpers/statement-selections.js';
import { applyDiscrepancyReview } from '../tools/lib/discrepancy-review.mjs';
import {
  exportPackToSqlite,
  restorePackFromSqlite,
} from '../tools/lib/sqlite-pack-export.mjs';

function pack({ id, claimId = 'claim.main', text = 'Исходное утверждение.', selections } = {}) {
  return {
    schemaVersion: 1,
    id,
    version: '1.0.0',
    title: id,
    description: 'Selection test pack',
    language: 'ru',
    documents: [{
      id: 'doc.main',
      title: `${id} document`,
      sections: [{
        id: 'section.main',
        title: 'Section',
        text,
        entityIds: ['subject.main'],
      }],
    }],
    entities: [{ id: 'subject.main', name: 'Общий предмет', aliases: [] }],
    claims: [{
      id: claimId,
      text,
      subjectId: 'subject.main',
      source: { documentId: 'doc.main', sectionId: 'section.main', quote: text },
    }],
    relations: [],
    ...(selections ? { statementSelections: selections } : {}),
  };
}

function selection(overrides = {}) {
  return {
    id: 'selection.main',
    groupKey: 'guideline:duration:adult',
    claimRefs: ['current.pack::claim.main', 'older.pack::claim.main'],
    preferredClaimRefs: ['current.pack::claim.main'],
    status: 'confirmed',
    reason: 'Проверена действующая редакция для взрослых.',
    scope: 'Взрослые, юрисдикция X',
    validAt: '2026-08-04',
    reviewedAt: '2026-08-04T10:00:00.000Z',
    reviewedBy: 'Reviewer',
    ...overrides,
  };
}

test('validates a reviewed cross-pack selection with several preferred statements', () => {
  const current = pack({
    id: 'current.pack',
    selections: [selection({
      claimRefs: [
        'current.pack::claim.main',
        'older.pack::claim.main',
        'parallel.pack::claim.main',
      ],
      preferredClaimRefs: [
        'current.pack::claim.main',
        'parallel.pack::claim.main',
      ],
    })],
  });
  assert.deepEqual(validateStatementSelections(current), []);
  assert.equal(validatePack(current).valid, true);
});

test('rejects invalid preference subsets, unknown local claims and duplicate groups', () => {
  const invalid = pack({
    id: 'current.pack',
    selections: [
      selection({ preferredClaimRefs: ['outside.pack::claim.unknown'] }),
      selection({ id: 'selection.second' }),
      selection({
        id: 'selection.unknown-local',
        groupKey: 'another-group',
        claimRefs: ['current.pack::claim.missing', 'older.pack::claim.main'],
        preferredClaimRefs: ['current.pack::claim.missing'],
      }),
    ],
  });
  const errors = validateStatementSelections(invalid).join('\n');
  assert.match(errors, /outside claimRefs/u);
  assert.match(errors, /duplicate statement selection groupKey/u);
  assert.match(errors, /unknown local statement current\.pack::claim\.missing/u);
});

test('builds a cross-pack runtime index without removing historical alternatives', () => {
  const current = pack({ id: 'current.pack', selections: [selection()] });
  const older = pack({ id: 'older.pack', text: 'Предыдущая редакция утверждения.' });
  const index = buildStatementSelectionIndex([current, older]);

  assert.equal(index.selections.length, 1);
  assert.equal(index.unresolved.length, 0);
  const currentEntry = index.byClaim.get('current.pack::claim.main')[0];
  const olderEntry = index.byClaim.get('older.pack::claim.main')[0];
  assert.equal(currentEntry.preferred, true);
  assert.equal(olderEntry.preferred, false);
  assert.equal(statementSelectionLabel(currentEntry), 'Текущее или предпочтительное');
  assert.equal(statementSelectionLabel(olderEntry), 'Историческое или альтернативное');
  assert.deepEqual(currentEntry.selection.sides.map((side) => side.claimRef), [
    'current.pack::claim.main',
    'older.pack::claim.main',
  ]);
});

test('keeps unresolved external selections visible to diagnostics', () => {
  const current = pack({ id: 'current.pack', selections: [selection()] });
  const index = buildStatementSelectionIndex([current]);
  assert.equal(index.selections.length, 0);
  assert.equal(index.unresolved.length, 1);
  assert.deepEqual(index.unresolved[0].claimRefs, [
    'current.pack::claim.main',
    'older.pack::claim.main',
  ]);
});

function reviewCandidate(overrides = {}) {
  return {
    id: 'statement-review.preference',
    sourceClaimId: 'claim.main',
    targetClaimId: 'older.pack::claim.main',
    selectedType: 'contradicts',
    decision: 'accept',
    confidence: .9,
    reason: 'Разные значения проверены вручную.',
    signals: ['numeric_difference'],
    preferredChoice: 'none',
    selectionGroupKey: 'guideline:duration:adult',
    selectionScope: 'Взрослые',
    selectionValidAt: '2026-08-04',
    selectionReason: 'Действующая редакция для указанной группы.',
    ...overrides,
  };
}

function review(candidate) {
  return {
    schemaVersion: 1,
    kind: 'lnote.statement-relation-review',
    targetPackId: 'current.pack',
    candidates: [candidate],
  };
}

test('does not assign a preference by default or for an unaccepted candidate', () => {
  const current = pack({ id: 'current.pack' });
  const withoutChoice = applyDiscrepancyReview(current, review(reviewCandidate()), {
    reviewedAt: '2026-08-04T10:00:00.000Z',
    reviewedBy: 'Reviewer',
  });
  assert.equal(Object.hasOwn(withoutChoice, 'statementSelections'), false);

  const dismissed = applyDiscrepancyReview(current, review(reviewCandidate({
    decision: 'dismiss',
    preferredChoice: 'source',
  })), {
    reviewedAt: '2026-08-04T10:00:00.000Z',
    reviewedBy: 'Reviewer',
  });
  assert.equal(Object.hasOwn(dismissed, 'statementSelections'), false);
});

test('applies source, target or both only after explicit human review', () => {
  const current = pack({ id: 'current.pack' });
  for (const [choice, expected] of [
    ['source', ['current.pack::claim.main']],
    ['target', ['older.pack::claim.main']],
    ['both', ['current.pack::claim.main', 'older.pack::claim.main']],
  ]) {
    const reviewed = applyDiscrepancyReview(current, review(reviewCandidate({ preferredChoice: choice })), {
      reviewedAt: '2026-08-04T10:00:00.000Z',
      reviewedBy: 'Reviewer',
    });
    assert.equal(reviewed.statementSelections.length, 1);
    assert.deepEqual(reviewed.statementSelections[0].preferredClaimRefs, expected);
    assert.deepEqual(reviewed.statementSelections[0].claimRefs, [
      'current.pack::claim.main',
      'older.pack::claim.main',
    ]);
    assert.equal(reviewed.statementSelections[0].scope, 'Взрослые');
    assert.equal(reviewed.statementSelections[0].validAt, '2026-08-04');
    assert.equal(reviewed.statementSelections[0].reviewedBy, 'Reviewer');
    assert.equal(validatePack(reviewed).valid, true);
  }
});

test('preserves statement selections through relational SQLite export and restore', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'lnote-statement-selection-'));
  try {
    const filename = path.join(directory, 'selection.sqlite');
    const current = pack({ id: 'current.pack', selections: [selection()] });
    await exportPackToSqlite({
      pack: current,
      outputPath: filename,
      exportedAt: '2026-08-04T10:00:00.000Z',
    });
    assert.deepEqual(restorePackFromSqlite(filename), current);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
