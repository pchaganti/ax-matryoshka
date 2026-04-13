/**
 * SymbolGraph - In-memory knowledge graph for code symbol relationships
 *
 * Wraps graphology to provide typed, directed edges between symbols
 * extracted by tree-sitter. Supports queries like "who calls this function",
 * "what does this class extend", and neighborhood subgraph extraction.
 */

// eslint-disable-next-line @typescript-eslint/no-require-imports
import GraphConstructor from "graphology";
import type { AbstractGraph } from "graphology-types";
import type { Symbol } from "../treesitter/types.js";

export type EdgeRelation = "calls" | "extends" | "implements" | "imports" | "contains";

export type Confidence = "EXTRACTED" | "INFERRED" | "AMBIGUOUS";

interface NodeAttrs {
  symbol: Symbol;
}

interface EdgeAttrs {
  relation: EdgeRelation;
  confidence: Confidence;
}

export interface NeighborhoodEdge {
  source: string;
  target: string;
  relation: EdgeRelation;
  confidence: Confidence;
}

export interface EdgeWithConfidence {
  source: string;
  target: string;
  relation: EdgeRelation;
  confidence: Confidence;
}

export interface Neighborhood {
  nodes: Symbol[];
  edges: NeighborhoodEdge[];
}

// Resolve CJS/ESM interop: graphology may export as default or as .Graph
const Graph = (typeof GraphConstructor === "function"
  ? GraphConstructor
  : (GraphConstructor as unknown as { Graph: typeof GraphConstructor }).Graph
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
) as any;

export class SymbolGraph {
  private graph: AbstractGraph<NodeAttrs, EdgeAttrs>;

  constructor() {
    this.graph = new Graph({
      type: "directed",
      multi: true,
      allowSelfLoops: false,
    });
  }

  addSymbol(symbol: Symbol): void {
    const isFileNode = symbol.kind === "file" && symbol.name.startsWith("file:");
    if (!isFileNode && symbol.sourceFile) {
      const fileNodeId = `file:${symbol.sourceFile}`;
      if (!this.graph.hasNode(fileNodeId)) {
        this.graph.addNode(fileNodeId, {
          symbol: { name: fileNodeId, kind: "file", startLine: 0, endLine: 0, startCol: 0, endCol: 0, sourceFile: symbol.sourceFile },
        });
      }
    }
    if (this.graph.hasNode(symbol.name)) {
      this.graph.setNodeAttribute(symbol.name, "symbol", symbol);
    } else {
      this.graph.addNode(symbol.name, { symbol });
    }
    if (!isFileNode && symbol.sourceFile) {
      const fileNodeId = `file:${symbol.sourceFile}`;
      if (!this.hasEdge(fileNodeId, symbol.name, "contains")) {
        this.graph.addEdge(fileNodeId, symbol.name, { relation: "contains", confidence: "EXTRACTED" });
      }
    }
  }

  addFileNode(filePath: string): void {
    const id = `file:${filePath}`;
    if (!this.graph.hasNode(id)) {
      this.graph.addNode(id, {
        symbol: { name: id, kind: "file", startLine: 0, endLine: 0, startCol: 0, endCol: 0, sourceFile: filePath },
      });
    }
  }

  fileSymbols(filePath: string): Symbol[] {
    const id = `file:${filePath}`;
    if (!this.graph.hasNode(id)) return [];
    const result: Symbol[] = [];
    this.graph.forEachOutEdge(id, (_edge, attrs, _src, target) => {
      if (attrs.relation === "contains") {
        const sym = this.graph.getNodeAttribute(target, "symbol");
        if (sym) result.push(sym);
      }
    });
    return result;
  }

  hasSymbol(name: string): boolean {
    return this.graph.hasNode(name);
  }

  getSymbol(name: string): Symbol | null {
    if (!this.graph.hasNode(name)) return null;
    return this.graph.getNodeAttribute(name, "symbol");
  }

