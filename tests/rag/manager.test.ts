/**
 * Tests for RAG Manager
 */

import { describe, it, expect, beforeEach } from "vitest";
import {
  RAGManager,
  createRAGManager,
  getRAGManager,
} from "../../src/rag/manager.js";
import { EXPERT_EXAMPLES, FAILURE_EXAMPLES } from "../../src/rag/knowledge-base.js";
import { readFileSync } from "fs";

describe("RAGManager", () => {
  let manager: RAGManager;

  beforeEach(() => {
    manager = createRAGManager();
  });

  describe("getHints", () => {
    it("should return hints for currency-related queries", () => {
      const hints = manager.getHints("sum up the total sales revenue in dollars", 3);

      expect(hints.length).toBeGreaterThan(0);
      expect(hints[0].type).toBe("pattern");
      expect(hints[0].score).toBeGreaterThan(0);
    });

    it("should return hints for counting queries", () => {
      const hints = manager.getHints("count how many errors occurred", 3);

      expect(hints.length).toBeGreaterThan(0);
      expect(hints.some(h => h.content.includes("count") || h.content.includes("length"))).toBe(true);
    });

    it("should return hints for search queries", () => {
      const hints = manager.getHints("find all lines containing the word ERROR", 3);

      expect(hints.length).toBeGreaterThan(0);
      expect(hints.some(h => h.content.includes("grep"))).toBe(true);
    });

    it("should include pitfall hints when relevant", () => {
      const hints = manager.getHints("sum currency values with commas", 5);

      // Should include both pattern and pitfall
      const types = hints.map(h => h.type);
      // May include pitfalls depending on relevance
      expect(types.includes("pattern")).toBe(true);
    });

    it("should respect topK parameter", () => {
      const hints = manager.getHints("extract data from table", 1);

      // Should return at most topK + 1 (for pitfalls/failures)
      expect(hints.length).toBeLessThanOrEqual(2);
    });

    it("should filter out low-relevance hints", () => {
      const hints = manager.getHints("xyzzy completely unrelated query", 5);

      // Should have few or no hints for irrelevant query
      const highScoreHints = hints.filter(h => h.score > 0.2);
      expect(highScoreHints.length).toBeLessThanOrEqual(2);
    });
  });

  describe("formatHintsForPrompt", () => {
    it("should format hints as markdown", () => {
      const hints = manager.getHints("sum sales", 2);
      const formatted = manager.formatHintsForPrompt(hints);

      expect(formatted).toContain("RELEVANT PATTERNS");
      expect(formatted).toContain("```javascript");
    });

    it("should return empty string for no hints", () => {
      const formatted = manager.formatHintsForPrompt([]);
      expect(formatted).toBe("");
    });

    it("should include warnings section for pitfalls", () => {
      // Get hints that include pitfalls
      const hints = manager.getHints("parse currency with commas", 5);
      const formatted = manager.formatHintsForPrompt(hints);

      // May or may not have warnings depending on relevance
      if (hints.some(h => h.type === "pitfall" || h.type === "failure")) {
        expect(formatted).toContain("WARNING");
      }
    });
  });

  describe("failure memory", () => {
    it("should record failures", () => {
      manager.recordFailure({
        query: "test query",
        code: "broken code",
        error: "SyntaxError",
        timestamp: Date.now(),
      });

      const failures = manager.getRecentFailures();
      expect(failures.length).toBe(1);
      expect(failures[0].error).toBe("SyntaxError");
    });

    it("should filter by session ID", () => {
      manager.recordFailure({
        query: "test",
        code: "code1",
        error: "Error1",
        timestamp: Date.now(),
        sessionId: "session-1",
      });

      manager.recordFailure({
        query: "test",
        code: "code2",
        error: "Error2",
        timestamp: Date.now(),
        sessionId: "session-2",
      });

      const session1Failures = manager.getRecentFailures("session-1");
      expect(session1Failures.length).toBe(1);
      expect(session1Failures[0].sessionId).toBe("session-1");
    });

    it("should filter by age", () => {
      // Add an old failure
      manager.recordFailure({
        query: "old",
        code: "old code",
        error: "OldError",
        timestamp: Date.now() - 10 * 60 * 1000,  // 10 minutes ago
      });

      // Add a recent failure
      manager.recordFailure({
        query: "new",
        code: "new code",
        error: "NewError",
        timestamp: Date.now(),
      });

      const failures = manager.getRecentFailures(undefined, 5 * 60 * 1000);  // 5 min
      expect(failures.length).toBe(1);
      expect(failures[0].error).toBe("NewError");
    });

    it("should prune old failures when over limit", () => {
      // Add many failures
      for (let i = 0; i < 60; i++) {
        manager.recordFailure({
          query: `query-${i}`,
          code: `code-${i}`,
          error: `Error-${i}`,
          timestamp: Date.now(),
        });
      }

      const stats = manager.getStats();
      expect(stats.recentFailures).toBeLessThanOrEqual(50);
    });

    it("should clear failure memory", () => {
      manager.recordFailure({
        query: "test",
        code: "code",
        error: "Error",
        timestamp: Date.now(),
      });

      manager.clearFailureMemory();
      expect(manager.getRecentFailures().length).toBe(0);
    });

    it("should clear only specific session", () => {
      manager.recordFailure({
        query: "test1",
        code: "code1",
        error: "Error1",
        timestamp: Date.now(),
        sessionId: "session-1",
      });

      manager.recordFailure({
        query: "test2",
        code: "code2",
        error: "Error2",
        timestamp: Date.now(),
        sessionId: "session-2",
      });

      manager.clearFailureMemory("session-1");

      const failures = manager.getRecentFailures();
      expect(failures.length).toBe(1);
      expect(failures[0].sessionId).toBe("session-2");
    });
  });

  describe("generateSelfCorrectionFeedback", () => {
    it("should return null when no failures", () => {
      const feedback = manager.generateSelfCorrectionFeedback();
      expect(feedback).toBeNull();
    });

    it("should format recent failures as feedback", () => {
      manager.recordFailure({
        query: "test",
        code: "const x = broken;",
        error: "ReferenceError: broken is not defined",
        timestamp: Date.now(),
      });

      const feedback = manager.generateSelfCorrectionFeedback();
      expect(feedback).not.toBeNull();
      expect(feedback).toContain("SELF-CORRECTION");
      expect(feedback).toContain("broken");
      expect(feedback).toContain("ReferenceError");
    });

    it("should include up to 3 recent failures", () => {
      for (let i = 0; i < 5; i++) {
        manager.recordFailure({
          query: `test-${i}`,
          code: `code-${i}`,
          error: `Error-${i}`,
          timestamp: Date.now(),
        });
      }

      const feedback = manager.generateSelfCorrectionFeedback();
      // Should only show last 3
      expect(feedback).not.toContain("Error-0");
      expect(feedback).not.toContain("Error-1");
      expect(feedback).toContain("Error-4");
    });
  });

  describe("getStats", () => {
    it("should return knowledge base statistics", () => {
      const stats = manager.getStats();

      expect(stats.totalExamples).toBe(EXPERT_EXAMPLES.length);
      expect(stats.totalFailurePatterns).toBe(FAILURE_EXAMPLES.length);
      expect(stats.categories.length).toBeGreaterThan(0);
      expect(stats.recentFailures).toBe(0);
    });
  });
});

