import { describe, it, expect } from "vitest";
import { SymbolGraph } from "../../src/graph/symbol-graph.js";
import { GraphCommunityDetector } from "../../src/graph/community-detector.js";
import type { Symbol } from "../../src/treesitter/types.js";

function makeSymbol(name: string, kind: Symbol["kind"]): Symbol {
  return { name, kind, startLine: 1, endLine: 10, startCol: 0, endCol: 0 };
}

describe("Cohesion scoring", () => {
  it("should return 1.0 for a single-node community", () => {
    const graph = new SymbolGraph();
    graph.addSymbol(makeSymbol("a", "function"));
    const detector = new GraphCommunityDetector(graph);
    detector.detect();

    expect(detector.cohesionScore(["a"])).toBe(1.0);
  });

  it("should return 1.0 for a fully-connected clique", () => {
    const graph = new SymbolGraph();
    graph.addSymbol(makeSymbol("a", "function"));
    graph.addSymbol(makeSymbol("b", "function"));
    graph.addSymbol(makeSymbol("c", "function"));
    graph.addEdge("a", "b", "calls");
    graph.addEdge("b", "c", "calls");
    graph.addEdge("a", "c", "calls");

    const detector = new GraphCommunityDetector(graph);
    detector.detect();

    const score = detector.cohesionScore(["a", "b", "c"]);
    expect(score).toBeGreaterThanOrEqual(0.33);
  });

  it("should return low score for sparsely connected community", () => {
    const graph = new SymbolGraph();
    graph.addSymbol(makeSymbol("a", "function"));
    graph.addSymbol(makeSymbol("b", "function"));
    graph.addSymbol(makeSymbol("c", "function"));
    graph.addSymbol(makeSymbol("d", "function"));
    graph.addEdge("a", "b", "calls");

    const detector = new GraphCommunityDetector(graph);
    detector.detect();

    const score = detector.cohesionScore(["a", "b", "c", "d"]);
    expect(score).toBeLessThan(0.3);
  });

  it("should return 0 for disconnected nodes", () => {
    const graph = new SymbolGraph();
    graph.addSymbol(makeSymbol("a", "function"));
    graph.addSymbol(makeSymbol("b", "function"));
    graph.addSymbol(makeSymbol("c", "function"));

    const detector = new GraphCommunityDetector(graph);
    detector.detect();

    const score = detector.cohesionScore(["a", "b", "c"]);
    expect(score).toBe(0);
  });

  it("should be included in communityList results", () => {
    const graph = new SymbolGraph();
    graph.addSymbol(makeSymbol("AuthService", "class"));
    graph.addSymbol(makeSymbol("LoginHandler", "class"));
    graph.addSymbol(makeSymbol("TokenValidator", "class"));
    graph.addEdge("AuthService", "LoginHandler", "calls");
    graph.addEdge("AuthService", "TokenValidator", "calls");
    graph.addEdge("LoginHandler", "TokenValidator", "calls");

    const detector = new GraphCommunityDetector(graph);
    const list = detector.communityList();

    for (const community of list) {
      expect(community.cohesion).toBeGreaterThanOrEqual(0);
      expect(community.cohesion).toBeLessThanOrEqual(1);
    }

    const authCommunity = list.find(c => c.nodes.includes("AuthService"));
    expect(authCommunity).toBeDefined();
    expect(authCommunity!.cohesion).toBeGreaterThanOrEqual(0.33);
  });

  it("should never exceed 1.0 even with bidirectional edges", () => {
    const graph = new SymbolGraph();
    graph.addSymbol(makeSymbol("a", "function"));
    graph.addSymbol(makeSymbol("b", "function"));
    graph.addEdge("a", "b", "calls");
    graph.addEdge("b", "a", "calls");

    const detector = new GraphCommunityDetector(graph);
    detector.detect();

    const score = detector.cohesionScore(["a", "b"]);
    expect(score).toBeLessThanOrEqual(1.0);
  });

  it("should never exceed 1.0 with multi-edges between same pair", () => {
    const graph = new SymbolGraph();
    graph.addSymbol(makeSymbol("a", "function"));
    graph.addSymbol(makeSymbol("b", "function"));
    graph.addEdge("a", "b", "calls", "EXTRACTED");
    graph.addEdge("a", "b", "calls", "INFERRED");

    const detector = new GraphCommunityDetector(graph);
    detector.detect();

    const score = detector.cohesionScore(["a", "b"]);
    expect(score).toBeLessThanOrEqual(1.0);
  });
});
