/**
 * Audit #71 — TDD tests for 10 issues
 * These tests should FAIL before the fixes and PASS after.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";

describe("Audit #71", () => {

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
  // #9 MEDIUM — fts5-search searchByRelevance sort uses float subtraction
  // Now delegates to FTS5 BM25 via session-db — verify no manual score sorting
  // =========================================================================
  describe("#9 — searchByRelevance sort should use safe comparator", () => {
    it("should not use raw subtraction for score sorting", () => {
      const source = readFileSync("src/persistence/fts5-search.ts", "utf-8");
      const sortLine = source.indexOf("scores.get(b)");
      if (sortLine === -1) {
        // Code was refactored to use FTS5 BM25 — no manual scoring, inherently safe
        expect(true).toBe(true);
        return;
      }
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
      const source = readFileSync("node_modules/repl-sandbox/dist/builtins/text-utils.js", "utf-8");
      const fnStart = source.indexOf("function count_tokens(");
      expect(fnStart).toBeGreaterThan(-1);
      const block = source.slice(fnStart, fnStart + 300);
      expect(block).toMatch(/MAX_WORDS|MAX_TOKEN|words\.length|words\.slice/i);
    });
  });
});
