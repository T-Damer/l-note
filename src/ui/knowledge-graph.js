const SVG_NS = 'http://www.w3.org/2000/svg';
const TYPE_ORDER = Object.freeze(['pack', 'document', 'section', 'concept']);
const TYPE_LABELS = Object.freeze({
  pack: 'Пакеты',
  document: 'Документы',
  section: 'Разделы',
  concept: 'Понятия',
});
const CATEGORY_COLORS = Object.freeze({
  pediatrics: 'var(--category-pediatrics)',
  dentistry: 'var(--category-dentistry)',
  unknown: 'var(--category-unknown)',
});

function svg(tag, attributes = {}) {
  const node = document.createElementNS(SVG_NS, tag);
  for (const [key, value] of Object.entries(attributes)) node.setAttribute(key, String(value));
  return node;
}

function normalizedCategoryId(value) {
  return String(value ?? 'unknown').trim().toLocaleLowerCase('en-US').replace(/[^a-z0-9_-]+/gu, '-');
}

function categoryColor(categoryId) {
  return CATEGORY_COLORS[normalizedCategoryId(categoryId)] ?? CATEGORY_COLORS.unknown;
}

export function shortGraphLabel(value, limit = 28) {
  const source = String(value ?? '').trim();
  return source.length > limit ? `${source.slice(0, Math.max(1, limit - 1))}…` : source;
}

export function layoutKnowledgeGraph(graph, options = {}) {
  const columnWidth = Number(options.columnWidth ?? 260);
  const nodeWidth = Number(options.nodeWidth ?? 210);
  const nodeHeight = Number(options.nodeHeight ?? 48);
  const rowGap = Number(options.rowGap ?? 18);
  const top = Number(options.top ?? 60);
  const left = Number(options.left ?? 28);
  const groups = new Map(TYPE_ORDER.map((type) => [type, []]));
  for (const node of graph?.nodes ?? []) {
    if (groups.has(node.type)) groups.get(node.type).push(node);
  }
  for (const nodes of groups.values()) nodes.sort((leftNode, rightNode) => leftNode.label.localeCompare(rightNode.label, 'ru'));

  const positioned = new Map();
  let maximumRows = 1;
  for (const [column, type] of TYPE_ORDER.entries()) {
    const nodes = groups.get(type);
    maximumRows = Math.max(maximumRows, nodes.length);
    for (const [row, node] of nodes.entries()) {
      positioned.set(node.id, {
        ...node,
        x: left + column * columnWidth,
        y: top + row * (nodeHeight + rowGap),
        width: nodeWidth,
        height: nodeHeight,
      });
    }
  }

  return {
    nodes: [...positioned.values()],
    edges: (graph?.edges ?? []).filter((edge) => positioned.has(edge.from) && positioned.has(edge.to)),
    positions: positioned,
    width: left * 2 + (TYPE_ORDER.length - 1) * columnWidth + nodeWidth,
    height: top + maximumRows * (nodeHeight + rowGap) + 30,
    columns: TYPE_ORDER.map((type, column) => ({ type, label: TYPE_LABELS[type], x: left + column * columnWidth })),
  };
}

function nodeFill(node, defs) {
  const categories = Array.isArray(node.categories) && node.categories.length
    ? node.categories
    : [{ id: 'unknown', weight: 1 }];
  if (categories.length === 1) return categoryColor(categories[0].id);

  const gradientId = `graph-gradient-${node.id.replace(/[^a-z0-9_-]+/giu, '-')}`;
  const gradient = svg('linearGradient', { id: gradientId, x1: '0%', x2: '100%', y1: '0%', y2: '0%' });
  let offset = 0;
  const total = categories.reduce((sum, category) => sum + Number(category.weight || 0), 0) || 1;
  for (const category of categories) {
    const start = Math.max(0, Math.min(1, offset / total));
    offset += Number(category.weight || 0);
    const end = Math.max(start, Math.min(1, offset / total));
    gradient.append(
      svg('stop', { offset: `${Math.round(start * 100)}%`, 'stop-color': categoryColor(category.id) }),
      svg('stop', { offset: `${Math.round(end * 100)}%`, 'stop-color': categoryColor(category.id) }),
    );
  }
  defs.append(gradient);
  return `url(#${gradientId})`;
}

