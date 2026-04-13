import { describe, it, expect, beforeEach } from "vitest";
import { SymbolGraph } from "../../src/graph/symbol-graph.js";
import { GraphCommunityDetector, type CommunityMap } from "../../src/graph/community-detector.js";
import type { Symbol } from "../../src/treesitter/types.js";

function makeSymbol(name: string, kind: Symbol["kind"]): Symbol {
  return { name, kind, startLine: 1, endLine: 10, startCol: 0, endCol: 0 };
}

function buildGraphWithCommunities(): { graph: SymbolGraph; detect: GraphCommunityDetector } {
  const graph = new SymbolGraph();

  // Community A: auth-related
  graph.addSymbol(makeSymbol("AuthService", "class"));
  graph.addSymbol(makeSymbol("LoginHandler", "class"));
  graph.addSymbol(makeSymbol("TokenValidator", "class"));
  graph.addEdge("AuthService", "LoginHandler", "calls");
  graph.addEdge("AuthService", "TokenValidator", "calls");
  graph.addEdge("LoginHandler", "TokenValidator", "calls");

  // Community B: db-related
  graph.addSymbol(makeSymbol("Database", "class"));
  graph.addSymbol(makeSymbol("QueryBuilder", "class"));
  graph.addSymbol(makeSymbol("Migration", "class"));
  graph.addEdge("Database", "QueryBuilder", "calls");
  graph.addEdge("Database", "Migration", "calls");

  // Bridge: AuthService uses Database
  graph.addEdge("AuthService", "Database", "calls");

  const detect = new GraphCommunityDetector(graph);
  return { graph, detect };
}

describe("GraphCommunityDetector", () => {
  describe("detect", () => {
    it("should assign community IDs to all nodes", () => {
      const { detect } = buildGraphWithCommunities();
      const communities = detect.detect();

      expect(Object.keys(communities)).toHaveLength(6);
      for (const node of Object.keys(communities)) {
        expect(typeof communities[node]).toBe("number");
      }
    });

    it("should group tightly connected nodes into same community", () => {
      const { detect } = buildGraphWithCommunities();
      const communities = detect.detect();

      const authCommunity = communities["LoginHandler"];
      expect(communities["AuthService"]).toBe(authCommunity);
      expect(communities["TokenValidator"]).toBe(authCommunity);
    });

    it("should separate unrelated clusters into different communities", () => {
      const { detect } = buildGraphWithCommunities();
      const communities = detect.detect();

      const authCommunity = communities["LoginHandler"];
      const dbCommunity = communities["QueryBuilder"];
      expect(authCommunity).not.toBe(dbCommunity);
    });

    it("should return empty map for empty graph", () => {
      const graph = new SymbolGraph();
      const detect = new GraphCommunityDetector(graph);
      expect(detect.detect()).toEqual({});
    });

    it("should handle single node", () => {
      const graph = new SymbolGraph();
      graph.addSymbol(makeSymbol("lonely", "function"));
      const detect = new GraphCommunityDetector(graph);
      const communities = detect.detect();
      expect(communities["lonely"]).toBeDefined();
    });
  });

  describe("communityList", () => {
    it("should return communities grouped by ID", () => {
      const { detect } = buildGraphWithCommunities();
      const list = detect.communityList();

      expect(list.length).toBeGreaterThanOrEqual(2);
      for (const community of list) {
        expect(community.id).toBeDefined();
        expect(community.nodes.length).toBeGreaterThan(0);
      }
    });

    it("should include cohesion score per community", () => {
      const { detect } = buildGraphWithCommunities();
      const list = detect.communityList();

      for (const community of list) {
        expect(typeof community.cohesion).toBe("number");
        expect(community.cohesion).toBeGreaterThanOrEqual(0);
        expect(community.cohesion).toBeLessThanOrEqual(1);
      }
    });
  });

  describe("nodeCommunity", () => {
    it("should return the community ID for a specific node", () => {
      const { detect } = buildGraphWithCommunities();
      detect.detect();

      const cid = detect.nodeCommunity("LoginHandler");
      expect(cid).toBeDefined();
      expect(typeof cid).toBe("number");
    });

    it("should return undefined for non-existent node", () => {
      const graph = new SymbolGraph();
      graph.addSymbol(makeSymbol("a", "function"));
      const detect = new GraphCommunityDetector(graph);
      detect.detect();

      expect(detect.nodeCommunity("ghost")).toBeUndefined();
    });
  });
});
