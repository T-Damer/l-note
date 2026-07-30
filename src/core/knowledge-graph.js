export const KNOWLEDGE_GRAPH_VERSION = '0.1.0';

const NODE_TYPES = Object.freeze(['pack', 'document', 'section', 'concept']);

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function normalizedCategories(...sources) {
  const weights = new Map();
  for (const source of sources) {
    for (const input of asArray(source)) {
      const id = typeof input === 'string' ? input : input?.id;
      if (typeof id !== 'string' || !id.trim()) continue;
      const weight = typeof input === 'string' ? 1 : Number(input.weight ?? 1);
      weights.set(id.trim(), Math.max(weights.get(id.trim()) ?? 0, Number.isFinite(weight) ? weight : 1));
    }
  }
  if (weights.size === 0) return [{ id: 'unknown', weight: 1 }];
  const total = [...weights.values()].reduce((sum, value) => sum + value, 0) || 1;
  return [...weights.entries()].map(([id, weight]) => ({ id, weight: weight / total }));
}

function addNode(nodes, node) {
  const existing = nodes.get(node.id);
  if (!existing) {
    nodes.set(node.id, node);
    return node;
  }
  const categories = normalizedCategories(existing.categories, node.categories);
  const packIds = [...new Set([...(existing.packIds ?? []), ...(node.packIds ?? [])])];
  const merged = { ...existing, ...node, categories, packIds };
  nodes.set(node.id, merged);
  return merged;
}

function addEdge(edges, edge) {
  if (!edge.from || !edge.to || edge.from === edge.to) return;
  const key = `${edge.type}:${edge.from}:${edge.to}:${edge.label ?? ''}`;
  if (edges.has(key)) return;
  edges.set(key, { id: key, ...edge });
}

export function buildKnowledgeGraph({ catalog = { packs: [] }, packRecords = [] } = {}) {
  const nodes = new Map();
  const edges = new Map();
  const installedById = new Map(asArray(packRecords).map((record) => [record.id, record]));
  const entries = [...asArray(catalog?.packs)];

  for (const record of asArray(packRecords)) {
    if (entries.some((entry) => entry.id === record.id)) continue;
    entries.push({
      id: record.id,
      title: record.pack?.title ?? record.id,
      description: record.pack?.description ?? '',
      kind: record.pack?.kind ?? 'Локальный пакет',
      categories: record.pack?.categories ?? [],
    });
  }

  for (const entry of entries) {
    const installed = installedById.get(entry.id) ?? null;
    const pack = installed?.pack ?? null;
    const packCategories = normalizedCategories(entry.categories, pack?.categories);
    const packNodeId = `pack:${entry.id}`;
    addNode(nodes, {
      id: packNodeId,
      type: 'pack',
      label: pack?.title ?? entry.title ?? entry.id,
      subtitle: installed ? (installed.enabled ? 'Установлен' : 'Отключён') : 'Доступен для загрузки',
      resourceType: 'package',
      resourceId: entry.id,
      installed: Boolean(installed),
      enabled: Boolean(installed?.enabled),
      categories: packCategories,
      packIds: [entry.id],
    });

    if (!pack) continue;
    const entityById = new Map(asArray(pack.entities).map((entity) => [entity.id, entity]));

    for (const document of asArray(pack.documents)) {
      const documentNodeId = `document:${entry.id}:${document.id}`;
      const documentCategories = normalizedCategories(document.categories, packCategories);
      addNode(nodes, {
        id: documentNodeId,
        type: 'document',
        label: document.title,
        subtitle: `${asArray(document.sections).length} разделов`,
        resourceType: 'document',
        resourceId: document.id,
        categories: documentCategories,
        packIds: [entry.id],
      });
      addEdge(edges, { type: 'contains', from: packNodeId, to: documentNodeId, label: 'содержит документ' });

      for (const section of asArray(document.sections)) {
        const sectionNodeId = `section:${entry.id}:${document.id}:${section.id}`;
        const sectionCategories = normalizedCategories(section.categories, documentCategories);
        addNode(nodes, {
          id: sectionNodeId,
          type: 'section',
          label: section.title,
          subtitle: document.title,
          resourceType: 'document',
          resourceId: document.id,
          sectionId: section.id,
          categories: sectionCategories,
          packIds: [entry.id],
        });
        addEdge(edges, { type: 'contains', from: documentNodeId, to: sectionNodeId, label: 'содержит раздел' });

        for (const entityId of asArray(section.entityIds)) {
          const entity = entityById.get(entityId);
          if (!entity) continue;
          const conceptNodeId = `concept:${entity.id}`;
          addNode(nodes, {
            id: conceptNodeId,
            type: 'concept',
            label: entity.name,
            subtitle: entity.type ?? 'Понятие',
            resourceType: 'concept',
            resourceId: entity.id,
            categories: normalizedCategories(entity.categories, sectionCategories),
            packIds: [entry.id],
          });
          addEdge(edges, { type: 'mentions', from: sectionNodeId, to: conceptNodeId, label: 'упоминает' });
        }
      }
    }

    for (const entity of asArray(pack.entities)) {
      addNode(nodes, {
        id: `concept:${entity.id}`,
        type: 'concept',
        label: entity.name,
        subtitle: entity.type ?? 'Понятие',
        resourceType: 'concept',
        resourceId: entity.id,
        categories: normalizedCategories(entity.categories, packCategories),
        packIds: [entry.id],
      });
    }

    for (const relation of asArray(pack.relations)) {
      addEdge(edges, {
        type: 'relation',
        from: `concept:${relation.sourceId}`,
        to: `concept:${relation.targetId}`,
        label: relation.predicate ?? relation.type ?? 'связано с',
        strength: relation.weight ?? relation.strength ?? relation.confidence ?? null,
      });
    }
  }

  return {
    version: KNOWLEDGE_GRAPH_VERSION,
    nodeTypes: NODE_TYPES,
    nodes: [...nodes.values()],
    edges: [...edges.values()].filter((edge) => nodes.has(edge.from) && nodes.has(edge.to)),
  };
}
