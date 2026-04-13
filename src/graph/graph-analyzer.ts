import type { AbstractGraph } from "graphology-types";
import type { SymbolGraph } from "./symbol-graph.js";
import type { CommunityMap } from "./community-detector.js";

export interface GodNode {
  name: string;
  degree: number;
}

export interface SurprisingConnection {
  source: string;
  target: string;
  relation: string;
  confidence: string;
  score: number;
  why: string;
}

export interface BridgeNode {
  name: string;
  degree: number;
  communityReach: number;
}

export interface SuggestedQuestion {
  type: string;
  question: string;
  why: string;
}

export interface AnalysisReport {
  godNodes: GodNode[];
  surprisingConnections: SurprisingConnection[];
  bridgeNodes: BridgeNode[];
  questions: SuggestedQuestion[];
  communities: { id: number; nodes: string[]; cohesion: number }[];
}

export class GraphAnalyzer {
  private graph: AbstractGraph;
  private communities: CommunityMap;

  constructor(symbolGraph: SymbolGraph, communities: CommunityMap) {
    this.graph = (symbolGraph as any).graph as AbstractGraph;
    this.communities = communities;
  }

  godNodes(topN: number = 10): GodNode[] {
    if (this.graph.order === 0) return [];

    const degrees: Array<{ name: string; degree: number }> = [];
    for (const node of this.graph.nodes()) {
      const sym = this.graph.getNodeAttribute(node, "symbol");
      if (!sym || sym.kind === "file") continue;
      const deg = this.graph.degree(node);
      if (deg > 0) degrees.push({ name: node, degree: deg });
    }

    degrees.sort((a, b) => b.degree - a.degree);
    return degrees.slice(0, topN);
  }

  surprisingConnections(topN: number = 5): SurprisingConnection[] {
    if (this.graph.size === 0) return [];

    const results: SurprisingConnection[] = [];

    for (const edge of this.graph.edges()) {
      const attrs = this.graph.getEdgeAttributes(edge);
      const src = this.graph.source(edge);
      const tgt = this.graph.target(edge);

      if (attrs.relation === "contains" || attrs.relation === "imports") continue;

      const srcComm = this.communities[src];
      const tgtComm = this.communities[tgt];
      const crossCommunity = srcComm !== undefined && tgtComm !== undefined && srcComm !== tgtComm;

      let score = 0;
      const reasons: string[] = [];

      if (attrs.confidence === "AMBIGUOUS") {
        score += 3;
        reasons.push("ambiguous connection - needs verification");
      } else if (attrs.confidence === "INFERRED") {
        score += 2;
        reasons.push("inferred connection - not explicitly stated");
      } else {
        score += 1;
      }

      if (crossCommunity) {
        score += 2;
        reasons.push(`bridges community ${srcComm} and ${tgtComm}`);
      }

      const srcDeg = this.graph.degree(src);
      const tgtDeg = this.graph.degree(tgt);
      if (Math.min(srcDeg, tgtDeg) <= 1 && Math.max(srcDeg, tgtDeg) >= 3) {
        score += 1;
        const peripheral = srcDeg <= tgtDeg ? src : tgt;
        const hub = srcDeg <= tgtDeg ? tgt : src;
        reasons.push(`peripheral node '${peripheral}' reaches hub '${hub}'`);
      }

      if (!crossCommunity && attrs.confidence === "EXTRACTED") continue;

      results.push({
        source: src,
        target: tgt,
        relation: attrs.relation,
        confidence: attrs.confidence,
        score,
        why: reasons.length > 0 ? reasons.join("; ") : "structural connection",
      });
    }

    results.sort((a, b) => b.score - a.score);
    return results.slice(0, topN);
  }

  bridgeNodes(topN: number = 5): BridgeNode[] {
    if (this.graph.order === 0) return [];

    const results: BridgeNode[] = [];
    for (const node of this.graph.nodes()) {
      const sym = this.graph.getNodeAttribute(node, "symbol");
      if (!sym || sym.kind === "file") continue;

      const nodeComm = this.communities[node];
      const neighborComms = new Set<number>();

      this.graph.forEachOutEdge(node, (_edge, _attrs, _src, target) => {
        const tc = this.communities[target];
        if (tc !== undefined && tc !== nodeComm) neighborComms.add(tc);
      });
      this.graph.forEachInEdge(node, (_edge, _attrs, source) => {
        const sc = this.communities[source];
        if (sc !== undefined && sc !== nodeComm) neighborComms.add(sc);
      });

      if (neighborComms.size > 0) {
        results.push({
          name: node,
          degree: this.graph.degree(node),
          communityReach: neighborComms.size,
        });
      }
    }

    results.sort((a, b) => b.communityReach - a.communityReach || b.degree - a.degree);
    return results.slice(0, topN);
  }

