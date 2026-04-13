import louvainFn from "graphology-communities-louvain";
import GraphConstructor from "graphology";
import type { AbstractGraph } from "graphology-types";
import type { SymbolGraph } from "./symbol-graph.js";

const louvain = louvainFn as unknown as (graph: AbstractGraph) => Record<string, number>;

// CJS/ESM interop mirror of the pattern in symbol-graph.ts
const Graph = (typeof GraphConstructor === "function"
  ? GraphConstructor
  : (GraphConstructor as unknown as { Graph: typeof GraphConstructor }).Graph
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
) as any;

export type CommunityMap = Record<string, number>;

export interface Community {
  id: number;
  nodes: string[];
  cohesion: number;
}

export class GraphCommunityDetector {
  private graph: AbstractGraph;
  private communities: CommunityMap | null;

  /**
   * @param symbolGraph  The symbol graph to cluster.
   * @param precomputed  Optional pre-run community assignment. When supplied,
   *                     `detect()` is a no-op and returns the cached map,
   *                     avoiding a redundant Louvain pass when the session
   *                     has already computed communities at load time.
   */
  constructor(symbolGraph: SymbolGraph, precomputed?: CommunityMap) {
    this.graph = symbolGraph.internalGraph();
    this.communities = precomputed ?? null;
  }

  detect(): CommunityMap {
    if (this.communities) return this.communities;

    if (this.graph.order === 0) {
      this.communities = {};
      return this.communities;
    }

    const undirected = this.toUndirected();
    const partition = louvain(undirected);

    this.communities = {};
    for (const node of this.graph.nodes()) {
      this.communities[node] = partition[node] ?? 0;
    }

    return this.communities;
  }

  communityList(): Community[] {
    const map = this.communities ?? this.detect();
    const grouped: Record<number, string[]> = {};
    for (const [node, cid] of Object.entries(map)) {
      if (!grouped[cid]) grouped[cid] = [];
      grouped[cid].push(node);
    }

    return Object.entries(grouped).map(([cid, nodes]) => ({
      id: Number(cid),
      nodes,
      cohesion: this.cohesionScore(nodes),
    })).sort((a, b) => b.nodes.length - a.nodes.length);
  }

  nodeCommunity(node: string): number | undefined {
    const map = this.communities ?? this.detect();
    return map[node];
  }

  cohesionScore(communityNodes: string[]): number {
    const n = communityNodes.length;
    if (n <= 1) return 1.0;

    const nodeSet = new Set(communityNodes);
    const edgeSet = new Set<string>();
    for (const node of communityNodes) {
      this.graph.forEachOutEdge(node, (_edge, _attrs, _src, target) => {
        if (nodeSet.has(target)) {
          const key = node < target ? `${node}|${target}` : `${target}|${node}`;
          edgeSet.add(key);
        }
      });
    }

    const actual = edgeSet.size;
    const possible = n * (n - 1) / 2;
    return possible > 0 ? Math.round((actual / possible) * 100) / 100 : 0;
  }

  private toUndirected(): AbstractGraph {
    const G = new Graph({ type: "undirected", multi: false });

    for (const node of this.graph.nodes()) {
      if (!G.hasNode(node)) G.addNode(node);
    }

    for (const edge of this.graph.edges()) {
      const src = this.graph.source(edge);
      const tgt = this.graph.target(edge);
      if (src !== tgt && !G.hasEdge(src, tgt)) {
        G.addUndirectedEdge(src, tgt);
      }
    }

    return G as unknown as AbstractGraph;
  }
}
