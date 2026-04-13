import { describe, it, expect, beforeEach } from "vitest";
import { SymbolGraph } from "../../src/graph/symbol-graph.js";
import { GraphSerializer, GraphDiff, type SerializedGraph } from "../../src/graph/graph-serializer.js";
import type { Symbol } from "../../src/treesitter/types.js";

function makeSymbol(name: string, kind: Symbol["kind"], opts?: Partial<Symbol>): Symbol {
  return {
    name, kind,
    startLine: opts?.startLine ?? 1,
    endLine: opts?.endLine ?? 10,
    startCol: opts?.startCol ?? 0,
    endCol: opts?.endCol ?? 0,
    sourceFile: opts?.sourceFile,
  };
}

function buildSampleGraph(): SymbolGraph {
  const graph = new SymbolGraph();
  graph.addSymbol(makeSymbol("AuthService", "class", { sourceFile: "auth.ts" }));
  graph.addSymbol(makeSymbol("LoginHandler", "class", { sourceFile: "auth.ts" }));
  graph.addSymbol(makeSymbol("Database", "class", { sourceFile: "db.ts" }));
  graph.addEdge("AuthService", "LoginHandler", "calls", "EXTRACTED");
  graph.addEdge("AuthService", "Database", "calls", "INFERRED");
  return graph;
}

describe("GraphSerializer", () => {
  describe("toJSON", () => {
    it("should serialize graph to JSON-compatible object", () => {
      const graph = buildSampleGraph();
      const serialized = GraphSerializer.toJSON(graph);

      expect(serialized.nodes).toBeDefined();
      expect(serialized.edges).toBeDefined();
      expect(serialized.nodes.length).toBeGreaterThan(0);
      expect(serialized.edges.length).toBeGreaterThan(0);
    });

    it("should include symbol attributes in nodes", () => {
      const graph = buildSampleGraph();
      const serialized = GraphSerializer.toJSON(graph);

      const authNode = serialized.nodes.find(n => n.name === "AuthService");
      expect(authNode).toBeDefined();
      expect(authNode!.kind).toBe("class");
      expect(authNode!.sourceFile).toBe("auth.ts");
    });

    it("should include confidence in edges", () => {
      const graph = buildSampleGraph();
      const serialized = GraphSerializer.toJSON(graph);

      const inferredEdge = serialized.edges.find(e => e.confidence === "INFERRED");
      expect(inferredEdge).toBeDefined();
      expect(inferredEdge!.source).toBe("AuthService");
      expect(inferredEdge!.target).toBe("Database");
    });

    it("should serialize empty graph", () => {
      const graph = new SymbolGraph();
      const serialized = GraphSerializer.toJSON(graph);
      expect(serialized.nodes).toEqual([]);
      expect(serialized.edges).toEqual([]);
    });
  });

  describe("toJSONString / fromJSON", () => {
    it("should round-trip through JSON string", () => {
      const original = buildSampleGraph();
      const json = GraphSerializer.toJSONString(original);

      expect(typeof json).toBe("string");

      const restored = GraphSerializer.fromJSON(json);
      expect(restored.hasSymbol("AuthService")).toBe(true);
      expect(restored.hasSymbol("LoginHandler")).toBe(true);
      expect(restored.hasSymbol("Database")).toBe(true);
      expect(restored.hasEdge("AuthService", "LoginHandler", "calls")).toBe(true);
      expect(restored.hasEdge("AuthService", "Database", "calls")).toBe(true);
    });

    it("should preserve confidence through round-trip", () => {
      const original = buildSampleGraph();
      const json = GraphSerializer.toJSONString(original);
      const restored = GraphSerializer.fromJSON(json);

      const edges = restored.getEdges("AuthService", "Database");
      expect(edges).toHaveLength(1);
      expect(edges[0].confidence).toBe("INFERRED");
    });

    it("should preserve symbol attributes through round-trip", () => {
      const original = buildSampleGraph();
      const json = GraphSerializer.toJSONString(original);
      const restored = GraphSerializer.fromJSON(json);

      const auth = restored.getSymbol("AuthService");
      expect(auth).not.toBeNull();
      expect(auth!.kind).toBe("class");
      expect(auth!.sourceFile).toBe("auth.ts");
    });

    it("should preserve file nodes through round-trip", () => {
      const original = buildSampleGraph();
      const json = GraphSerializer.toJSONString(original);
      const restored = GraphSerializer.fromJSON(json);

      expect(restored.hasSymbol("file:auth.ts")).toBe(true);
      expect(restored.hasSymbol("file:db.ts")).toBe(true);
    });

    it("should preserve stats through round-trip", () => {
      const original = buildSampleGraph();
      const origStats = original.stats();
      const json = GraphSerializer.toJSONString(original);
      const restored = GraphSerializer.fromJSON(json);

      expect(restored.stats()).toEqual(origStats);
    });
  });
});

