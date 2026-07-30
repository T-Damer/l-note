export const KNOWLEDGE_GRAPH_VERSION = '0.1.0';

const NODE_TYPES = Object.freeze(['pack', 'document', 'section', 'concept']);

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function categoryEntries(...sources) {
  const weights = new Map();
  for (const source of sources) {
    for (const input of asArray(source)) {
      const id = typeof input === 'string' ? input : input?.id;
      if (typeof id !== 'string' || !id.trim()) continue;
      const rawWeight = typeof input === 'string' ? 1 : Number(input.weight ?? 1);
      const weight = Number.isFinite(rawWeight) && rawWeight > 0 ? rawWeight : 1;
      weights.set(id.trim(), (weights.get(id.trim()) ?? 0) + weight);
    }
  }
  if (weights.size === 0) return [];
  const total = [...weights.values()].reduce((sum, value) => sum + value, 0) || 1;
  return [...weights.entries()].map(([id, weight]) => ({ id, weight: weight / total }));
}

export function inferKnowledgeCategories(...values) {
  const text = values
    .flat(Infinity)
    .filter((value) => value !== undefined && value !== null)
    .map((value) => String(value))
    .join(' ')
    .normalize('NFKC')
    .toLocaleLowerCase('ru-RU');
  if (!text.trim()) return [];

  const toothEruption = /(?:прорезыван[а-я]*\s+зуб|срок[а-я]*\s+прорезыван|tooth\s+eruption)/u.test(text);
  if (toothEruption) {
    return [
      { id: 'pediatrics', weight: 0.5 },
      { id: 'dentistry', weight: 0.5 },
    ];
  }

  const pediatrics = /(?:minimed|pediatr|детск|реб[её]н|младен|груднич)/u.test(text);
  const dentistry = /(?:dent|стомат|зуб)/u.test(text);
  if (pediatrics && dentistry) {
    return [
      { id: 'pediatrics', weight: 0.5 },
      { id: 'dentistry', weight: 0.5 },
    ];
  }
  if (pediatrics) return [{ id: 'pediatrics', weight: 1 }];
  if (dentistry) return [{ id: 'dentistry', weight: 1 }];
  return [];
}

function categoriesForNode({ explicit = [], inference = [], inherited = [] } = {}) {
  const explicitCategories = categoryEntries(...explicit);
  if (explicitCategories.length) return { categories: explicitCategories, priority: 3 };
  const inferredCategories = inferKnowledgeCategories(...inference);
  if (inferredCategories.length) return { categories: inferredCategories, priority: 2 };
  const inheritedCategories = categoryEntries(...inherited);
  if (inheritedCategories.length) return { categories: inheritedCategories, priority: 1 };
  return { categories: [{ id: 'unknown', weight: 1 }], priority: 0 };
}

function addNode(nodes, node) {
  const existing = nodes.get(node.id);
  if (!existing) {
    nodes.set(node.id, node);
    return node;
  }

  const existingPriority = Number(existing.categoryPriority ?? 0);
  const incomingPriority = Number(node.categoryPriority ?? 0);
  let categories = existing.categories;
  let categoryPriority = existingPriority;
  if (incomingPriority > existingPriority) {
    categories = node.categories;
    categoryPriority = incomingPriority;
  } else if (incomingPriority === existingPriority) {
    categories = categoryEntries(existing.categories, node.categories);
  }

  const packIds = [...new Set([...(existing.packIds ?? []), ...(node.packIds ?? [])])];
  const merged = { ...existing, ...node, categories, categoryPriority, packIds };
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
    const packCategory = categoriesForNode({
      explicit: [entry.categories, pack?.categories],
      inference: [entry.id, entry.title, entry.kind, entry.description, pack?.tags],
    });
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
      categories: packCategory.categories,
      categoryPriority: packCategory.priority,
      packIds: [entry.id],
    });

    if (!pack) continue;
    const entityById = new Map(asArray(pack.entities).map((entity) => [entity.id, entity]));

    for (const document of asArray(pack.documents)) {
      const documentNodeId = `document:${entry.id}:${document.id}`;
      const documentCategory = categoriesForNode({
        explicit: [document.categories],
        inference: [document.title, document.summary, document.tags, document.source?.title],
        inherited: [packCategory.categories],
      });
      addNode(nodes, {
        id: documentNodeId,
        type: 'document',
        label: document.title,
        subtitle: `${asArray(document.sections).length} разделов`,
        resourceType: 'document',
        resourceId: document.id,
        categories: documentCategory.categories,
        categoryPriority: documentCategory.priority,
        packIds: [entry.id],
      });
      addEdge(edges, { type: 'contains', from: packNodeId, to: documentNodeId, label: 'содержит документ' });

      for (const section of asArray(document.sections)) {
        const sectionNodeId = `section:${entry.id}:${document.id}:${section.id}`;
        const sectionCategory = categoriesForNode({
          explicit: [section.categories],
          inference: [section.title, section.tags],
          inherited: [documentCategory.categories],
        });
        addNode(nodes, {
          id: sectionNodeId,
          type: 'section',
          label: section.title,
          subtitle: document.title,
          resourceType: 'document',
          resourceId: document.id,
          sectionId: section.id,
          categories: sectionCategory.categories,
          categoryPriority: sectionCategory.priority,
          packIds: [entry.id],
        });
        addEdge(edges, { type: 'contains', from: documentNodeId, to: sectionNodeId, label: 'содержит раздел' });

        for (const entityId of asArray(section.entityIds)) {
          const entity = entityById.get(entityId);
          if (!entity) continue;
          const conceptNodeId = `concept:${entity.id}`;
          const conceptCategory = categoriesForNode({
            explicit: [entity.categories],
            inference: [entity.name, entity.type, entity.description],
            inherited: [sectionCategory.categories],
          });
          addNode(nodes, {
            id: conceptNodeId,
            type: 'concept',
            label: entity.name,
            subtitle: entity.type ?? 'Понятие',
            resourceType: 'concept',
            resourceId: entity.id,
            categories: conceptCategory.categories,
            categoryPriority: conceptCategory.priority,
            packIds: [entry.id],
          });
          addEdge(edges, { type: 'mentions', from: sectionNodeId, to: conceptNodeId, label: 'упоминает' });
        }
      }
    }

    for (const entity of asArray(pack.entities)) {
      const conceptCategory = categoriesForNode({
        explicit: [entity.categories],
        inference: [entity.name, entity.type, entity.description],
        inherited: [packCategory.categories],
      });
      addNode(nodes, {
        id: `concept:${entity.id}`,
        type: 'concept',
        label: entity.name,
        subtitle: entity.type ?? 'Понятие',
        resourceType: 'concept',
        resourceId: entity.id,
        categories: conceptCategory.categories,
        categoryPriority: conceptCategory.priority,
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
    nodes: [...nodes.values()].map(({ categoryPriority: _categoryPriority, ...node }) => node),
    edges: [...edges.values()].filter((edge) => nodes.has(edge.from) && nodes.has(edge.to)),
  };
}
