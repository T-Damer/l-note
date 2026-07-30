import { buildKnowledgeGraph } from './core/knowledge-graph.js';
import { renderKnowledgeGraph } from './ui/knowledge-graph.js';

Object.assign(state, {
  libraryView: 'list',
});

Object.assign(dom, {
  libraryViewToggle: document.querySelector('[data-action="toggle-library-view"]'),
  knowledgeGraphView: document.querySelector('#knowledge-graph-view'),
});

function syncLibraryView() {
  const graphActive = state.libraryView === 'graph';
  dom.catalogGrid.classList.toggle('hidden', graphActive);
  dom.knowledgeGraphView?.classList.toggle('hidden', !graphActive);
  if (dom.libraryViewToggle) {
    dom.libraryViewToggle.replaceChildren(
      Icon({ name: graphActive ? 'list' : 'graph', className: 'icon' }),
      document.createTextNode(graphActive ? 'Список' : 'Граф'),
    );
    dom.libraryViewToggle.setAttribute('aria-pressed', String(graphActive));
  }
}

function renderLibraryGraph() {
  if (!dom.knowledgeGraphView) return;
  const graph = buildKnowledgeGraph({ catalog: state.catalog, packRecords: state.packRecords });
  const rendered = renderKnowledgeGraph(graph, {
    edgeLabel: (edge) => edge.type === 'relation' ? relationPredicateLabel(edge.label) : edge.label,
    onOpen: (node) => {
      if (node.resourceType === 'document') {
        navigateResource('document', node.resourceId, { sectionId: node.sectionId });
        return;
      }
      navigateResource(node.resourceType, node.resourceId);
    },
  });
  dom.knowledgeGraphView.replaceChildren(rendered);
  syncLibraryView();
}

function toggleLibraryView() {
  state.libraryView = state.libraryView === 'graph' ? 'list' : 'graph';
  if (state.libraryView === 'graph') renderLibraryGraph();
  else syncLibraryView();
}

dom.libraryViewToggle?.addEventListener('click', toggleLibraryView);
syncLibraryView();
