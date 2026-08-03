import assert from 'node:assert/strict';
import test from 'node:test';

import { validatePack } from '../src/packs.js';
import { mergeAiSection } from '../tools/lib/pack-builder.mjs';
import {
  collectSemanticReview,
  parseSemanticProposal,
} from '../tools/lib/semantic-proposal-collector.mjs';
import { renderSemanticReviewHtml } from '../tools/lib/semantic-review-html.mjs';
import {
  applySemanticReview,
  createSemanticReview,
} from '../tools/lib/semantic-review.mjs';

function fixturePack() {
  return {
    schemaVersion: 1,
    id: 'example.semantic-review',
    version: '1.0.0',
    title: 'Semantic review',
    description: 'Fixture',
    language: 'ru',
    documents: [{
      id: 'doc.source',
      title: 'Исходный документ',
      sections: [{
        id: 'section.source',
        title: 'Исходный раздел',
        text: 'Локальный поиск работает без языковой модели. SQLite хранит крупный индекс на диске.',
        entityIds: [],
        tags: [],
      }],
    }],
    entities: [],
    claims: [],
    relations: [],
  };
}

function validProposal() {
  return {
    entities: [{
      name: 'Локальный поиск',
      type: 'concept',
      aliases: ['офлайн-поиск'],
      description: 'Поиск на устройстве.',
    }, {
      name: 'SQLite',
      type: 'technology',
      aliases: [],
    }],
    claims: [{
      text: 'Локальный поиск работает без языковой модели.',
      subject: 'Локальный поиск',
      object: null,
      quote: 'Локальный поиск работает без языковой модели.',
    }],
    relations: [{
      source: 'Локальный поиск',
      type: 'USES',
      target: 'SQLite',
      description: 'Крупный индекс хранится на диске.',
    }],
  };
}

test('parses one JSON object from a fenced model response', () => {
  const parsed = parseSemanticProposal(`\`\`\`json\n${JSON.stringify(validProposal())}\n\`\`\``);
  assert.equal(parsed.entities.length, 2);
  assert.equal(parsed.claims.length, 1);
  assert.equal(parsed.relations.length, 1);
});

test('collects proposals without modifying the deterministic pack', async () => {
  const pack = fixturePack();
  const before = structuredClone(pack);
  const review = await collectSemanticReview({
    pack,
    provider: {
      name: 'fixture-provider',
      async complete() {
        return JSON.stringify(validProposal());
      },
    },
    generatedAt: '2026-08-03T12:00:00.000Z',
  });
  assert.deepEqual(pack, before);
  assert.equal(review.kind, 'lnote.semantic-proposal-review');
  assert.equal(review.candidates.length, 4);
  assert.equal(review.candidates.every((candidate) => candidate.decision === 'pending'), true);
  assert.equal(review.candidates.every((candidate) => candidate.provider === 'fixture-provider'), true);
});

test('blocks a claim whose quote is not an exact source substring', () => {
  const pack = fixturePack();
  const review = createSemanticReview({
    pack,
    provider: 'fixture-provider',
    sectionProposals: [{
      documentId: 'doc.source',
      sectionId: 'section.source',
      proposal: {
        claims: [{
          text: 'Выдуманное утверждение.',
          subject: 'Локальный поиск',
          quote: 'Этой строки нет в источнике.',
        }],
      },
    }],
  });
  const [candidate] = review.candidates;
  assert.equal(candidate.eligible, false);
  assert.equal(candidate.decision, 'dismiss');
  assert.match(candidate.validationError, /Цитата не найдена/u);
  candidate.decision = 'accept';
  assert.throws(
    () => applySemanticReview(pack, review, { mergeSection: mergeAiSection }),
    /cannot be accepted/u,
  );
});

test('applies only accepted semantic records and marks them reviewed', () => {
  const pack = fixturePack();
  const review = createSemanticReview({
    pack,
    provider: 'fixture-provider',
    generatedAt: '2026-08-03T12:00:00.000Z',
    sectionProposals: [{
      documentId: 'doc.source',
      sectionId: 'section.source',
      proposal: validProposal(),
    }],
  });

  const untouched = applySemanticReview(pack, review, { mergeSection: mergeAiSection });
  assert.equal(untouched.entities.length, 0);
  assert.equal(untouched.claims.length, 0);
  assert.equal(untouched.relations.length, 0);

  for (const candidate of review.candidates) candidate.decision = 'accept';
  const applied = applySemanticReview(pack, review, {
    mergeSection: mergeAiSection,
    reviewedAt: '2026-08-03T13:00:00.000Z',
    reviewedBy: 'Reviewer',
  });
  assert.equal(validatePack(applied).valid, true);
  assert.equal(applied.entities.length, 2);
  assert.equal(applied.claims.length, 1);
  assert.equal(applied.relations.length, 1);
  assert.equal(applied.claims[0].authority, 'reviewed');
  assert.equal(applied.claims[0].reviewedBy, 'Reviewer');
  assert.equal(applied.claims[0].proposedBy, 'fixture-provider');
  assert.equal(applied.relations[0].reviewedBy, 'Reviewer');
  assert.deepEqual(applied.documents[0].sections[0].entityIds.sort(), applied.entities.map((item) => item.id).sort());
  assert.deepEqual(pack, fixturePack());
});

test('allows editing accepted candidate data before application', () => {
  const pack = fixturePack();
  const review = createSemanticReview({
    pack,
    provider: 'fixture-provider',
    sectionProposals: [{
      documentId: 'doc.source',
      sectionId: 'section.source',
      proposal: { entities: [{ name: 'SQLite', aliases: ['старый алиас'] }] },
    }],
  });
  review.candidates[0].decision = 'accept';
  review.candidates[0].data.aliases = ['локальная база'];
  const applied = applySemanticReview(pack, review, { mergeSection: mergeAiSection });
  assert.deepEqual(applied.entities[0].aliases, ['локальная база']);
});

test('renders a safe standalone semantic review page', () => {
  const pack = fixturePack();
  const review = createSemanticReview({
    pack,
    provider: 'fixture-provider',
    sectionProposals: [{
      documentId: 'doc.source',
      sectionId: 'section.source',
      proposal: { entities: [{ name: '</script><img src=x onerror=alert(1)>' }] },
    }],
  });
  const html = renderSemanticReviewHtml(review);
  assert.match(html, /Проверка предложенной разметки/u);
  assert.match(html, /application\/octet-stream/u);
  assert.doesNotMatch(html, /<img src=x/u);
  const encoded = html.match(/<script id="review-data"[^>]*>([^<]+)<\/script>/u)?.[1];
  const decoded = JSON.parse(Buffer.from(encoded, 'base64').toString('utf8'));
  assert.equal(decoded.targetPackId, pack.id);
  assert.equal(decoded.candidates.length, 1);
});