  allSymbols(): Symbol[] {
    return this.graph.mapNodes((_name, attrs) => attrs.symbol);
  }

  addEdge(source: string, target: string, relation: EdgeRelation, confidence: Confidence = "EXTRACTED"): void {
    if (!this.graph.hasNode(source) || !this.graph.hasNode(target)) return;
    if (this.hasEdgeWithConfidence(source, target, relation, confidence)) return;
    this.graph.addEdge(source, target, { relation, confidence });
  }

  hasEdge(source: string, target: string, relation: EdgeRelation): boolean {
    if (!this.graph.hasNode(source) || !this.graph.hasNode(target)) return false;
    let found = false;
    this.graph.forEachOutEdge(source, (_edge, attrs, _src, tgt) => {
      if (tgt === target && attrs.relation === relation) found = true;
    });
    return found;
  }

  getEdges(source: string, target: string): EdgeWithConfidence[] {
    if (!this.graph.hasNode(source) || !this.graph.hasNode(target)) return [];
    const result: EdgeWithConfidence[] = [];
    this.graph.forEachOutEdge(source, (_edge, attrs, _src, tgt) => {
      if (tgt === target) {
        result.push({ source, target, relation: attrs.relation, confidence: attrs.confidence });
      }
    });
    return result;
  }

  edgeAttributes(): EdgeWithConfidence[] {
    const result: EdgeWithConfidence[] = [];
    this.graph.forEachEdge((_edge, attrs, source, target) => {
      result.push({ source, target, relation: attrs.relation, confidence: attrs.confidence });
    });
    return result;
  }

  private hasEdgeWithConfidence(source: string, target: string, relation: EdgeRelation, confidence: Confidence): boolean {
    if (!this.graph.hasNode(source) || !this.graph.hasNode(target)) return false;
    let found = false;
    this.graph.forEachOutEdge(source, (_edge, attrs, _src, tgt) => {
      if (tgt === target && attrs.relation === relation && attrs.confidence === confidence) found = true;
    });
    return found;
  }

  /** Who calls this symbol? (incoming "calls" edges) */
  callers(name: string): Symbol[] {
    return this.incomingByRelation(name, "calls");
  }

  /** What does this symbol call? (outgoing "calls" edges) */
  callees(name: string): Symbol[] {
    return this.outgoingByRelation(name, "calls");
  }

  /** Transitive ancestor chain via "extends" edges */
  ancestors(name: string): Symbol[] {
    const result: Symbol[] = [];
    const visited = new Set<string>();
    let current = name;
    while (true) {
      visited.add(current);
      const parents = this.outgoingByRelation(current, "extends");
      if (parents.length === 0) break;
      const parent = parents[0]; // single inheritance — take first
      if (visited.has(parent.name)) break; // cycle guard
      result.push(parent);
      current = parent.name;
    }
    return result;
  }

  /** All classes/types that extend this symbol (transitive) */
  descendants(name: string): Symbol[] {
    return this.transitiveIncoming(name, "extends");
  }

  /** All classes that implement this interface (transitive via extends) */
  implementations(name: string): Symbol[] {
    const direct = this.incomingByRelation(name, "implements");
    const all = [...direct];
    const seen = new Set(direct.map(s => s.name));
    for (const impl of direct) {
      for (const desc of this.descendants(impl.name)) {
        if (!seen.has(desc.name)) {
          seen.add(desc.name);
          all.push(desc);
        }
      }
    }
    return all;
  }

  /**
   * All symbols that transitively depend on this symbol
   * (incoming edges of any type, BFS).
   * Optional depth limit.
   */
  dependents(name: string, maxDepth?: number): Symbol[] {
    if (!this.graph.hasNode(name)) return [];
    const result: Symbol[] = [];
    const visited = new Set<string>();
    visited.add(name);

    // BFS over incoming edges (reverse direction)
    const queue: Array<{ node: string; depth: number }> = [{ node: name, depth: 0 }];
    while (queue.length > 0) {
      const { node, depth } = queue.shift()!;
      if (maxDepth !== undefined && depth >= maxDepth) continue;

      this.graph.forEachInEdge(node, (_edge, attrs, source) => {
        if (!visited.has(source)) {
          visited.add(source);
          const sym = this.graph.getNodeAttribute(source, "symbol");
          if (sym) result.push(sym);
          queue.push({ node: source, depth: depth + 1 });
        }
      });
    }
    return result;
  }

