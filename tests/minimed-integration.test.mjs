import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createMiniMedMedicalCoreAdapter,
  mapMiniMedSearchResponse,
} from '../src/integrations/minimed.js';

test('maps MiniMed grouped search results into generic L-Note records', () => {
  const records = mapMiniMedSearchResponse({
    groups: [
      {
        results: [
          {
            chunkId: 'chunk-1',
            documentId: 'bronchiolitis',
            sectionId: 'clinical-picture',
            title: 'Острый бронхиолит',
            sectionPath: ['Рекомендация', 'Клиническая картина'],
            snippet: 'У грудных детей возможны свистящие хрипы.',
            finalScore: 2.5,
            lexicalScore: 10,
            semanticScore: 0.72,
            matchedTerms: ['свистящие хрипы'],
            matchedBranches: ['Распознанные симптомы'],
            category: 'clinical-picture',
          },
        ],
      },
    ],
  });

  assert.equal(records.length, 1);
  assert.equal(records[0]?.kind, 'section');
  assert.equal(records[0]?.documentId, 'bronchiolitis');
  assert.equal(records[0]?.title, 'Клиническая картина');
  assert.equal(records[0]?.relevance, 100);
  assert.equal(records[0]?.adapter, 'minimed-medical-core');
});

test('adapter delegates query semantics to MedicalCore and unwraps Result', async () => {
  const requests = [];
  const medicalCore = {
    async search(request) {
      requests.push(request);
      return {
        ok: true,
        value: {
          results: [
            {
              chunkId: 'uti-1',
              documentId: 'uti',
              sectionId: 'diagnostics',
              title: 'Инфекция мочевых путей',
              sectionPath: ['Диагностика'],
              snippet: 'Нужны общий анализ мочи и посев.',
              finalScore: 4,
            },
          ],
        },
      };
    },
    async analyzeQuery() {
      return {
        ok: true,
        value: {
          suggestions: [
            { label: 'Укажите возраст' },
            { message: 'Добавьте результаты общего анализа мочи' },
          ],
        },
      };
    },
    async getCapabilities() {
      return { ok: true, value: { lexicalSearch: true, semanticSearch: true } };
    },
  };

  const adapter = createMiniMedMedicalCoreAdapter(medicalCore, { mode: 'hybrid' });
  const results = await adapter.search('лихорадка без очага у ребенка', { limit: 5 });
  const suggestions = await adapter.suggest('лихорадка');
  const capabilities = await adapter.capabilities();

  assert.equal(requests[0]?.query, 'лихорадка без очага у ребенка');
  assert.equal(requests[0]?.mode, 'hybrid');
  assert.equal(requests[0]?.limit, 5);
  assert.equal(results[0]?.documentId, 'uti');
  assert.deepEqual(suggestions, ['Укажите возраст', 'Добавьте результаты общего анализа мочи']);
  assert.equal(capabilities.semanticSearch, true);
});

test('adapter rejects a failed MiniMed Result without hiding the domain error', async () => {
  const adapter = createMiniMedMedicalCoreAdapter({
    async search() {
      return { ok: false, error: { code: 'FTS5_UNAVAILABLE', message: 'FTS5 is unavailable' } };
    },
  });

  await assert.rejects(() => adapter.search('бронхиолит'), /FTS5 is unavailable/u);
});
