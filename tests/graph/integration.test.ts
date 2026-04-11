import { describe, it, expect } from "vitest";
import { SymbolGraph } from "../../src/graph/symbol-graph.js";
import { RelationshipAnalyzer } from "../../src/graph/relationship-analyzer.js";
import { solve, type SolverTools, type Bindings } from "../../src/logic/lc-solver.js";
import { parse } from "../../src/logic/lc-parser.js";
import { SessionDB } from "../../src/persistence/session-db.js";
import type { Symbol } from "../../src/treesitter/types.js";

/**
 * Integration test: full pipeline from code → symbols → graph → Nucleus queries
 */
describe("Knowledge Graph Integration", () => {
  const code = `
class EventEmitter {
  emit(event: string): void {}
  on(event: string, handler: Function): void {}
}

class Logger extends EventEmitter {
  log(msg: string): void {
    this.emit("log");
  }
}

class AppLogger extends Logger {
  info(msg: string): void {
    this.log(msg);
  }
  warn(msg: string): void {
    this.log(msg);
  }
}

interface Plugin {
  install(): void;
}

class MetricsPlugin implements Plugin {
  install(): void {
    const logger = new AppLogger();
    logger.info("metrics installed");
  }
}

function bootstrap(): void {
  const plugin = new MetricsPlugin();
  plugin.install();
}
`.trim();

  // Simulate what tree-sitter would extract
  const symbols: Symbol[] = [
    { id: 1, name: "EventEmitter", kind: "class", startLine: 1, endLine: 4, startCol: 0, endCol: 0 },
    { id: 2, name: "emit", kind: "method", startLine: 2, endLine: 2, startCol: 2, endCol: 0, parentSymbolId: 1 },
    { id: 3, name: "on", kind: "method", startLine: 3, endLine: 3, startCol: 2, endCol: 0, parentSymbolId: 1 },
    { id: 4, name: "Logger", kind: "class", startLine: 6, endLine: 10, startCol: 0, endCol: 0 },
    { id: 5, name: "log", kind: "method", startLine: 7, endLine: 9, startCol: 2, endCol: 0, parentSymbolId: 4 },
    { id: 6, name: "AppLogger", kind: "class", startLine: 12, endLine: 20, startCol: 0, endCol: 0 },
    { id: 7, name: "info", kind: "method", startLine: 13, endLine: 15, startCol: 2, endCol: 0, parentSymbolId: 6 },
    { id: 8, name: "warn", kind: "method", startLine: 16, endLine: 18, startCol: 2, endCol: 0, parentSymbolId: 6 },
    { id: 9, name: "Plugin", kind: "interface", startLine: 21, endLine: 23, startCol: 0, endCol: 0 },
    { id: 10, name: "MetricsPlugin", kind: "class", startLine: 25, endLine: 30, startCol: 0, endCol: 0 },
    { id: 11, name: "install", kind: "method", startLine: 26, endLine: 29, startCol: 2, endCol: 0, parentSymbolId: 10 },
    { id: 12, name: "bootstrap", kind: "function", startLine: 32, endLine: 35, startCol: 0, endCol: 0 },
  ];

  let db: SessionDB;
  let graph: SymbolGraph;
  let tools: SolverTools;
  let bindings: Bindings;

  function setup() {
    db = new SessionDB();
    db.loadDocument(code);
    graph = new SymbolGraph();

    for (const sym of symbols) {
      db.storeSymbol(sym);
      graph.addSymbol(sym);
    }

    const analyzer = new RelationshipAnalyzer();
    const edges = analyzer.analyze(symbols, code);
    for (const edge of edges) {
      graph.addEdge(edge.source, edge.target, edge.relation);
    }

    tools = {
      grep: (pattern: string) => {
        const regex = new RegExp(pattern, "gi");
        return code.split("\n").flatMap((line, i) => {
          const match = line.match(regex);
          return match ? [{ match: match[0], line, lineNum: i + 1, index: 0, groups: [] }] : [];
        });
      },
      fuzzy_search: () => [],
      bm25: () => [],
      semantic: () => [],
      text_stats: () => ({ length: code.length, lineCount: code.split("\n").length, sample: { start: "", middle: "", end: "" } }),
      context: code,
      lines: code.split("\n"),
    };

    bindings = new Map();
    bindings.set("_sessionDB", db);
    bindings.set("_symbolGraph", graph);
  }

  function query(cmd: string) {
    const parsed = parse(cmd);
    expect(parsed.success).toBe(true);
    const result = solve(parsed.term!, tools, bindings);
    // Bind arrays for chaining
    if (result.success && Array.isArray(result.value)) {
      bindings.set("RESULTS", result.value);
    }
    return result;
  }

  it("should detect inheritance chain", () => {
    setup();
    const result = query('(ancestors "AppLogger")');
    expect(result.success).toBe(true);
    const names = (result.value as Symbol[]).map((s) => s.name);
    expect(names).toEqual(["Logger", "EventEmitter"]);
  });

  it("should find all descendants of base class", () => {
    setup();
    const result = query('(descendants "EventEmitter")');
    expect(result.success).toBe(true);
    const names = (result.value as Symbol[]).map((s) => s.name).sort();
    expect(names).toEqual(["AppLogger", "Logger"]);
  });

  it("should find interface implementations", () => {
    setup();
    const result = query('(implementations "Plugin")');
    expect(result.success).toBe(true);
    const names = (result.value as Symbol[]).map((s) => s.name);
    expect(names).toEqual(["MetricsPlugin"]);
  });

  it("should detect call graph: info → log → emit", () => {
    setup();

    // info calls log
    let result = query('(callees "info")');
    expect(result.success).toBe(true);
    expect((result.value as Symbol[]).map((s) => s.name)).toContain("log");

    // log calls emit
    result = query('(callees "log")');
    expect(result.success).toBe(true);
    expect((result.value as Symbol[]).map((s) => s.name)).toContain("emit");
  });

  it("should find who calls log", () => {
    setup();
    const result = query('(callers "log")');
    expect(result.success).toBe(true);
    const callers = (result.value as Symbol[]).map((s) => s.name).sort();
    expect(callers).toContain("info");
    expect(callers).toContain("warn");
  });

  it("should compose graph queries with count", () => {
    setup();
    const result = query('(count (callers "log"))');
    expect(result.success).toBe(true);
    expect(result.value).toBe(2); // info and warn
  });

  it("should get neighborhood of a symbol", () => {
    setup();
    const result = query('(symbol_graph "Logger" 1)');
    expect(result.success).toBe(true);
    const hood = result.value as { nodes: Symbol[]; edges: any[] };
    const names = hood.nodes.map((s) => s.name).sort();
    // Logger + EventEmitter (extends) + AppLogger (extends Logger) + log (child method)
    expect(names).toContain("Logger");
    expect(names).toContain("EventEmitter");
    expect(names).toContain("AppLogger");
  });

  it("should report graph stats", () => {
    setup();
    const stats = graph.stats();
    expect(stats.nodes).toBe(12);
    expect(stats.edges).toBeGreaterThanOrEqual(5); // extends, implements, calls
  });
});
