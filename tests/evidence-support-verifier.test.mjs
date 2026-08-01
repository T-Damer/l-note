import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createLexicalEvidenceVerifier,
  splitAnswerStatements,
  verifyStatementSupport,
} from '../src/services/evidence-support-verifier.js';

const evidence = {
  contractVersion: '0.1.0',
  query: 'грудничок свистит',
  sources: [
    {
      id: 'S1',
      result: {
        title: 'Бронхиолит',
        body: 'Бронхиолит у грудных детей может сопровождаться свистящим дыханием.',
      },
      section: {
        title: 'Клиническая картина',
        text: 'Сатурация ниже 92% требует срочной оценки состояния ребёнка.',
      },
      claims: [],
    },
    {
      id: 'S2',
      result: {
        title: 'Наблюдение',
        body: 'Лихорадка отсутствует, кашля нет.',
      },
      claims: [],
    },
  ],
};

test('splits prose while retaining source identifiers with their statements', () => {
  assert.deepEqual(
    splitAnswerStatements('Бронхиолит возможен [S1].\nСатурация ниже 92% важна [S1].'),
    ['Бронхиолит возможен [S1].', 'Сатурация ниже 92% важна [S1].'],
  );
});

test('accepts a statement when one cited fragment supports terms and numbers', () => {
  const result = verifyStatementSupport(
    'Бронхиолит у грудных детей сопровождается свистящим дыханием [S1]. Сатурация ниже 92% требует срочной оценки [S1].',
    evidence,
  );
  assert.equal(result.supported, true, JSON.stringify(result.diagnostics, null, 2));
  assert.deepEqual(result.invalidCitations, []);
  assert.deepEqual(result.unsupportedStatements, []);
});

test('rejects unknown citations, uncited claims and unsupported numbers', () => {
  const result = verifyStatementSupport(
    'Бронхиолит сопровождается свистящим дыханием [S9]. Температура 41°C является типичной [S1]. Лечение обязательно.',
    evidence,
  );
  assert.equal(result.supported, false);
  assert.deepEqual(result.invalidCitations, ['S9']);
  assert.equal(result.unsupportedStatements.length, 3);
});

test('detects a negation that is absent from the cited evidence', () => {
  const result = verifyStatementSupport('Свистящего дыхания при бронхиолите нет [S1].', evidence);
  assert.equal(result.supported, false);
  assert.equal(result.diagnostics.checks[0].negationMismatch, true);
});

test('exposes the verifier through the generic evidence-verifier port', () => {
  const verifier = createLexicalEvidenceVerifier();
  assert.equal(verifier.id, 'lnote.lexical-evidence-support.v1');
  assert.equal(typeof verifier.verify, 'function');
});
