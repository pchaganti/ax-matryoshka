import { describe, it, expect, beforeEach } from "vitest";
import { SymbolGraph, EdgeRelation } from "../../src/graph/symbol-graph.js";
import type { Symbol } from "../../src/treesitter/types.js";

function makeSymbol(name: string, kind: Symbol["kind"], opts?: Partial<Symbol>): Symbol {
  return {
    name,
    kind,
    startLine: opts?.startLine ?? 1,
    endLine: opts?.endLine ?? 10,
    startCol: opts?.startCol ?? 0,
    endCol: opts?.endCol ?? 0,
    id: opts?.id,
    parentSymbolId: opts?.parentSymbolId,
    signature: opts?.signature,
  };
}

describe("SymbolGraph", () => {
  let graph: SymbolGraph;

  beforeEach(() => {
    graph = new SymbolGraph();
  });

  describe("node management", () => {
    it("should add a symbol as a node", () => {
      const sym = makeSymbol("myFunc", "function");
      graph.addSymbol(sym);
      expect(graph.hasSymbol("myFunc")).toBe(true);
    });

    it("should retrieve symbol attributes from a node", () => {
      const sym = makeSymbol("myFunc", "function", { startLine: 5, endLine: 15 });
      graph.addSymbol(sym);
      const attrs = graph.getSymbol("myFunc");
      expect(attrs).not.toBeNull();
      expect(attrs!.kind).toBe("function");
      expect(attrs!.startLine).toBe(5);
    });

    it("should return null for non-existent symbol", () => {
      expect(graph.getSymbol("nope")).toBeNull();
    });

    it("should list all symbols", () => {
      graph.addSymbol(makeSymbol("a", "function"));
      graph.addSymbol(makeSymbol("b", "class"));
      graph.addSymbol(makeSymbol("c", "method"));
      expect(graph.allSymbols()).toHaveLength(3);
    });

    it("should handle duplicate symbol names by updating attributes", () => {
      graph.addSymbol(makeSymbol("myFunc", "function", { startLine: 1 }));
      graph.addSymbol(makeSymbol("myFunc", "function", { startLine: 99 }));
      expect(graph.allSymbols()).toHaveLength(1);
      expect(graph.getSymbol("myFunc")!.startLine).toBe(99);
    });
  });

  describe("edge management", () => {
    beforeEach(() => {
      graph.addSymbol(makeSymbol("caller", "function"));
      graph.addSymbol(makeSymbol("callee", "function"));
    });

    it("should add a directed edge between symbols", () => {
      graph.addEdge("caller", "callee", "calls");
      expect(graph.hasEdge("caller", "callee", "calls")).toBe(true);
    });

    it("should not have reverse edge", () => {
      graph.addEdge("caller", "callee", "calls");
      expect(graph.hasEdge("callee", "caller", "calls")).toBe(false);
    });

    it("should support multiple edge types between same nodes", () => {
      graph.addEdge("caller", "callee", "calls");
      graph.addEdge("caller", "callee", "imports");
      expect(graph.hasEdge("caller", "callee", "calls")).toBe(true);
      expect(graph.hasEdge("caller", "callee", "imports")).toBe(true);
    });

    it("should ignore edges to non-existent nodes", () => {
      graph.addEdge("caller", "ghost", "calls");
      expect(graph.hasEdge("caller", "ghost", "calls")).toBe(false);
    });
  });

  describe("callers (incoming 'calls' edges)", () => {
    beforeEach(() => {
      graph.addSymbol(makeSymbol("main", "function"));
      graph.addSymbol(makeSymbol("helper", "function"));
      graph.addSymbol(makeSymbol("util", "function"));
      graph.addEdge("main", "helper", "calls");
      graph.addEdge("util", "helper", "calls");
    });

    it("should return all callers of a symbol", () => {
      const callers = graph.callers("helper");
      expect(callers.map((s) => s.name).sort()).toEqual(["main", "util"]);
    });

    it("should return empty array for symbol with no callers", () => {
      expect(graph.callers("main")).toEqual([]);
    });

    it("should return empty array for non-existent symbol", () => {
      expect(graph.callers("ghost")).toEqual([]);
    });
  });

  describe("callees (outgoing 'calls' edges)", () => {
    beforeEach(() => {
      graph.addSymbol(makeSymbol("main", "function"));
      graph.addSymbol(makeSymbol("a", "function"));
      graph.addSymbol(makeSymbol("b", "function"));
      graph.addEdge("main", "a", "calls");
      graph.addEdge("main", "b", "calls");
    });

    it("should return all callees of a symbol", () => {
      const callees = graph.callees("main");
      expect(callees.map((s) => s.name).sort()).toEqual(["a", "b"]);
    });

    it("should return empty array for leaf symbol", () => {
      expect(graph.callees("a")).toEqual([]);
    });
  });

  describe("ancestors (transitive 'extends' chain)", () => {
    beforeEach(() => {
      graph.addSymbol(makeSymbol("Animal", "class"));
      graph.addSymbol(makeSymbol("Dog", "class"));
      graph.addSymbol(makeSymbol("Puppy", "class"));
      graph.addEdge("Dog", "Animal", "extends");
      graph.addEdge("Puppy", "Dog", "extends");
    });

    it("should return direct parent", () => {
      const ancestors = graph.ancestors("Dog");
      expect(ancestors.map((s) => s.name)).toEqual(["Animal"]);
    });

    it("should return full ancestor chain", () => {
      const ancestors = graph.ancestors("Puppy");
      expect(ancestors.map((s) => s.name)).toEqual(["Dog", "Animal"]);
    });

    it("should return empty for root class", () => {
      expect(graph.ancestors("Animal")).toEqual([]);
    });

    it("should handle cycles without infinite loop", () => {
      // Pathological case: A extends B extends A
      graph.addSymbol(makeSymbol("X", "class"));
      graph.addSymbol(makeSymbol("Y", "class"));
      graph.addEdge("X", "Y", "extends");
      graph.addEdge("Y", "X", "extends");
      const result = graph.ancestors("X");
      // Should terminate and return Y (and maybe X once, but not loop)
      expect(result.length).toBeLessThanOrEqual(2);
    });
  });

  describe("descendants (transitive reverse 'extends')", () => {
    beforeEach(() => {
      graph.addSymbol(makeSymbol("Animal", "class"));
      graph.addSymbol(makeSymbol("Dog", "class"));
      graph.addSymbol(makeSymbol("Cat", "class"));
      graph.addSymbol(makeSymbol("Puppy", "class"));
      graph.addEdge("Dog", "Animal", "extends");
      graph.addEdge("Cat", "Animal", "extends");
      graph.addEdge("Puppy", "Dog", "extends");
    });

    it("should return all descendants of a class", () => {
      const desc = graph.descendants("Animal");
      const names = desc.map((s) => s.name).sort();
      expect(names).toEqual(["Cat", "Dog", "Puppy"]);
    });

    it("should return empty for leaf class", () => {
      expect(graph.descendants("Puppy")).toEqual([]);
    });
  });

  describe("implementations ('implements' edges)", () => {
    beforeEach(() => {
      graph.addSymbol(makeSymbol("IRepo", "interface"));
      graph.addSymbol(makeSymbol("SqlRepo", "class"));
      graph.addSymbol(makeSymbol("MockRepo", "class"));
      graph.addEdge("SqlRepo", "IRepo", "implements");
      graph.addEdge("MockRepo", "IRepo", "implements");
    });

    it("should find all implementations of an interface", () => {
      const impls = graph.implementations("IRepo");
      expect(impls.map((s) => s.name).sort()).toEqual(["MockRepo", "SqlRepo"]);
    });

    it("should return empty for class (not an interface)", () => {
      expect(graph.implementations("SqlRepo")).toEqual([]);
    });
  });

  describe("dependents (transitive outgoing edges of any type)", () => {
    beforeEach(() => {
      graph.addSymbol(makeSymbol("config", "variable"));
      graph.addSymbol(makeSymbol("db", "class"));
      graph.addSymbol(makeSymbol("api", "function"));
      graph.addSymbol(makeSymbol("handler", "function"));
      graph.addEdge("db", "config", "imports");
      graph.addEdge("api", "db", "calls");
      graph.addEdge("handler", "api", "calls");
    });

    it("should find all transitive dependents of a symbol", () => {
      const deps = graph.dependents("config");
      const names = deps.map((s) => s.name).sort();
      expect(names).toEqual(["api", "db", "handler"]);
    });

    it("should return only direct dependents when depth=1", () => {
      const deps = graph.dependents("config", 1);
      expect(deps.map((s) => s.name)).toEqual(["db"]);
    });
  });

  describe("neighborhood (subgraph around a symbol)", () => {
    beforeEach(() => {
      graph.addSymbol(makeSymbol("a", "function"));
      graph.addSymbol(makeSymbol("b", "function"));
      graph.addSymbol(makeSymbol("c", "function"));
      graph.addSymbol(makeSymbol("d", "function"));
      graph.addSymbol(makeSymbol("e", "function"));
      graph.addEdge("a", "b", "calls");
      graph.addEdge("b", "c", "calls");
      graph.addEdge("c", "d", "calls");
      graph.addEdge("d", "e", "calls");
    });

    it("should return neighborhood within depth", () => {
      const hood = graph.neighborhood("b", 1);
      const names = hood.nodes.map((s) => s.name).sort();
      // b + its direct neighbors (a calls b, b calls c)
      expect(names).toEqual(["a", "b", "c"]);
    });

    it("should return edges in the neighborhood", () => {
      const hood = graph.neighborhood("b", 1);
      expect(hood.edges.length).toBeGreaterThanOrEqual(2);
      expect(hood.edges).toContainEqual({ source: "a", target: "b", relation: "calls" });
      expect(hood.edges).toContainEqual({ source: "b", target: "c", relation: "calls" });
    });

    it("should expand neighborhood with larger depth", () => {
      const hood = graph.neighborhood("b", 2);
      const names = hood.nodes.map((s) => s.name).sort();
      expect(names).toEqual(["a", "b", "c", "d"]);
    });
  });

  describe("clear", () => {
    it("should clear all nodes and edges", () => {
      graph.addSymbol(makeSymbol("a", "function"));
      graph.addSymbol(makeSymbol("b", "function"));
      graph.addEdge("a", "b", "calls");
      graph.clear();
      expect(graph.allSymbols()).toHaveLength(0);
      expect(graph.hasEdge("a", "b", "calls")).toBe(false);
    });
  });

  describe("stats", () => {
    it("should report node and edge counts", () => {
      graph.addSymbol(makeSymbol("a", "function"));
      graph.addSymbol(makeSymbol("b", "function"));
      graph.addSymbol(makeSymbol("c", "class"));
      graph.addEdge("a", "b", "calls");
      graph.addEdge("c", "a", "extends");
      const stats = graph.stats();
      expect(stats.nodes).toBe(3);
      expect(stats.edges).toBe(2);
    });
  });
});
