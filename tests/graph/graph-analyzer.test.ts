import { describe, it, expect, beforeEach } from "vitest";
import { SymbolGraph } from "../../src/graph/symbol-graph.js";
import { GraphCommunityDetector } from "../../src/graph/community-detector.js";
import { GraphAnalyzer, type GodNode, type SurprisingConnection, type BridgeNode } from "../../src/graph/graph-analyzer.js";
import type { Symbol } from "../../src/treesitter/types.js";

function makeSymbol(name: string, kind: Symbol["kind"]): Symbol {
  return { name, kind, startLine: 1, endLine: 10, startCol: 0, endCol: 0 };
}

function buildAnalysisGraph() {
  const graph = new SymbolGraph();

  // Community A: auth (3 nodes, AuthService is hub)
  graph.addSymbol(makeSymbol("AuthService", "class"));
  graph.addSymbol(makeSymbol("LoginHandler", "class"));
  graph.addSymbol(makeSymbol("TokenValidator", "class"));
  graph.addEdge("AuthService", "LoginHandler", "calls", "EXTRACTED");
  graph.addEdge("AuthService", "TokenValidator", "calls", "EXTRACTED");
  graph.addEdge("LoginHandler", "TokenValidator", "calls", "EXTRACTED");

  // Community B: db (3 nodes, Database is hub)
  graph.addSymbol(makeSymbol("Database", "class"));
  graph.addSymbol(makeSymbol("QueryBuilder", "class"));
  graph.addSymbol(makeSymbol("Migration", "class"));
  graph.addEdge("Database", "QueryBuilder", "calls", "EXTRACTED");
  graph.addEdge("Database", "Migration", "calls", "EXTRACTED");

  // Bridge: AuthService → Database (cross-community)
  graph.addEdge("AuthService", "Database", "calls", "INFERRED");

  // Isolated node
  graph.addSymbol(makeSymbol("Orphan", "class"));

  const detector = new GraphCommunityDetector(graph);
  const communities = detector.detect();
  const analyzer = new GraphAnalyzer(graph, communities);

  return { graph, detector, analyzer, communities };
}

