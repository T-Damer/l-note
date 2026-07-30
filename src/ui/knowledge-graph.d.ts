import type { KnowledgeGraph, KnowledgeGraphEdge, KnowledgeGraphNode } from '../core/knowledge-graph.js';

export interface PositionedKnowledgeGraphNode extends KnowledgeGraphNode {
  x: number;
  y: number;
  width: number;
  height: number;
}

export function shortGraphLabel(value: unknown, limit?: number): string;
export function layoutKnowledgeGraph(graph: KnowledgeGraph, options?: Record<string, number>): {
  nodes: PositionedKnowledgeGraphNode[];
  edges: KnowledgeGraphEdge[];
  positions: Map<string, PositionedKnowledgeGraphNode>;
  width: number;
  height: number;
  columns: Array<{ type: string; label: string; x: number }>;
};
export function renderKnowledgeGraph(graph: KnowledgeGraph, options?: {
  onOpen?: (node: KnowledgeGraphNode) => void;
  edgeLabel?: (edge: KnowledgeGraphEdge) => string;
}): HTMLDivElement;
