import type { AbstractGraph } from "graphology-types";
import { SymbolGraph } from "./symbol-graph.js";
import type { Confidence, EdgeRelation } from "./symbol-graph.js";
import type { Symbol } from "../treesitter/types.js";

export interface SerializedNode {
  name: string;
  kind: Symbol["kind"];
  startLine: number;
  endLine: number;
  startCol: number;
  endCol: number;
  sourceFile?: string;
}

export interface SerializedEdge {
  source: string;
  target: string;
  relation: EdgeRelation;
  confidence: Confidence;
}

export interface SerializedGraph {
  nodes: SerializedNode[];
  edges: SerializedEdge[];
}

export interface DiffResult {
  newNodes: string[];
  removedNodes: string[];
  newEdges: Array<{ source: string; target: string; relation: string; confidence: string }>;
  removedEdges: Array<{ source: string; target: string; relation: string; confidence: string }>;
  summary: string;
}

export class GraphSerializer {
  static toJSON(graph: SymbolGraph): SerializedGraph {
    const g = (graph as any).graph as AbstractGraph;

    const nodes: SerializedNode[] = [];
    for (const node of g.nodes()) {
      const sym = g.getNodeAttribute(node, "symbol") as Symbol | undefined;
      if (sym) {
        nodes.push({
          name: sym.name,
          kind: sym.kind,
          startLine: sym.startLine,
          endLine: sym.endLine,
          startCol: sym.startCol,
          endCol: sym.endCol,
          sourceFile: sym.sourceFile,
        });
      }
    }

    const edges: SerializedEdge[] = [];
    for (const edge of g.edges()) {
      const attrs = g.getEdgeAttributes(edge) as { relation: EdgeRelation; confidence: Confidence };
      edges.push({
        source: g.source(edge),
        target: g.target(edge),
        relation: attrs.relation,
        confidence: attrs.confidence,
      });
    }

    return { nodes, edges };
  }

  static toJSONString(graph: SymbolGraph): string {
    return JSON.stringify(GraphSerializer.toJSON(graph));
  }

  static fromJSON(json: string | SerializedGraph): SymbolGraph {
    const data: SerializedGraph = typeof json === "string" ? JSON.parse(json) : json;
    const graph = new SymbolGraph();

    for (const node of data.nodes) {
      graph.addSymbol({
        name: node.name,
        kind: node.kind,
        startLine: node.startLine,
        endLine: node.endLine,
        startCol: node.startCol,
        endCol: node.endCol,
        sourceFile: node.sourceFile,
      });
    }

    for (const edge of data.edges) {
      graph.addEdge(edge.source, edge.target, edge.relation, edge.confidence);
    }

    return graph;
  }
}

export class GraphDiff {
  static diff(oldGraph: SymbolGraph, newGraph: SymbolGraph): DiffResult {
    const g1 = (oldGraph as any).graph as AbstractGraph;
    const g2 = (newGraph as any).graph as AbstractGraph;

    const oldNodes = new Set(g1.nodes());
    const newNodes = new Set(g2.nodes());

    const addedNodes = [...newNodes].filter(n => !oldNodes.has(n));
    const removedNodes = [...oldNodes].filter(n => !newNodes.has(n));

    const oldEdgeKeys = new Set<string>();
    for (const edge of g1.edges()) {
      oldEdgeKeys.add(`${g1.source(edge)}|${g1.target(edge)}|${g1.getEdgeAttributes(edge).relation}`);
    }

    const newEdgeKeys = new Set<string>();
    const newEdgeMap = new Map<string, { source: string; target: string; relation: string; confidence: string }>();
    for (const edge of g2.edges()) {
      const attrs = g2.getEdgeAttributes(edge);
      const key = `${g2.source(edge)}|${g2.target(edge)}|${attrs.relation}`;
      newEdgeKeys.add(key);
      newEdgeMap.set(key, {
        source: g2.source(edge),
        target: g2.target(edge),
        relation: attrs.relation,
        confidence: attrs.confidence,
      });
    }

    const oldEdgeMap = new Map<string, { source: string; target: string; relation: string; confidence: string }>();
    for (const edge of g1.edges()) {
      const attrs = g1.getEdgeAttributes(edge);
      const key = `${g1.source(edge)}|${g1.target(edge)}|${attrs.relation}`;
      oldEdgeMap.set(key, {
        source: g1.source(edge),
        target: g1.target(edge),
        relation: attrs.relation,
        confidence: attrs.confidence,
      });
    }

    const addedEdges = [...newEdgeKeys].filter(k => !oldEdgeKeys.has(k)).map(k => newEdgeMap.get(k)!);
    const removedEdges = [...oldEdgeKeys].filter(k => !newEdgeKeys.has(k)).map(k => oldEdgeMap.get(k)!);

    const parts: string[] = [];
    if (addedNodes.length) parts.push(`${addedNodes.length} new node${addedNodes.length !== 1 ? "s" : ""}`);
    if (addedEdges.length) parts.push(`${addedEdges.length} new edge${addedEdges.length !== 1 ? "s" : ""}`);
    if (removedNodes.length) parts.push(`${removedNodes.length} node${removedNodes.length !== 1 ? "s" : ""} removed`);
    if (removedEdges.length) parts.push(`${removedEdges.length} edge${removedEdges.length !== 1 ? "s" : ""} removed`);

    return {
      newNodes: addedNodes,
      removedNodes,
      newEdges: addedEdges,
      removedEdges,
      summary: parts.length > 0 ? parts.join(", ") : "no changes",
    };
  }
}
