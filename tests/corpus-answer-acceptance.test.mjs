import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { DatabaseSync } from 'node:sqlite';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import MiniSearch from 'minisearch';

import { collectEvidence, evidencePrompt } from '../src/ai.js';
import { buildKnowledgeState, flattenKnowledge, validatePack } from '../src/packs.js';
import { createSearchEngine } from '../src/search.js';
import { sqliteFtsMatchQuery } from '../src/helpers/sqlite-fts.js';
import { collectQuestionEvidence } from '../src/services/evidence-query.js';
import { verifyStatementSupport } from '../src/services/evidence-support-verifier.js';
import { buildPrebuiltSearchArtifact } from '../tools/build-search-artifact.mjs';
import {
  ALPHA_2024_DOSE,
  ALPHA_2026_DOSE,
  ALPHA_MILD_RENAL,
  ALPHA_QUERY,
  ALPHA_TYPO_QUERY,
  createCorpusAnswerPack,
} from './fixtures/corpus-answer-pack.mjs';

const RELEVANT_DOCUMENTS = new Set(['alpha.guideline.2024', 'alpha.guideline.2026']);
const pack = createCorpusAnswerPack();
const validation = validatePack(pack);
assert.equal(validation.valid, true, validation.errors.join('\n'));
const records = flattenKnowledge([pack], []);
const previousMiniSearch = globalThis.MiniSearch;
globalThis.MiniSearch = MiniSearch;
const searchEngine = createSearchEngine(records, pack.entities);
const knowledgeState = buildKnowledgeState([pack], []);

test.after(() => {
  if (previousMiniSearch === undefined) delete globalThis.MiniSearch;
  else globalThis.MiniSearch = previousMiniSearch;
});

function cited(sentence, sourceId) {
  return `${sentence.replace(/\.$/u, '')} [${sourceId}].`;
}

function relevantIds(results, limit = 2) {
  return new Set(results.slice(0, limit).map((result) => result.documentId));
}

function ftsSearch(filename, query, limit = 10) {
  const database = new DatabaseSync(filename, { readOnly: true });
  try {
    const rows = database.prepare(`
      SELECT payload, bm25(records_fts, 0, 0, 2.8, 1.8, 1.35, 1.1, 0.65) * -1 AS score
      FROM records_fts
      WHERE records_fts MATCH ?
      ORDER BY score DESC
      LIMIT ?
    `).all(sqliteFtsMatchQuery(query), limit);
    return rows.map((row) => ({ ...JSON.parse(row.payload), score: row.score }));
  } finally {
    database.close();
  }
}

test('non-demo memory ranking keeps both Alpha dose editions above 5,200 distractors', () => {
  assert.equal(records.length, 5202);
  const exact = searchEngine.search(ALPHA_QUERY, { limit: 10 });
  assert.deepEqual(relevantIds(exact), RELEVANT_DOCUMENTS);
  assert.equal(exact[0].relevance, 100);

  const typo = searchEngine.search(ALPHA_TYPO_QUERY, { limit: 10 });
  const typoTop = new Set(typo.slice(0, 5).map((result) => result.documentId));
  assert.ok([...RELEVANT_DOCUMENTS].some((id) => typoTop.has(id)));
});

test('portable FTS ranks the same two source editions first after database reopen', async (t) => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'lnote-answer-corpus-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const input = path.join(directory, 'corpus.pack.json');
  const database = path.join(directory, 'corpus.search.sqlite');
  const output = path.join(directory, 'corpus.with-search.pack.json');
  await writeFile(input, `${JSON.stringify(pack, null, 2)}\n`);

  const built = await buildPrebuiltSearchArtifact({
    inputPath: input,
    databasePath: database,
    packOutputPath: output,
    artifactUrl: './corpus.search.sqlite',
    builtAt: '2026-08-04T15:00:00.000Z',
  });
  assert.equal(built.artifact.recordCount, records.length);
  assert.deepEqual(relevantIds(ftsSearch(database, ALPHA_QUERY)), RELEVANT_DOCUMENTS);
  assert.deepEqual(relevantIds(ftsSearch(database, ALPHA_QUERY)), RELEVANT_DOCUMENTS);

  const reopenedPack = JSON.parse(await readFile(output, 'utf8'));
  assert.equal(validatePack(reopenedPack).valid, true);
  assert.equal(reopenedPack.searchArtifacts[0].recordCount, records.length);
});

test('evidence collection adds the reviewed counterpart and keeps both versions citable', async () => {
  const { evidence, results } = await collectQuestionEvidence({
    query: ALPHA_QUERY,
    mode: { id: 'acceptance', sourceLimit: 1 },
    searchPort: searchEngine,
    knowledgeState,
    collectEvidence,
  });
  assert.ok(RELEVANT_DOCUMENTS.has(results[0].documentId));
  assert.equal(evidence.sources.length, 2);
  assert.equal(evidence.discrepancies.length, 1);
  assert.equal(evidence.discrepancies[0].type, 'contradicts');

  const source100 = evidence.sources.find((source) => source.result.body.includes('100 мг'));
  const source120 = evidence.sources.find((source) => source.result.body.includes('120 мг'));
  assert.ok(source100?.id);
  assert.ok(source120?.id);
  assert.equal(source120.supplemental || source100.supplemental, true);

  const answer = [
    cited(ALPHA_2026_DOSE, source100.id),
    cited(ALPHA_2024_DOSE, source120.id),
  ].join(' ');
  const supported = verifyStatementSupport(answer, evidence);
  assert.equal(supported.supported, true, JSON.stringify(supported.diagnostics, null, 2));

  const prompt = evidencePrompt(evidence, 'compact');
  assert.match(prompt, new RegExp(`\\[${source100.id}\\]`, 'u'));
  assert.match(prompt, new RegExp(`\\[${source120.id}\\]`, 'u'));
  assert.match(prompt, /ПОДТВЕРЖДЁННОЕ РАСХОЖДЕНИЕ/u);
  assert.match(prompt, /Не выбирай один источник автоматически/u);
});

test('corpus grounding rejects an invented dose and a reversed negation', async () => {
  const { evidence } = await collectQuestionEvidence({
    query: ALPHA_QUERY,
    mode: { id: 'acceptance', sourceLimit: 1 },
    searchPort: searchEngine,
    knowledgeState,
    collectEvidence,
  });
  const source100 = evidence.sources.find((source) => source.result.body.includes('100 мг'));
  const source120 = evidence.sources.find((source) => source.result.body.includes('120 мг'));

  const invented = verifyStatementSupport(
    cited('Для взрослых суточная доза препарата Альфа составляет 150 мг.', source100.id),
    evidence,
  );
  assert.equal(invented.supported, false);
  assert.equal(invented.unsupportedStatements.length, 1);

  const correctNegation = verifyStatementSupport(cited(ALPHA_MILD_RENAL, source120.id), evidence);
  assert.equal(correctNegation.supported, true, JSON.stringify(correctNegation.diagnostics, null, 2));

  const reversed = verifyStatementSupport(
    cited('Препарат Альфа противопоказан при лёгкой почечной недостаточности.', source120.id),
    evidence,
  );
  assert.equal(reversed.supported, false);
  assert.equal(reversed.diagnostics.checks[0].negationMismatch, true);
});
