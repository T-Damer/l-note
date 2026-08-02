import assert from 'node:assert/strict';
import test from 'node:test';

import { buildKnowledgeGraph } from '../src/core/knowledge-graph.js';
import { layoutKnowledgeGraph } from '../src/ui/knowledge-graph.js';

const mixedPack = {
  schemaVersion: 1,
  id: 'lnote.mixed-domains.demo',
  version: '1.0.0',
  title: 'Mixed domains',
  description: 'Fixture',
  language: 'ru',
  categories: [
    { id: 'pediatrics', weight: 0.5 },
    { id: 'dentistry', weight: 0.5 },
  ],
  documents: [
    {
      id: 'doc.mixed',
      title: 'Mixed document',
      categories: [
        { id: 'pediatrics', weight: 0.5 },
        { id: 'dentistry', weight: 0.5 },
      ],
      sections: [
        {
          id: 'section.mixed',
          title: 'Mixed section',
          text: 'Mixed source text.',
          entityIds: ['concept:tooth-eruption-timing'],
          categories: [
            { id: 'pediatrics', weight: 0.5 },
            { id: 'dentistry', weight: 0.5 },
          ],
        },
      ],
    },
  ],
  entities: [
    {
      id: 'concept:tooth-eruption-timing',
      name: 'Сроки прорезывания зубов',
      categories: [
        { id: 'pediatrics', weight: 0.5 },
        { id: 'dentistry', weight: 0.5 },
      ],
    },
  ],
  claims: [],
  relations: [],
};

test('knowledge graph contains package, document, section and concept nodes', () => {
  const graph = buildKnowledgeGraph({
    catalog: {
      packs: [{
        id: mixedPack.id,
        title: mixedPack.title,
        categories: mixedPack.categories,
      }],
    },
    packRecords: [{ id: mixedPack.id, enabled: true, pack: mixedPack }],
  });

  assert.deepEqual(
    new Set(graph.nodes.map((node) => node.type)),
    new Set(['pack', 'document', 'section', 'concept']),
  );
  assert.equal(graph.edges.some((edge) => edge.type === 'contains'), true);
  assert.equal(graph.edges.some((edge) => edge.type === 'mentions'), true);
});

test('tooth-eruption concept keeps a 50/50 pediatrics and dentistry split', () => {
  const graph = buildKnowledgeGraph({
    catalog: { packs: [] },
    packRecords: [{ id: mixedPack.id, enabled: true, pack: mixedPack }],
  });
  const node = graph.nodes.find((item) => item.id === 'concept:concept:tooth-eruption-timing');

  assert.ok(node);
  assert.deepEqual(node.categories, [
    { id: 'pediatrics', weight: 0.5 },
    { id: 'dentistry', weight: 0.5 },
  ]);
});

test('graph layout preserves routed resource metadata', () => {
  const graph = buildKnowledgeGraph({
    catalog: { packs: [] },
    packRecords: [{ id: mixedPack.id, enabled: true, pack: mixedPack }],
  });
  const layout = layoutKnowledgeGraph(graph);
  const concept = layout.nodes.find((node) => node.type === 'concept');

  assert.equal(concept.resourceType, 'concept');
  assert.equal(concept.resourceId, 'concept:tooth-eruption-timing');
  assert.ok(layout.width > 0);
  assert.ok(layout.height > 0);
});

test('focused relation graph uses only current and related concept columns', () => {
  const graph = {
    nodes: [
      { id: 'focus:a', type: 'focus', label: 'Текущее понятие' },
      { id: 'concept:b', type: 'concept', label: 'Связанное понятие' },
    ],
    edges: [{ id: 'edge', from: 'focus:a', to: 'concept:b', type: 'relation' }],
  };
  const layout = layoutKnowledgeGraph(graph, {
    typeOrder: ['focus', 'concept'],
    typeLabels: { focus: 'Текущее понятие', concept: 'Связанные понятия' },
  });

  assert.deepEqual(layout.columns.map((column) => column.type), ['focus', 'concept']);
  assert.deepEqual(layout.columns.map((column) => column.label), ['Текущее понятие', 'Связанные понятия']);
  assert.equal(layout.nodes.length, 2);
  assert.equal(layout.edges.length, 1);
  assert.ok(layout.width < layoutKnowledgeGraph(graph).width);
});