function edgePath(from, to) {
  const fromX = from.x + from.width;
  const fromY = from.y + from.height / 2;
  const toX = to.x;
  const toY = to.y + to.height / 2;
  if (from.type === to.type) {
    const loopX = fromX + 42;
    return `M ${fromX} ${fromY} C ${loopX} ${fromY}, ${loopX} ${toY}, ${to.x + to.width} ${toY}`;
  }
  const middle = fromX + Math.max(36, (toX - fromX) / 2);
  return `M ${fromX} ${fromY} C ${middle} ${fromY}, ${middle} ${toY}, ${toX} ${toY}`;
}

export function renderKnowledgeGraph(graph, options = {}) {
  const layout = layoutKnowledgeGraph(graph, options);
  const shell = document.createElement('div');
  shell.className = 'knowledge-graph-shell';

  const summary = document.createElement('div');
  summary.className = 'knowledge-graph-summary';
  summary.textContent = `${layout.nodes.length} узлов · ${layout.edges.length} связей`;
  shell.append(summary);

  const viewport = document.createElement('div');
  viewport.className = 'knowledge-graph-viewport';
  const canvas = svg('svg', {
    class: 'knowledge-graph-canvas',
    viewBox: `0 0 ${layout.width} ${layout.height}`,
    width: layout.width,
    height: layout.height,
    role: 'group',
    'aria-label': 'Граф установленных и доступных знаний',
  });
  const defs = svg('defs');
  canvas.append(defs);

  for (const column of layout.columns) {
    const label = svg('text', { x: column.x, y: 28, class: 'knowledge-graph-column-label' });
    label.textContent = column.label;
    canvas.append(label);
  }

  const edgeLayer = svg('g', { class: 'knowledge-graph-edges' });
  for (const edge of layout.edges) {
    const from = layout.positions.get(edge.from);
    const to = layout.positions.get(edge.to);
    const path = svg('path', {
      d: edgePath(from, to),
      class: `knowledge-graph-edge knowledge-graph-edge--${edge.type}`,
    });
    const title = svg('title');
    title.textContent = options.edgeLabel?.(edge) ?? edge.label ?? edge.type;
    path.append(title);
    edgeLayer.append(path);
  }
  canvas.append(edgeLayer);

  const nodeLayer = svg('g', { class: 'knowledge-graph-nodes' });
  for (const node of layout.nodes) {
    const group = svg('g', {
      class: `knowledge-graph-node knowledge-graph-node--${node.type}${node.installed === false ? ' is-uninstalled' : ''}`,
      role: 'button',
      tabindex: '0',
      'aria-label': `${TYPE_LABELS[node.type]}: ${node.label}`,
      transform: `translate(${node.x} ${node.y})`,
    });
    const rect = svg('rect', {
      width: node.width,
      height: node.height,
      rx: 11,
      fill: nodeFill(node, defs),
    });
    const title = svg('title');
    title.textContent = `${node.label}${node.subtitle ? ` — ${node.subtitle}` : ''}`;
    group.append(rect, title);

    const label = svg('text', { x: 12, y: 20, class: 'knowledge-graph-node-label' });
    label.textContent = shortGraphLabel(node.label, 30);
    const subtitle = svg('text', { x: 12, y: 37, class: 'knowledge-graph-node-subtitle' });
    subtitle.textContent = shortGraphLabel(node.subtitle ?? TYPE_LABELS[node.type], 34);
    group.append(label, subtitle);

    const open = () => options.onOpen?.(node);
    group.addEventListener('click', open);
    group.addEventListener('keydown', (event) => {
      if (event.key !== 'Enter' && event.key !== ' ') return;
      event.preventDefault();
      open();
    });
    nodeLayer.append(group);
  }
  canvas.append(nodeLayer);
  viewport.append(canvas);
  shell.append(viewport);
  return shell;
}