  suggestQuestions(): SuggestedQuestion[] {
    const questions: SuggestedQuestion[] = [];

    // 1. Isolated nodes
    const isolated: string[] = [];
    for (const node of this.graph.nodes()) {
      const sym = this.graph.getNodeAttribute(node, "symbol");
      if (!sym || sym.kind === "file") continue;
      if (this.graph.degree(node) === 0) {
        isolated.push(node);
      }
    }
    if (isolated.length > 0) {
      const labels = isolated.slice(0, 3).map(n => `\`${n}\``).join(", ");
      questions.push({
        type: "isolated_nodes",
        question: `What connects ${labels} to the rest of the system?`,
        why: `${isolated.length} isolated node(s) found - possible documentation gap or missing edges.`,
      });
    }

    // 2. AMBIGUOUS edges
    for (const edge of this.graph.edges()) {
      const attrs = this.graph.getEdgeAttributes(edge);
      if (attrs.confidence === "AMBIGUOUS") {
        const src = this.graph.source(edge);
        const tgt = this.graph.target(edge);
        questions.push({
          type: "ambiguous_edge",
          question: `What is the exact relationship between \`${src}\` and \`${tgt}\`?`,
          why: `Edge tagged AMBIGUOUS (relation: ${attrs.relation}) - low confidence.`,
        });
      }
    }

    // 3. Bridge node questions
    const bridges = this.bridgeNodes(3);
    for (const bridge of bridges) {
      questions.push({
        type: "bridge_node",
        question: `Why does \`${bridge.name}\` connect multiple communities?`,
        why: `High connectivity (${bridge.degree} edges) reaching ${bridge.communityReach} communities.`,
      });
    }

    // 4. God node verification
    const gods = this.godNodes(3);
    for (const god of gods) {
      let inferredCount = 0;
      this.graph.forEachEdge(god.name, (_edge, attrs) => {
        if (attrs.confidence === "INFERRED") inferredCount++;
      });
      if (inferredCount >= 2) {
        questions.push({
          type: "verify_inferred",
          question: `Are the ${inferredCount} inferred relationships involving \`${god.name}\` correct?`,
          why: `\`${god.name}\` has ${inferredCount} INFERRED edges needing verification.`,
        });
      }
    }

    return questions;
  }

  fullReport(): AnalysisReport {
    return {
      godNodes: this.godNodes(),
      surprisingConnections: this.surprisingConnections(),
      bridgeNodes: this.bridgeNodes(),
      questions: this.suggestQuestions(),
      communities: this.buildCommunityList(),
    };
  }

  private buildCommunityList(): Array<{ id: number; nodes: string[]; cohesion: number }> {
    const grouped: Record<number, string[]> = {};
    for (const [node, cid] of Object.entries(this.communities)) {
      if (!grouped[cid]) grouped[cid] = [];
      grouped[cid].push(node);
    }

    return Object.entries(grouped).map(([cid, nodes]) => ({
      id: Number(cid),
      nodes,
      cohesion: this.cohesionScore(nodes),
    })).sort((a, b) => b.nodes.length - a.nodes.length);
  }

  private cohesionScore(communityNodes: string[]): number {
    const n = communityNodes.length;
    if (n <= 1) return 1.0;

    const nodeSet = new Set(communityNodes);
    const edgeSet = new Set<string>();
    for (const node of communityNodes) {
      this.graph.forEachOutEdge(node, (_edge, _attrs, _src, target) => {
        if (nodeSet.has(target)) {
          const key = [node, target].sort().join("|");
          edgeSet.add(key);
        }
      });
    }

    const actual = edgeSet.size;
    const possible = n * (n - 1) / 2;
    return possible > 0 ? Math.round((actual / possible) * 100) / 100 : 0;
  }
}