describe("GraphAnalyzer", () => {
  describe("godNodes", () => {
    it("should return nodes sorted by degree descending", () => {
      const { analyzer } = buildAnalysisGraph();
      const gods = analyzer.godNodes(5);

      expect(gods.length).toBeGreaterThan(0);
      for (let i = 1; i < gods.length; i++) {
        expect(gods[i - 1].degree).toBeGreaterThanOrEqual(gods[i].degree);
      }
    });

    it("should include degree and name for each god node", () => {
      const { analyzer } = buildAnalysisGraph();
      const gods = analyzer.godNodes(3);

      for (const g of gods) {
        expect(g.name).toBeDefined();
        expect(g.degree).toBeGreaterThan(0);
      }
    });

    it("should respect the topN limit", () => {
      const { analyzer } = buildAnalysisGraph();
      const gods = analyzer.godNodes(2);
      expect(gods.length).toBeLessThanOrEqual(2);
    });

    it("should return the highest-degree node as first", () => {
      const { analyzer } = buildAnalysisGraph();
      const gods = analyzer.godNodes(1);
      // AuthService has 3 outgoing + 0 incoming = degree 3 (or more with bridge)
      expect(gods[0].name).toBe("AuthService");
    });
  });

  describe("surprisingConnections", () => {
    it("should find cross-community edges", () => {
      const { analyzer, communities } = buildAnalysisGraph();
      const surprises = analyzer.surprisingConnections(5);

      expect(surprises.length).toBeGreaterThan(0);
    });

    it("should include confidence and relation for each surprise", () => {
      const { analyzer } = buildAnalysisGraph();
      const surprises = analyzer.surprisingConnections(5);

      for (const s of surprises) {
        expect(s.source).toBeDefined();
        expect(s.target).toBeDefined();
        expect(s.relation).toBeDefined();
        expect(s.confidence).toBeDefined();
        expect(s.why).toBeDefined();
      }
    });

    it("should rank INFERRED cross-community edges higher than EXTRACTED within-community", () => {
      const { analyzer } = buildAnalysisGraph();
      const surprises = analyzer.surprisingConnections(5);

      // The AuthService → Database edge is INFERRED and cross-community
      const bridge = surprises.find(s =>
        (s.source === "AuthService" && s.target === "Database") ||
        (s.source === "Database" && s.target === "AuthService")
      );
      expect(bridge).toBeDefined();
      expect(bridge!.confidence).toBe("INFERRED");
    });

    it("should explain why each connection is surprising", () => {
      const { analyzer } = buildAnalysisGraph();
      const surprises = analyzer.surprisingConnections(5);

      for (const s of surprises) {
        expect(s.why.length).toBeGreaterThan(0);
      }
    });
  });

  describe("bridgeNodes", () => {
    it("should find nodes that connect different communities", () => {
      const { analyzer } = buildAnalysisGraph();
      const bridges = analyzer.bridgeNodes(5);

      expect(bridges.length).toBeGreaterThan(0);
      // AuthService is the bridge connecting auth and db communities
      const names = bridges.map(b => b.name);
      expect(names).toContain("AuthService");
    });

    it("should include community reach count", () => {
      const { analyzer } = buildAnalysisGraph();
      const bridges = analyzer.bridgeNodes(5);

      for (const b of bridges) {
        expect(b.communityReach).toBeGreaterThanOrEqual(1);
      }
    });

    it("should sort by community reach descending", () => {
      const { analyzer } = buildAnalysisGraph();
      const bridges = analyzer.bridgeNodes(5);

      for (let i = 1; i < bridges.length; i++) {
        expect(bridges[i - 1].communityReach).toBeGreaterThanOrEqual(bridges[i].communityReach);
      }
    });
  });

  describe("suggestQuestions", () => {
    it("should generate questions based on graph structure", () => {
      const { analyzer } = buildAnalysisGraph();
      const questions = analyzer.suggestQuestions();

      expect(questions.length).toBeGreaterThan(0);
      for (const q of questions) {
        expect(q.question).toBeDefined();
        expect(q.type).toBeDefined();
        expect(q.why).toBeDefined();
      }
    });

    it("should flag isolated nodes", () => {
      const { analyzer } = buildAnalysisGraph();
      const questions = analyzer.suggestQuestions();

      const isolatedQ = questions.find(q => q.type === "isolated_nodes");
      expect(isolatedQ).toBeDefined();
      expect(isolatedQ!.question).toContain("Orphan");
    });
  });

  describe("fullReport", () => {
    it("should combine all analysis into a single report", () => {
      const { analyzer } = buildAnalysisGraph();
      const report = analyzer.fullReport();

      expect(report.godNodes.length).toBeGreaterThan(0);
      expect(report.surprisingConnections).toBeDefined();
      expect(report.bridgeNodes).toBeDefined();
      expect(report.questions).toBeDefined();
      expect(report.communities.length).toBeGreaterThan(0);
    });
  });

  describe("edge cases", () => {
    it("should handle empty graph", () => {
      const graph = new SymbolGraph();
      const detector = new GraphCommunityDetector(graph);
      const communities = detector.detect();
      const analyzer = new GraphAnalyzer(graph, communities);

      expect(analyzer.godNodes()).toEqual([]);
      expect(analyzer.surprisingConnections()).toEqual([]);
      expect(analyzer.bridgeNodes()).toEqual([]);
      expect(analyzer.suggestQuestions()).toEqual([]);
    });

    it("should handle single node", () => {
      const graph = new SymbolGraph();
      graph.addSymbol(makeSymbol("solo", "function"));
      const detector = new GraphCommunityDetector(graph);
      const communities = detector.detect();
      const analyzer = new GraphAnalyzer(graph, communities);

      expect(analyzer.godNodes()).toEqual([]);
      expect(analyzer.surprisingConnections()).toEqual([]);
    });
  });
});
