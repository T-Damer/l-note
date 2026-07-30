export interface KnowledgeGraphCategory {
  id: string;
  weight: number;
}

export interface KnowledgeGraphNode {
  id: string;
  type: 'pack' | 'document' | 'section' | 'concept';
  label: string;
  subtitle?: string;
  resourceType: 'package' | 'document' | 'concept';
  resourceId: string;
  sectionId?: string;
  installed?: boolean;
  enabled?: boolean;
  categories: KnowledgeGraphCategory[];
  packIds: string[];
}

export interface KnowledgeGraphEdge {
  id: string;
  type: 'contains' | 'mentions' | 'relation';
  from: string;
  to: string;
  label?: string;
  strength?: number | null;
}

export interface KnowledgeGraph {
  version: string;
  nodeTypes: readonly ['pack', 'document', 'section', 'concept'];
  nodes: KnowledgeGraphNode[];
  edges: KnowledgeGraphEdge[];
}

export const KNOWLEDGE_GRAPH_VERSION: string;
export function inferKnowledgeCategories(...values: unknown[]): KnowledgeGraphCategory[];
export function buildKnowledgeGraph(input?: {
  catalog?: { packs?: unknown[] };
  packRecords?: unknown[];
}): KnowledgeGraph;
