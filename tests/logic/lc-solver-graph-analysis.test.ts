import { describe, it, expect, beforeEach } from "vitest";
import { SymbolGraph } from "../../src/graph/symbol-graph.js";
import { GraphCommunityDetector } from "../../src/graph/community-detector.js";
import { solve, type SolverTools, type Bindings } from "../../src/logic/lc-solver.js";
import { parse } from "../../src/logic/lc-parser.js";
import type { Symbol } from "../../src/treesitter/types.js";

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

function setupGraph() {
  const graph = new SymbolGraph();
  for (const sym of symbols) {
    graph.addSymbol(sym);
  }

  graph.addEdge("Logger", "EventEmitter", "extends");
  graph.addEdge("AppLogger", "Logger", "extends");
  graph.addEdge("MetricsPlugin", "Plugin", "implements");
  graph.addEdge("log", "emit", "calls");
  graph.addEdge("info", "log", "calls");
  graph.addEdge("warn", "log", "calls");
  graph.addEdge("install", "info", "calls");
  graph.addEdge("bootstrap", "install", "calls");

  const detector = new GraphCommunityDetector(graph);
  const communityMap = detector.detect();

  const bindings: Bindings = new Map();
  bindings.set("_symbolGraph", graph);
  bindings.set("_communityMap", communityMap);

  const tools: SolverTools = {
    grep: () => [],
    fuzzy_search: () => [],
    bm25: () => [],
    semantic: () => [],
    text_stats: () => ({ length: 0, lineCount: 0, sample: { start: "", middle: "", end: "" } }),
    context: "",
    lines: [],
  };

  return { graph, bindings, tools, communityMap };
}

async function query(cmd: string, bindings: Bindings, tools: SolverTools) {
  const parsed = parse(cmd);
  expect(parsed.success).toBe(true);
  const result = await solve(parsed.term!, tools, bindings);
  if (result.success && Array.isArray(result.value)) {
    bindings.set("RESULTS", result.value);
  }
  return result;
}

describe("Graph Analysis Nucleus Commands", () => {
  let bindings: Bindings;
  let tools: SolverTools;

  beforeEach(() => {
    const setup = setupGraph();
    bindings = setup.bindings;
    tools = setup.tools;
  });

  describe("communities", () => {
    it("should return all communities with cohesion scores", async () => {
      const result = await query("(communities)", bindings, tools);
      expect(result.success).toBe(true);
      const communities = result.value as Array<{ id: number; nodes: string[]; cohesion: number }>;
      expect(communities.length).toBeGreaterThanOrEqual(1);
      for (const c of communities) {
        expect(c.id).toBeDefined();
        expect(c.nodes.length).toBeGreaterThan(0);
        expect(typeof c.cohesion).toBe("number");
      }
    });
  });

  describe("community_of", () => {
    it("should return the community for a specific node", async () => {
      const result = await query('(community_of "Logger")', bindings, tools);
      expect(result.success).toBe(true);
      const comm = result.value as { id: number; nodes: string[]; cohesion: number };
      expect(comm.id).toBeDefined();
      expect(comm.nodes).toContain("Logger");
    });

    it("should return error for non-existent node", async () => {
      const result = await query('(community_of "ghost")', bindings, tools);
      expect(result.success).toBe(false);
    });
  });

  describe("god_nodes", () => {
    it("should return top-degree nodes with default limit", async () => {
      const result = await query("(god_nodes)", bindings, tools);
      expect(result.success).toBe(true);
      const gods = result.value as Array<{ name: string; degree: number }>;
      expect(gods.length).toBeGreaterThan(0);
      expect(gods.length).toBeLessThanOrEqual(10);
      for (const g of gods) {
        expect(g.name).toBeDefined();
        expect(g.degree).toBeGreaterThan(0);
      }
    });

    it("should respect topN parameter", async () => {
      const result = await query("(god_nodes 3)", bindings, tools);
      expect(result.success).toBe(true);
      const gods = result.value as Array<{ name: string; degree: number }>;
      expect(gods.length).toBeLessThanOrEqual(3);
    });
  });

  describe("surprising_connections", () => {
    it("should return cross-community or inferred edges", async () => {
      const result = await query("(surprising_connections)", bindings, tools);
      expect(result.success).toBe(true);
      const surprises = result.value as Array<{ source: string; target: string; relation: string; confidence: string; score: number; why: string }>;
      for (const s of surprises) {
        expect(s.source).toBeDefined();
        expect(s.target).toBeDefined();
        expect(s.why).toBeDefined();
      }
    });

    it("should respect topN parameter", async () => {
      const result = await query("(surprising_connections 2)", bindings, tools);
      expect(result.success).toBe(true);
      const surprises = result.value as any[];
      expect(surprises.length).toBeLessThanOrEqual(2);
    });
  });

  describe("bridge_nodes", () => {
    it("should return nodes connecting different communities", async () => {
      const result = await query("(bridge_nodes)", bindings, tools);
      expect(result.success).toBe(true);
      const bridges = result.value as Array<{ name: string; degree: number; communityReach: number }>;
      for (const b of bridges) {
        expect(b.name).toBeDefined();
        expect(b.communityReach).toBeGreaterThanOrEqual(1);
      }
    });
  });

  describe("suggest_questions", () => {
    it("should generate questions based on graph structure", async () => {
      const result = await query("(suggest_questions)", bindings, tools);
      expect(result.success).toBe(true);
      const questions = result.value as Array<{ type: string; question: string; why: string }>;
      expect(questions.length).toBeGreaterThan(0);
      for (const q of questions) {
        expect(q.type).toBeDefined();
        expect(q.question).toBeDefined();
        expect(q.why).toBeDefined();
      }
    });
  });

  describe("graph_report", () => {
    it("should return full analysis report", async () => {
      const result = await query("(graph_report)", bindings, tools);
      expect(result.success).toBe(true);
      const report = result.value as any;
      expect(report.godNodes).toBeDefined();
      expect(report.surprisingConnections).toBeDefined();
      expect(report.bridgeNodes).toBeDefined();
      expect(report.questions).toBeDefined();
      expect(report.communities).toBeDefined();
      expect(Array.isArray(report.godNodes)).toBe(true);
      expect(Array.isArray(report.communities)).toBe(true);
    });
  });
});
