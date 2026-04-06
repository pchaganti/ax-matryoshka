import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { solve, type SolverTools, type Bindings } from "../../src/logic/lc-solver.js";
import { parse } from "../../src/logic/lc-parser.js";
import { SessionDB } from "../../src/persistence/session-db.js";
import { SymbolGraph } from "../../src/graph/symbol-graph.js";
import type { Symbol } from "../../src/treesitter/types.js";

describe("LC Solver - Graph Commands", () => {
  let db: SessionDB;
  let graph: SymbolGraph;
  let tools: SolverTools;
  let bindings: Bindings;

  const sampleCode = `
class Animal {
  speak(): void {}
}

class Dog extends Animal {
  bark(): void {
    this.speak();
  }
}

class Puppy extends Dog {
  whimper(): void {}
}

interface IRepo {
  save(): void;
}

class SqlRepo implements IRepo {
  save(): void {}
}

class MockRepo implements IRepo {
  save(): void {}
}

function initDb(config: Config): Database {
  return new Database(config);
}

function startServer(db: Database): void {
  const handler = createHandler(db);
  listen(handler);
}

function createHandler(db: Database): Handler {
  return new Handler(db);
}
`.trim();

  beforeEach(() => {
    db = new SessionDB();
    db.loadDocument(sampleCode);
    graph = new SymbolGraph();

    // Store symbols
    const symbols: Array<Omit<Symbol, "id"> & { id: number }> = [
      { id: 1, name: "Animal", kind: "class", startLine: 1, endLine: 3, startCol: 0, endCol: 0 },
      { id: 2, name: "speak", kind: "method", startLine: 2, endLine: 2, startCol: 2, endCol: 0, parentSymbolId: 1 },
      { id: 3, name: "Dog", kind: "class", startLine: 5, endLine: 9, startCol: 0, endCol: 0 },
      { id: 4, name: "bark", kind: "method", startLine: 6, endLine: 8, startCol: 2, endCol: 0, parentSymbolId: 3 },
      { id: 5, name: "Puppy", kind: "class", startLine: 11, endLine: 13, startCol: 0, endCol: 0 },
      { id: 6, name: "whimper", kind: "method", startLine: 12, endLine: 12, startCol: 2, endCol: 0, parentSymbolId: 5 },
      { id: 7, name: "IRepo", kind: "interface", startLine: 15, endLine: 17, startCol: 0, endCol: 0 },
      { id: 8, name: "SqlRepo", kind: "class", startLine: 19, endLine: 21, startCol: 0, endCol: 0 },
      { id: 9, name: "MockRepo", kind: "class", startLine: 23, endLine: 25, startCol: 0, endCol: 0 },
      { id: 10, name: "initDb", kind: "function", startLine: 27, endLine: 29, startCol: 0, endCol: 0 },
      { id: 11, name: "startServer", kind: "function", startLine: 31, endLine: 34, startCol: 0, endCol: 0 },
      { id: 12, name: "createHandler", kind: "function", startLine: 36, endLine: 38, startCol: 0, endCol: 0 },
    ];

    for (const sym of symbols) {
      db.storeSymbol(sym);
      graph.addSymbol(sym as Symbol);
    }

    // Build graph edges
    graph.addEdge("Dog", "Animal", "extends");
    graph.addEdge("Puppy", "Dog", "extends");
    graph.addEdge("SqlRepo", "IRepo", "implements");
    graph.addEdge("MockRepo", "IRepo", "implements");
    graph.addEdge("bark", "speak", "calls");
    graph.addEdge("startServer", "createHandler", "calls");
    graph.addEdge("startServer", "initDb", "calls");

    tools = {
      grep: (pattern: string) => {
        const regex = new RegExp(pattern, "gi");
        const lines = sampleCode.split("\n");
        const results: Array<{ match: string; line: string; lineNum: number; index: number; groups: string[] }> = [];
        lines.forEach((line, i) => {
          const match = line.match(regex);
          if (match) {
            results.push({ match: match[0], line, lineNum: i + 1, index: line.indexOf(match[0]), groups: match.slice(1) });
          }
        });
        return results;
      },
      fuzzy_search: () => [],
      bm25: () => [],
      semantic: () => [],
      text_stats: () => ({
        length: sampleCode.length,
        lineCount: sampleCode.split("\n").length,
        sample: { start: "", middle: "", end: "" },
      }),
      context: sampleCode,
    };

    bindings = new Map();
    bindings.set("_sessionDB", db);
    bindings.set("_symbolGraph", graph);
  });

  afterEach(() => {
    db.close();
  });

  describe("callers", () => {
    it("should return callers of a symbol", () => {
      const result = parse('(callers "speak")');
      expect(result.success).toBe(true);
      const solved = solve(result.term!, tools, bindings);
      expect(solved.success).toBe(true);
      const callers = solved.value as Symbol[];
      expect(callers).toHaveLength(1);
      expect(callers[0].name).toBe("bark");
    });

    it("should return empty array for uncalled symbol", () => {
      const result = parse('(callers "whimper")');
      const solved = solve(result.term!, tools, bindings);
      expect(solved.success).toBe(true);
      expect(solved.value).toEqual([]);
    });

    it("should error when no graph is available", () => {
      bindings.delete("_symbolGraph");
      const result = parse('(callers "speak")');
      const solved = solve(result.term!, tools, bindings);
      expect(solved.success).toBe(false);
      expect(solved.error).toMatch(/graph/i);
    });
  });

  describe("callees", () => {
    it("should return callees of a symbol", () => {
      const result = parse('(callees "startServer")');
      const solved = solve(result.term!, tools, bindings);
      expect(solved.success).toBe(true);
      const callees = solved.value as Symbol[];
      expect(callees.map((s) => s.name).sort()).toEqual(["createHandler", "initDb"]);
    });
  });

  describe("ancestors", () => {
    it("should return ancestor chain", () => {
      const result = parse('(ancestors "Puppy")');
      const solved = solve(result.term!, tools, bindings);
      expect(solved.success).toBe(true);
      const ancestors = solved.value as Symbol[];
      expect(ancestors.map((s) => s.name)).toEqual(["Dog", "Animal"]);
    });

    it("should return empty for root class", () => {
      const result = parse('(ancestors "Animal")');
      const solved = solve(result.term!, tools, bindings);
      expect(solved.success).toBe(true);
      expect(solved.value).toEqual([]);
    });
  });

  describe("descendants", () => {
    it("should return all descendants", () => {
      const result = parse('(descendants "Animal")');
      const solved = solve(result.term!, tools, bindings);
      expect(solved.success).toBe(true);
      const desc = solved.value as Symbol[];
      expect(desc.map((s) => s.name).sort()).toEqual(["Dog", "Puppy"]);
    });
  });

  describe("implementations", () => {
    it("should return all implementations of an interface", () => {
      const result = parse('(implementations "IRepo")');
      const solved = solve(result.term!, tools, bindings);
      expect(solved.success).toBe(true);
      const impls = solved.value as Symbol[];
      expect(impls.map((s) => s.name).sort()).toEqual(["MockRepo", "SqlRepo"]);
    });
  });

  describe("dependents", () => {
    it("should return transitive dependents", () => {
      const result = parse('(dependents "createHandler")');
      const solved = solve(result.term!, tools, bindings);
      expect(solved.success).toBe(true);
      const deps = solved.value as Symbol[];
      expect(deps.map((s) => s.name)).toEqual(["startServer"]);
    });

    it("should respect depth limit", () => {
      // initDb is called by startServer only
      const result = parse('(dependents "initDb" 1)');
      const solved = solve(result.term!, tools, bindings);
      expect(solved.success).toBe(true);
      const deps = solved.value as Symbol[];
      expect(deps.map((s) => s.name)).toEqual(["startServer"]);
    });
  });

  describe("symbol_graph", () => {
    it("should return neighborhood subgraph", () => {
      const result = parse('(symbol_graph "Dog" 1)');
      const solved = solve(result.term!, tools, bindings);
      expect(solved.success).toBe(true);
      const hood = solved.value as { nodes: Symbol[]; edges: Array<{ source: string; target: string; relation: string }> };
      const names = hood.nodes.map((s) => s.name).sort();
      // Dog + Animal (extends target) + Puppy (extends Dog) + bark (child method)
      expect(names).toContain("Dog");
      expect(names).toContain("Animal");
      expect(names).toContain("Puppy");
    });

    it("should use default depth of 1 when not specified", () => {
      const result = parse('(symbol_graph "Dog")');
      const solved = solve(result.term!, tools, bindings);
      expect(solved.success).toBe(true);
      const hood = solved.value as { nodes: Symbol[]; edges: any[] };
      expect(hood.nodes.length).toBeGreaterThanOrEqual(2);
    });
  });

  describe("composition with existing operations", () => {
    it("should count callers", () => {
      const result = parse('(count (callers "speak"))');
      const solved = solve(result.term!, tools, bindings);
      expect(solved.success).toBe(true);
      expect(solved.value).toBe(1);
    });

    it("should filter callees", () => {
      const result = parse('(count (callees "startServer"))');
      const solved = solve(result.term!, tools, bindings);
      expect(solved.success).toBe(true);
      expect(solved.value).toBe(2);
    });
  });
});
