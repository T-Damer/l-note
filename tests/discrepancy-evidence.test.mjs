import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import { collectEvidence } from '../src/ai.js';
import { buildKnowledgeState } from '../src/packs.js';
import { buildEvidencePrompt } from '../src/services/answer-modes.js';
import { addConfirmedDiscrepancyEvidence } from '../src/services/evidence-discrepancies.js';

const guidePack = JSON.parse(await readFile(
  new URL('../packs/lnote-guide.pack.json', import.meta.url),
  'utf8',
));

function legacyResult() {
  const document = guidePack.documents.find((item) => item.id === 'guide.search.legacy');
  const section = document.sections.find((item) => item.id === 'backend');
  return {
    id: 'section:lnote.guide:guide.search.legacy:backend',
    kind: 'section',
    packId: guidePack.id,
    packTitle: guidePack.title,
    documentId: document.id,
    documentTitle: document.title,
    sectionId: section.id,
    title: section.title,
    body: section.text,
    score: 1,
    relevance: 100,
    snippet: section.text,
    queryTerms: ['крупные', 'пакеты'],
    claimIds: ['g5'],
  };
}

test('adds the reviewed counterpart as an ordinary citable source', () => {
  const knowledge = buildKnowledgeState([guidePack], []);
  const evidence = collectEvidence(
    'как хранить индекс крупного пакета',
    [legacyResult()],
    knowledge,
    { sourceLimit: 4, discrepancyLimit: 2 },
  );

  assert.equal(evidence.sources.length, 2);
  assert.equal(evidence.sources[0].id, 'S1');
  assert.equal(evidence.sources[1].id, 'S2');
  assert.equal(evidence.sources[1].supplemental, true);
  assert.equal(evidence.sources[1].result.documentId, 'guide.search.disk');
  assert.equal(evidence.discrepancies.length, 1);
  assert.equal(evidence.discrepancies[0].status, 'confirmed');
  assert.equal(evidence.discrepancies[0].source.evidenceId, 'S1');
  assert.equal(evidence.discrepancies[0].target.evidenceId, 'S2');
});

test('renders both source IDs and neutral discrepancy instructions in the prompt', () => {
  const knowledge = buildKnowledgeState([guidePack], []);
  const evidence = collectEvidence(
    'как хранить индекс крупного пакета',
    [legacyResult()],
    knowledge,
    { sourceLimit: 4, discrepancyLimit: 2 },
  );
  const prompt = buildEvidencePrompt(evidence, 'compact');

  assert.deepEqual(prompt.includedSourceIds, ['S1', 'S2']);
  assert.match(prompt.text, /ПОДТВЕРЖДЁННОЕ РАСХОЖДЕНИЕ: \[S1\] ↔ \[S2\]/u);
  assert.match(prompt.text, /Не выбирай один источник автоматически/u);
  assert.match(prompt.text, /MiniSearch/u);
  assert.match(prompt.text, /SQLite\/FTS5/u);
});

test('excludes proposed and dismissed relations from answer evidence', () => {
  const proposedPack = structuredClone(guidePack);
  proposedPack.statementRelations[0].status = 'proposed';
  const source = {
    id: 'S1',
    result: legacyResult(),
    document: proposedPack.documents.find((item) => item.id === 'guide.search.legacy'),
    section: proposedPack.documents
      .find((item) => item.id === 'guide.search.legacy')
      .sections.find((item) => item.id === 'backend'),
    claims: [proposedPack.claims.find((item) => item.id === 'g5')],
  };

  assert.deepEqual(addConfirmedDiscrepancyEvidence({
    sources: [source],
    packs: [proposedPack],
    limit: 2,
  }).discrepancies, []);

  proposedPack.statementRelations[0].status = 'dismissed';
  assert.deepEqual(addConfirmedDiscrepancyEvidence({
    sources: [source],
    packs: [proposedPack],
    limit: 2,
  }).discrepancies, []);
});

test('keeps discrepancy expansion bounded', () => {
  const source = {
    id: 'S1',
    result: legacyResult(),
    document: guidePack.documents.find((item) => item.id === 'guide.search.legacy'),
    section: guidePack.documents
      .find((item) => item.id === 'guide.search.legacy')
      .sections.find((item) => item.id === 'backend'),
    claims: [guidePack.claims.find((item) => item.id === 'g5')],
  };
  const evidence = addConfirmedDiscrepancyEvidence({
    sources: [source],
    packs: [guidePack],
    limit: 0,
  });
  assert.equal(evidence.sources.length, 1);
  assert.equal(evidence.discrepancies.length, 0);
});