describe("getRAGManager singleton", () => {
  it("should return the same instance", () => {
    const manager1 = getRAGManager();
    const manager2 = getRAGManager();
    expect(manager1).toBe(manager2);
  });

  it("should persist failures across calls", () => {
    const manager1 = getRAGManager();
    manager1.recordFailure({
      query: "singleton-test",
      code: "const x = 1;",
      error: "TestError",
      timestamp: Date.now(),
      sessionId: "singleton-session",
    });

    // Get manager again and check failure persists
    const manager2 = getRAGManager();
    const failures = manager2.getRecentFailures("singleton-session");
    expect(failures.length).toBe(1);
    expect(failures[0].query).toBe("singleton-test");

    // Clean up
    manager2.clearFailureMemory("singleton-session");
  });
});

describe("generateSelfCorrectionFeedback edge cases", () => {
  let manager: RAGManager;

  beforeEach(() => {
    manager = createRAGManager();
  });

  it("should truncate long code to 200 chars", () => {
    const longCode = "const x = ".padEnd(300, "a") + ";";
    manager.recordFailure({
      query: "test",
      code: longCode,
      error: "Error",
      timestamp: Date.now(),
    });

    const feedback = manager.generateSelfCorrectionFeedback();
    expect(feedback).toContain("...");
    expect(feedback!.length).toBeLessThan(longCode.length + 500);
  });

  it("should filter by session ID when generating feedback", () => {
    manager.recordFailure({
      query: "test1",
      code: "code1",
      error: "Error1",
      timestamp: Date.now(),
      sessionId: "session-A",
    });

    manager.recordFailure({
      query: "test2",
      code: "code2",
      error: "Error2",
      timestamp: Date.now(),
      sessionId: "session-B",
    });

    const feedbackA = manager.generateSelfCorrectionFeedback("session-A");
    const feedbackB = manager.generateSelfCorrectionFeedback("session-B");

    expect(feedbackA).toContain("Error1");
    expect(feedbackA).not.toContain("Error2");
    expect(feedbackB).toContain("Error2");
    expect(feedbackB).not.toContain("Error1");
  });

  it("should return null for session with no failures", () => {
    manager.recordFailure({
      query: "test",
      code: "code",
      error: "Error",
      timestamp: Date.now(),
      sessionId: "session-X",
    });

    const feedback = manager.generateSelfCorrectionFeedback("session-Y");
    expect(feedback).toBeNull();
  });
});