  /**
   * Subgraph around a symbol within a given depth, treating the call/type
   * graph as undirected for traversal.
   *
   * At each hop we expand via BOTH outgoing and incoming edges, so nodes
   * reachable via a mixed path (A → B ← C) are included. Two independent
   * BFS walks — one purely forward, one purely reverse — would miss such
   * nodes, which is a surprising result when the docstring promises
   * "both directions".
   */
  neighborhood(name: string, depth: number): Neighborhood {
    if (!this.graph.hasNode(name)) return { nodes: [], edges: [] };

    const nodeSet = new Set<string>([name]);
    const queue: Array<{ node: string; d: number }> = [{ node: name, d: 0 }];

    while (queue.length > 0) {
      const { node, d } = queue.shift()!;
      if (d >= depth) continue;

      // Outgoing neighbors
      this.graph.forEachOutEdge(node, (_edge, _attrs, _src, target) => {
        if (!nodeSet.has(target)) {
          nodeSet.add(target);
          queue.push({ node: target, d: d + 1 });
        }
      });

      // Incoming neighbors — same hop distance in an undirected sense
      this.graph.forEachInEdge(node, (_edge, _attrs, source) => {
        if (!nodeSet.has(source)) {
          nodeSet.add(source);
          queue.push({ node: source, d: d + 1 });
        }
      });
    }

    const nodes: Symbol[] = [];
    for (const n of nodeSet) {
      const sym = this.graph.getNodeAttribute(n, "symbol");
      if (sym) nodes.push(sym);
    }

    const edges: NeighborhoodEdge[] = [];
    this.graph.forEachEdge((_edge, attrs, source, target) => {
      if (nodeSet.has(source) && nodeSet.has(target)) {
        edges.push({ source, target, relation: attrs.relation, confidence: attrs.confidence });
      }
    });

    return { nodes, edges };
  }

  clear(): void {
    this.graph.clear();
  }

  stats(): { nodes: number; edges: number } {
    return {
      nodes: this.graph.order,
      edges: this.graph.size,
    };
  }

  // --- Private helpers ---

  private incomingByRelation(name: string, relation: EdgeRelation): Symbol[] {
    if (!this.graph.hasNode(name)) return [];
    const result: Symbol[] = [];
    this.graph.forEachInEdge(name, (_edge, attrs, source) => {
      if (attrs.relation === relation) {
        const sym = this.graph.getNodeAttribute(source, "symbol");
        if (sym) result.push(sym);
      }
    });
    return result;
  }

  private outgoingByRelation(name: string, relation: EdgeRelation): Symbol[] {
    if (!this.graph.hasNode(name)) return [];
    const result: Symbol[] = [];
    this.graph.forEachOutEdge(name, (_edge, attrs, _source, target) => {
      if (attrs.relation === relation) {
        const sym = this.graph.getNodeAttribute(target, "symbol");
        if (sym) result.push(sym);
      }
    });
    return result;
  }

  private transitiveIncoming(name: string, relation: EdgeRelation): Symbol[] {
    if (!this.graph.hasNode(name)) return [];
    const result: Symbol[] = [];
    const visited = new Set<string>([name]);
    const queue = [name];
    while (queue.length > 0) {
      const current = queue.shift()!;
      this.graph.forEachInEdge(current, (_edge, attrs, source) => {
        if (attrs.relation === relation && !visited.has(source)) {
          visited.add(source);
          const sym = this.graph.getNodeAttribute(source, "symbol");
          if (sym) result.push(sym);
          queue.push(source);
        }
      });
    }
    return result;
  }
}
