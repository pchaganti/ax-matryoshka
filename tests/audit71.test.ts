/**
 * Audit #71 — TDD tests for 10 issues
 * These tests should FAIL before the fixes and PASS after.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";

describe("Audit #71", () => {
  // =========================================================================
  // #1 HIGH — lc-solver sum reduce no isFinite check on result
  // =========================================================================
  describe("#1 — lc-solver sum should check isFinite on total", () => {
    it("should validate total is finite after reduce", () => {
      const source = readFileSync("src/logic/lc-solver.ts", "utf-8");
      const sumCase = source.indexOf('case "sum"');
      expect(sumCase).toBeGreaterThan(-1);
      const reduceEnd = source.indexOf("}, 0);", sumCase);
      expect(reduceEnd).toBeGreaterThan(-1);
      const block = source.slice(reduceEnd, reduceEnd + 200);
      // Should have isFinite check on total after reduce
      expect(block).toMatch(/isFinite\(total\)|Number\.isFinite\(total\)/);
    });
  });

  // =========================================================================
  // #2 HIGH — fts5-search searchByRelevance unbounded queryTerms
  // =========================================================================
  describe("#2 — searchByRelevance should cap query terms", () => {
    it("should limit number of query terms", () => {
      const source = readFileSync("src/persistence/fts5-search.ts", "utf-8");
      const fnStart = source.indexOf("searchByRelevance(");
      expect(fnStart).toBeGreaterThan(-1);
      const block = source.slice(fnStart, fnStart + 400);
      expect(block).toMatch(/MAX_SEARCH_TERMS|\.slice\(0|queryTerms\.length/i);
    });
  });

  // =========================================================================
  // #3 MEDIUM — relational-solver PRIMITIVES.match missing group > 99 cap
  // =========================================================================
  describe("#3 — relational-solver match should cap group number", () => {
    it("should reject excessively large group numbers", () => {
      const source = readFileSync("src/logic/relational-solver.ts", "utf-8");
      const matchPrim = source.indexOf("match: (input, args)");
      expect(matchPrim).toBeGreaterThan(-1);
      const block = source.slice(matchPrim, matchPrim + 300);
      expect(block).toMatch(/group\s*>\s*99|group\s*>=\s*100/);
    });
  });

  // =========================================================================
  // #4 MEDIUM — lc-interpreter extract case missing group > 99 cap
  // =========================================================================
  describe("#4 — lc-interpreter extract should cap group number", () => {
    it("should reject excessively large group numbers", () => {
      const source = readFileSync("src/logic/lc-interpreter.ts", "utf-8");
      const extractCase = source.indexOf('case "extract"');
      expect(extractCase).toBeGreaterThan(-1);
      const block = source.slice(extractCase, extractCase + 200);
      expect(block).toMatch(/group\s*>\s*99|group\s*>=\s*100/);
    });
  });

  // =========================================================================
  // #5 MEDIUM — relational/interpreter exprToCode match missing group > 99 cap
  // =========================================================================
  describe("#5 — relational interpreter exprToCode match should cap group", () => {
    it("should reject excessively large group numbers", () => {
      const source = readFileSync("src/synthesis/relational/interpreter.ts", "utf-8");
      // Find the exprToCode match case (second occurrence, in code generation)
      const firstMatch = source.indexOf('case "match"');
      const exprMatch = source.indexOf('case "match"', firstMatch + 1);
      expect(exprMatch).toBeGreaterThan(-1);
      const block = source.slice(exprMatch, exprMatch + 200);
      expect(block).toMatch(/group\s*>\s*99|group\s*>=\s*100/);
    });
  });

  // =========================================================================
  // #6 MEDIUM — fts5-search grepToFTS unbounded alternation split
  // =========================================================================
  describe("#6 — grepToFTS should cap alternation terms", () => {
    it("should limit terms from alternation pattern split", () => {
      const source = readFileSync("src/persistence/fts5-search.ts", "utf-8");
      const altSplit = source.indexOf('pattern.split("|")');
      expect(altSplit).toBeGreaterThan(-1);
      const block = source.slice(altSplit, altSplit + 100);
      expect(block).toMatch(/\.slice\(0|MAX_ALT/i);
    });
  });

  // =========================================================================
  // #7 MEDIUM — compile.ts compile() no recursion depth tracking
  // =========================================================================
  describe("#7 — compile should track recursion depth", () => {
    it("should have a depth parameter or MAX_DEPTH check", () => {
      const source = readFileSync("src/synthesis/evalo/compile.ts", "utf-8");
      const fnStart = source.indexOf("export function compile(");
      expect(fnStart).toBeGreaterThan(-1);
      const block = source.slice(fnStart, fnStart + 200);
      expect(block).toMatch(/depth|MAX_COMPILE_DEPTH|MAX_DEPTH/i);
    });
  });

  // =========================================================================
  // #8 MEDIUM — error-analyzer findSimilar unbounded candidates array
  // =========================================================================
  describe("#8 — findSimilar should cap candidates array size", () => {
    it("should limit candidates before processing", () => {
      const source = readFileSync("src/feedback/error-analyzer.ts", "utf-8");
      const fnStart = source.indexOf("function findSimilar(");
      expect(fnStart).toBeGreaterThan(-1);
      const block = source.slice(fnStart, fnStart + 400);
      expect(block).toMatch(/MAX_CANDIDATES|candidates\.slice|candidates\.length\s*>/i);
    });
  });

  // =========================================================================
  // #9 MEDIUM — fts5-search searchByRelevance sort uses float subtraction
  // =========================================================================
  describe("#9 — searchByRelevance sort should use safe comparator", () => {
    it("should not use raw subtraction for score sorting", () => {
      const source = readFileSync("src/persistence/fts5-search.ts", "utf-8");
      const sortLine = source.indexOf("scores.get(b)");
      expect(sortLine).toBeGreaterThan(-1);
      const block = source.slice(sortLine - 30, sortLine + 80);
      const hasRawSubtraction = /scores\.get\(b\).*-.*scores\.get\(a\)/.test(block);
      expect(hasRawSubtraction).toBe(false);
    });
  });

  // =========================================================================
  // #10 MEDIUM — sandbox-tools count_tokens unbounded word split
  // =========================================================================
  describe("#10 — sandbox count_tokens should cap words array", () => {
    it("should limit words array size", () => {
      const source = readFileSync("src/synthesis/sandbox-tools.ts", "utf-8");
      const fnStart = source.indexOf("function count_tokens(");
      expect(fnStart).toBeGreaterThan(-1);
      const block = source.slice(fnStart, fnStart + 300);
      expect(block).toMatch(/MAX_WORDS|MAX_TOKEN|words\.length|words\.slice/i);
    });
  });
});
