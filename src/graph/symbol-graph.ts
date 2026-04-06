/**
 * SymbolGraph - In-memory knowledge graph for code symbol relationships
 *
 * Wraps graphology to provide typed, directed edges between symbols
 * extracted by tree-sitter. Supports queries like "who calls this function",
 * "what does this class extend", and neighborhood subgraph extraction.
 */

// eslint-disable-next-line @typescript-eslint/no-require-imports
import GraphConstructor from "graphology";
import { bfsFromNode } from "graphology-traversal";
import type { AbstractGraph } from "graphology-types";
import type { Symbol } from "../treesitter/types.js";

export type EdgeRelation = "calls" | "extends" | "implements" | "imports";

interface NodeAttrs {
  symbol: Symbol;
}

interface EdgeAttrs {
  relation: EdgeRelation;
}

export interface NeighborhoodEdge {
  source: string;
  target: string;
  relation: EdgeRelation;
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
    if (this.graph.hasNode(symbol.name)) {
      this.graph.setNodeAttribute(symbol.name, "symbol", symbol);
    } else {
      this.graph.addNode(symbol.name, { symbol });
    }
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

  addEdge(source: string, target: string, relation: EdgeRelation): void {
    if (!this.graph.hasNode(source) || !this.graph.hasNode(target)) return;
    // Avoid duplicate edges of the same relation
    if (this.hasEdge(source, target, relation)) return;
    this.graph.addEdge(source, target, { relation });
  }

  hasEdge(source: string, target: string, relation: EdgeRelation): boolean {
    if (!this.graph.hasNode(source) || !this.graph.hasNode(target)) return false;
    let found = false;
    this.graph.forEachOutEdge(source, (_edge, attrs, _src, tgt) => {
      if (tgt === target && attrs.relation === relation) found = true;
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

  /** All classes that implement this interface */
  implementations(name: string): Symbol[] {
    return this.incomingByRelation(name, "implements");
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
          result.push(sym);
          queue.push({ node: source, depth: depth + 1 });
        }
      });
    }
    return result;
  }

  /** Subgraph around a symbol within a given depth (both directions) */
  neighborhood(name: string, depth: number): Neighborhood {
    if (!this.graph.hasNode(name)) return { nodes: [], edges: [] };

    const nodeSet = new Set<string>();

    // BFS outward (both directions) up to depth
    bfsFromNode(this.graph, name, (node, _attrs, d) => {
      if (d > depth) return true; // stop
      nodeSet.add(node);
      return false;
    });

    // Also walk incoming edges (bfsFromNode follows outgoing by default)
    const reverseQueue: Array<{ node: string; d: number }> = [{ node: name, d: 0 }];
    const reverseVisited = new Set<string>([name]);
    while (reverseQueue.length > 0) {
      const { node, d } = reverseQueue.shift()!;
      if (d >= depth) continue;
      this.graph.forEachInEdge(node, (_edge, _attrs, source) => {
        if (!reverseVisited.has(source)) {
          reverseVisited.add(source);
          nodeSet.add(source);
          reverseQueue.push({ node: source, d: d + 1 });
        }
      });
    }

    const nodes: Symbol[] = [];
    for (const n of nodeSet) {
      nodes.push(this.graph.getNodeAttribute(n, "symbol"));
    }

    const edges: NeighborhoodEdge[] = [];
    this.graph.forEachEdge((_edge, attrs, source, target) => {
      if (nodeSet.has(source) && nodeSet.has(target)) {
        edges.push({ source, target, relation: attrs.relation });
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
        result.push(this.graph.getNodeAttribute(source, "symbol"));
      }
    });
    return result;
  }

  private outgoingByRelation(name: string, relation: EdgeRelation): Symbol[] {
    if (!this.graph.hasNode(name)) return [];
    const result: Symbol[] = [];
    this.graph.forEachOutEdge(name, (_edge, attrs, _source, target) => {
      if (attrs.relation === relation) {
        result.push(this.graph.getNodeAttribute(target, "symbol"));
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
          result.push(this.graph.getNodeAttribute(source, "symbol"));
          queue.push(source);
        }
      });
    }
    return result;
  }
}
