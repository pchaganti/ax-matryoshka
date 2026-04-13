import { describe, it, expect, beforeEach } from "vitest";
import { SymbolGraph, EdgeRelation, Confidence, type EdgeWithConfidence } from "../../src/graph/symbol-graph.js";
import type { Symbol } from "../../src/treesitter/types.js";

function makeSymbol(name: string, kind: Symbol["kind"]): Symbol {
  return { name, kind, startLine: 1, endLine: 10, startCol: 0, endCol: 0 };
}

describe("Edge confidence labels", () => {
  let graph: SymbolGraph;

  beforeEach(() => {
    graph = new SymbolGraph();
  });

  describe("addEdge with confidence", () => {
    beforeEach(() => {
      graph.addSymbol(makeSymbol("a", "function"));
      graph.addSymbol(makeSymbol("b", "function"));
      graph.addSymbol(makeSymbol("c", "function"));
    });

    it("should default to EXTRACTED confidence when not specified", () => {
      graph.addEdge("a", "b", "calls");
      const edges = graph.getEdges("a", "b");
      expect(edges).toHaveLength(1);
      expect(edges[0].confidence).toBe("EXTRACTED");
    });

    it("should store EXTRACTED confidence on explicit edges", () => {
      graph.addEdge("a", "b", "calls", "EXTRACTED");
      const edges = graph.getEdges("a", "b");
      expect(edges[0].confidence).toBe("EXTRACTED");
    });

    it("should store INFERRED confidence", () => {
      graph.addEdge("a", "b", "calls", "INFERRED");
      const edges = graph.getEdges("a", "b");
      expect(edges[0].confidence).toBe("INFERRED");
    });

    it("should store AMBIGUOUS confidence", () => {
      graph.addEdge("a", "b", "calls", "AMBIGUOUS");
      const edges = graph.getEdges("a", "b");
      expect(edges[0].confidence).toBe("AMBIGUOUS");
    });

    it("should allow same relation with different confidence between nodes", () => {
      graph.addEdge("a", "b", "calls", "EXTRACTED");
      graph.addEdge("a", "b", "calls", "INFERRED");
      const edges = graph.getEdges("a", "b");
      expect(edges).toHaveLength(2);
      const confs = edges.map((e) => e.confidence).sort();
      expect(confs).toEqual(["EXTRACTED", "INFERRED"]);
    });
  });

  describe("getEdges", () => {
    beforeEach(() => {
      graph.addSymbol(makeSymbol("a", "function"));
      graph.addSymbol(makeSymbol("b", "function"));
      graph.addSymbol(makeSymbol("c", "function"));
    });

    it("should return empty array when no edges exist", () => {
      expect(graph.getEdges("a", "b")).toEqual([]);
    });

    it("should return all edges between two nodes", () => {
      graph.addEdge("a", "b", "calls", "EXTRACTED");
      graph.addEdge("a", "b", "imports", "INFERRED");
      const edges = graph.getEdges("a", "b");
      expect(edges).toHaveLength(2);
    });
  });

  describe("edgeAttributes", () => {
    it("should return all edges with their full attributes", () => {
      graph.addSymbol(makeSymbol("a", "function"));
      graph.addSymbol(makeSymbol("b", "function"));
      graph.addSymbol(makeSymbol("c", "class"));
      graph.addEdge("a", "b", "calls", "EXTRACTED");
      graph.addEdge("c", "a", "extends", "INFERRED");

      const all = graph.edgeAttributes();
      expect(all).toHaveLength(2);
      expect(all).toContainEqual({ source: "a", target: "b", relation: "calls", confidence: "EXTRACTED" });
      expect(all).toContainEqual({ source: "c", target: "a", relation: "extends", confidence: "INFERRED" });
    });
  });

  describe("hasEdge respects confidence-aware dedup", () => {
    it("should still match edge by relation regardless of confidence", () => {
      graph.addSymbol(makeSymbol("a", "function"));
      graph.addSymbol(makeSymbol("b", "function"));
      graph.addEdge("a", "b", "calls", "INFERRED");
      expect(graph.hasEdge("a", "b", "calls")).toBe(true);
    });
  });
});
