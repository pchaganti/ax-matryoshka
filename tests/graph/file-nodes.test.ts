import { describe, it, expect, beforeEach } from "vitest";
import { SymbolGraph } from "../../src/graph/symbol-graph.js";
import type { Symbol } from "../../src/treesitter/types.js";

function makeSymbol(name: string, kind: Symbol["kind"], opts?: Partial<Symbol>): Symbol {
  return {
    name, kind,
    startLine: opts?.startLine ?? 1,
    endLine: opts?.endLine ?? 10,
    startCol: opts?.startCol ?? 0,
    endCol: opts?.endCol ?? 0,
    id: opts?.id,
    parentSymbolId: opts?.parentSymbolId,
    sourceFile: opts?.sourceFile,
  };
}

describe("File-level nodes", () => {
  let graph: SymbolGraph;

  beforeEach(() => {
    graph = new SymbolGraph();
  });

  describe("addFileNode", () => {
    it("should add a file node to the graph", () => {
      graph.addFileNode("src/index.ts");
      expect(graph.hasSymbol("file:src/index.ts")).toBe(true);
    });

    it("should store the file path as a symbol attribute", () => {
      graph.addFileNode("src/utils.ts");
      const sym = graph.getSymbol("file:src/utils.ts");
      expect(sym).not.toBeNull();
      expect(sym!.kind).toBe("file");
      expect(sym!.name).toBe("file:src/utils.ts");
    });
  });

  describe("addSymbol with sourceFile + auto contains edge", () => {
    it("should auto-create file node and contains edge when sourceFile is provided", () => {
      const sym = makeSymbol("myFunc", "function", { sourceFile: "src/funcs.ts" });
      graph.addSymbol(sym);

      expect(graph.hasSymbol("file:src/funcs.ts")).toBe(true);
      const edges = graph.getEdges("file:src/funcs.ts", "myFunc");
      expect(edges).toHaveLength(1);
      expect(edges[0].relation).toBe("contains");
      expect(edges[0].confidence).toBe("EXTRACTED");
    });

    it("should not create duplicate file nodes for symbols from same file", () => {
      graph.addSymbol(makeSymbol("fn1", "function", { sourceFile: "mod.ts" }));
      graph.addSymbol(makeSymbol("fn2", "function", { sourceFile: "mod.ts" }));

      expect(graph.hasSymbol("file:mod.ts")).toBe(true);
      const edges = graph.edgeAttributes().filter(e => e.relation === "contains");
      expect(edges).toHaveLength(2);
    });

    it("should not create file node when sourceFile is undefined", () => {
      const sym = makeSymbol("standalone", "function");
      graph.addSymbol(sym);
      const allNames = graph.allSymbols().map(s => s.name);
      expect(allNames).not.toContainEqual(expect.stringMatching(/^file:/));
    });
  });

  describe("fileSymbols", () => {
    it("should return all symbols contained in a file", () => {
      graph.addFileNode("src/a.ts");
      graph.addSymbol(makeSymbol("foo", "function", { sourceFile: "src/a.ts" }));
      graph.addSymbol(makeSymbol("bar", "class", { sourceFile: "src/a.ts" }));
      graph.addSymbol(makeSymbol("baz", "function", { sourceFile: "src/b.ts" }));

      const syms = graph.fileSymbols("src/a.ts");
      const names = syms.map(s => s.name).sort();
      expect(names).toEqual(["bar", "foo"]);
    });

    it("should return empty for a file with no symbols", () => {
      graph.addFileNode("empty.ts");
      expect(graph.fileSymbols("empty.ts")).toEqual([]);
    });

    it("should return empty for a non-existent file", () => {
      expect(graph.fileSymbols("nope.ts")).toEqual([]);
    });
  });

  describe("integration with existing graph queries", () => {
    it("should not interfere with callers/callees queries", () => {
      graph.addSymbol(makeSymbol("fn1", "function", { sourceFile: "a.ts" }));
      graph.addSymbol(makeSymbol("fn2", "function", { sourceFile: "a.ts" }));
      graph.addEdge("fn1", "fn2", "calls");

      expect(graph.callers("fn2").map(s => s.name)).toEqual(["fn1"]);
      expect(graph.callees("fn1").map(s => s.name)).toEqual(["fn2"]);
    });
  });
});