// =====================================================================
// Source-pattern checks (from audits)
// =====================================================================
describe("Source-pattern checks (from audits)", () => {
  // from tests/audit17.test.ts Audit17 #7: RAG failure memory cleanup
  describe("Audit17 #7: RAG failure memory cleanup", () => {
    it("should auto-prune stale failures on record", async () => {
      const { RAGManager } = await import("../../src/rag/manager.js");
      const mgr = new RAGManager();

      // Record a failure with old timestamp
      const oldFailure: any = {
        sessionId: "old-session",
        iteration: 1,
        error: "test error",
        code: "test code",
        timestamp: Date.now() - 10 * 60 * 1000, // 10 minutes ago
      };
      mgr.recordFailure(oldFailure);

      // Record a fresh failure
      const newFailure: any = {
        sessionId: "new-session",
        iteration: 1,
        error: "new error",
        code: "new code",
        timestamp: Date.now(),
      };
      mgr.recordFailure(newFailure);

      // Old session failures should be prunable
      const recentAll = mgr.getRecentFailures(undefined, 5 * 60 * 1000);
      // Only the new one should be within the 5-minute window
      expect(recentAll.length).toBe(1);
      expect(recentAll[0].sessionId).toBe("new-session");
    });
  });

  // from tests/audit18.test.ts Audit18 #12: failure matching precedence
  describe("Audit18 #12: failure matching precedence", () => {
    it("rag manager should load", async () => {
      const { RAGManager } = await import("../../src/rag/manager.js");
      const mgr = new RAGManager();
      expect(mgr).toBeDefined();
    });
  });

  // from tests/audit26.test.ts Audit26 #10: RAG manager topK count
  describe("Audit26 #10: RAG manager topK count", () => {
    it("should be importable", async () => {
      const mod = await import("../../src/rag/manager.js");
      expect(mod.RAGManager).toBeDefined();
    });
  });

  // from tests/audit63.test.ts #6 — generateSelfCorrectionFeedback should guard failure.code
  describe("#6 — generateSelfCorrectionFeedback should guard failure.code", () => {
      it("should null-check failure.code before slicing", () => {
        const source = readFileSync("src/rag/manager.ts", "utf-8");
        const fnStart = source.indexOf("generateSelfCorrectionFeedback(");
        expect(fnStart).toBeGreaterThan(-1);
        const block = source.slice(fnStart, fnStart + 600);
        expect(block).toMatch(/failure\.code\s*\|\||failure\.code\s*\?\./)
      });
    });

  // from tests/audit69.test.ts #3 — getHints sort should use safe comparator
  describe("#3 — getHints sort should use safe comparator", () => {
      it("should not use raw subtraction for score sorting", () => {
        const source = readFileSync("src/rag/manager.ts", "utf-8");
        const sortStart = source.indexOf("Sort by score");
        expect(sortStart).toBeGreaterThan(-1);
        const block = source.slice(sortStart, sortStart + 200);
        // Should NOT use raw subtraction
        const hasRawSubtraction = /\.sort\(\(a,\s*b\)\s*=>\s*b\.score\s*-\s*a\.score\)/.test(block);
        expect(hasRawSubtraction).toBe(false);
      });
    });

  // from tests/audit69.test.ts #4 — getHints should validate topK parameter
  describe("#4 — getHints should validate topK parameter", () => {
      it("should clamp or validate topK to positive integer", () => {
        const source = readFileSync("src/rag/manager.ts", "utf-8");
        const fnStart = source.indexOf("getHints(");
        expect(fnStart).toBeGreaterThan(-1);
        const block = source.slice(fnStart, fnStart + 300);
        expect(block).toMatch(/Math\.max|Math\.min|Math\.floor|topK\s*[<>=]/i);
      });
    });

  // from tests/audit74.test.ts #10 — manager recordFailure should validate query length
  describe("#10 — manager recordFailure should validate query length", () => {
      it("should cap record.query length", () => {
        const source = readFileSync("src/rag/manager.ts", "utf-8");
        const fnStart = source.indexOf("recordFailure(");
        expect(fnStart).toBeGreaterThan(-1);
        const block = source.slice(fnStart, fnStart + 500);
        expect(block).toMatch(/record\.query\.length|MAX_QUERY|query\.slice/);
      });
    });

  // from tests/audit75.test.ts #8 — rag manager getHints should validate query length
  describe("#8 — rag manager getHints should validate query length", () => {
      it("should check query.length", () => {
        const source = readFileSync("src/rag/manager.ts", "utf-8");
        const fnStart = source.indexOf("getHints(query:");
        expect(fnStart).toBeGreaterThan(-1);
        const block = source.slice(fnStart, fnStart + 300);
        expect(block).toMatch(/query\.length|MAX_QUERY/);
      });
    });

  // from tests/audit80.test.ts #2 — formatExampleAsHint should escape code backticks
  describe("#2 — formatExampleAsHint should escape code backticks", () => {
      it("should escape backticks in example.code", () => {
        const source = readFileSync("src/rag/manager.ts", "utf-8");
        const fnStart = source.indexOf("private formatExampleAsHint");
        expect(fnStart).toBeGreaterThan(-1);
        const block = source.slice(fnStart, fnStart + 400);
        expect(block).toMatch(/\.replace\(.*`|escape.*code|safeCode/);
      });
    });

  // from tests/audit80.test.ts #9 — formatExampleAsHint should truncate rationale
  describe("#9 — formatExampleAsHint should truncate rationale", () => {
      it("should truncate or cap example.rationale", () => {
        const source = readFileSync("src/rag/manager.ts", "utf-8");
        const fnStart = source.indexOf("private formatExampleAsHint");
        expect(fnStart).toBeGreaterThan(-1);
        const block = source.slice(fnStart, fnStart + 400);
        expect(block).toMatch(/rationale.*\.slice\(0,|safeRationale|rationale.*truncat/);
      });
    });

});