describe("GraphDiff", () => {
  it("should detect new nodes", () => {
    const g1 = new SymbolGraph();
    g1.addSymbol(makeSymbol("a", "function"));

    const g2 = new SymbolGraph();
    g2.addSymbol(makeSymbol("a", "function"));
    g2.addSymbol(makeSymbol("b", "function"));

    const diff = GraphDiff.diff(g1, g2);
    expect(diff.newNodes).toHaveLength(1);
    expect(diff.newNodes[0]).toBe("b");
  });

  it("should detect removed nodes", () => {
    const g1 = new SymbolGraph();
    g1.addSymbol(makeSymbol("a", "function"));
    g1.addSymbol(makeSymbol("b", "function"));

    const g2 = new SymbolGraph();
    g2.addSymbol(makeSymbol("a", "function"));

    const diff = GraphDiff.diff(g1, g2);
    expect(diff.removedNodes).toHaveLength(1);
    expect(diff.removedNodes[0]).toBe("b");
  });

  it("should detect new edges", () => {
    const g1 = new SymbolGraph();
    g1.addSymbol(makeSymbol("a", "function"));
    g1.addSymbol(makeSymbol("b", "function"));

    const g2 = new SymbolGraph();
    g2.addSymbol(makeSymbol("a", "function"));
    g2.addSymbol(makeSymbol("b", "function"));
    g2.addEdge("a", "b", "calls", "EXTRACTED");

    const diff = GraphDiff.diff(g1, g2);
    expect(diff.newEdges).toHaveLength(1);
    expect(diff.newEdges[0].source).toBe("a");
    expect(diff.newEdges[0].target).toBe("b");
  });

  it("should detect removed edges", () => {
    const g1 = new SymbolGraph();
    g1.addSymbol(makeSymbol("a", "function"));
    g1.addSymbol(makeSymbol("b", "function"));
    g1.addEdge("a", "b", "calls", "EXTRACTED");

    const g2 = new SymbolGraph();
    g2.addSymbol(makeSymbol("a", "function"));
    g2.addSymbol(makeSymbol("b", "function"));

    const diff = GraphDiff.diff(g1, g2);
    expect(diff.removedEdges).toHaveLength(1);
  });

  it("should produce summary string", () => {
    const g1 = new SymbolGraph();
    g1.addSymbol(makeSymbol("a", "function"));

    const g2 = new SymbolGraph();
    g2.addSymbol(makeSymbol("a", "function"));
    g2.addSymbol(makeSymbol("b", "function"));
    g2.addSymbol(makeSymbol("c", "function"));
    g2.addEdge("a", "b", "calls", "EXTRACTED");

    const diff = GraphDiff.diff(g1, g2);
    expect(diff.summary).toContain("2 new nodes");
    expect(diff.summary).toContain("1 new edge");
  });

  it("should report no changes for identical graphs", () => {
    const g1 = new SymbolGraph();
    g1.addSymbol(makeSymbol("a", "function"));
    g1.addSymbol(makeSymbol("b", "function"));
    g1.addEdge("a", "b", "calls", "EXTRACTED");

    const g2 = new SymbolGraph();
    g2.addSymbol(makeSymbol("a", "function"));
    g2.addSymbol(makeSymbol("b", "function"));
    g2.addEdge("a", "b", "calls", "EXTRACTED");

    const diff = GraphDiff.diff(g1, g2);
    expect(diff.newNodes).toEqual([]);
    expect(diff.removedNodes).toEqual([]);
    expect(diff.newEdges).toEqual([]);
    expect(diff.removedEdges).toEqual([]);
    expect(diff.summary).toBe("no changes");
  });
});
