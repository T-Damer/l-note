import assert from 'node:assert/strict';
import test from 'node:test';

import { buildKnowledgeGraph } from '../src/core/knowledge-graph.js';
import { layoutKnowledgeGraph, shortGraphLabel } from '../src/ui/knowledge-graph.js';

const pack = {
  id: 'demo.pediatrics',
  title: 'Педиатрический пакет',
  categories: [{ id: 'pediatrics', weight: 1 }],
  documents: [{
    id: 'doc-1',
    title: 'Свистящее дыхание',
    sections: [{ id: 'section-1', title: 'Диагностика', text: 'Бронхиолит.', entityIds: ['bronchiolitis'] }],
  }],
  entities: [{ id: 'bronchiolitis', name: 'Бронхиолит' }, { id: 'wheeze', name: 'Свистящее дыхание' }],
  relations: [{ sourceId: 'wheeze', targetId: 'bronchiolitis', predicate: 'may present with' }],
};

test('projects catalog and installed records into generic graph nodes and edges', () => {
  const graph = buildKnowledgeGraph({
    catalog: {
      packs: [
        { id: 'demo.pediatrics', title: pack.title, categories: pack.categories },
        { id: 'demo.remote', title: 'Доступный пакет', categories: [{ id: 'unknown', weight: 1 }] },
      ],
    },
    packRecords: [{ id: pack.id, enabled: true, pack }],
  });

  assert.equal(graph.nodes.some((node) => node.id === 'pack:demo.remote' && node.installed === false), true);
  assert.equal(graph.nodes.some((node) => node.type === 'document' && node.resourceId === 'doc-1'), true);
  assert.equal(graph.nodes.some((node) => node.type === 'section' && node.sectionId === 'section-1'), true);
  assert.equal(graph.nodes.some((node) => node.id === 'concept:bronchiolitis'), true);
  assert.equal(graph.edges.some((edge) => edge.type === 'mentions'), true);
  assert.equal(graph.edges.some((edge) => edge.type === 'relation' && edge.label === 'may present with'), true);
});

test('lays graph types into stable columns', () => {
  const graph = buildKnowledgeGraph({ catalog: { packs: [{ id: 'demo.pediatrics', title: pack.title }] }, packRecords: [{ id: pack.id, enabled: true, pack }] });
  const layout = layoutKnowledgeGraph(graph);
  const packNode = layout.positions.get('pack:demo.pediatrics');
  const documentNode = layout.nodes.find((node) => node.type === 'document');
  const sectionNode = layout.nodes.find((node) => node.type === 'section');
  const conceptNode = layout.nodes.find((node) => node.type === 'concept');
  assert.ok(packNode.x < documentNode.x);
  assert.ok(documentNode.x < sectionNode.x);
  assert.ok(sectionNode.x < conceptNode.x);
  assert.equal(shortGraphLabel('Очень длинное название понятия', 12).endsWith('…'), true);
});
