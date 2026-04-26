/**
 * Audit #88 — 10 security issues
 *
 * 1. MEDIUM evalo.ts — add operation missing isSafeInteger on result
 * 2. MEDIUM sandbox-tools.ts — log args String(a) not individually capped
 * 3. MEDIUM sandbox-tools.ts — grep context not size-capped
 * 4. MEDIUM rag/manager.ts — formatFailureAsHint not escaping backticks
 * 5. MEDIUM error-analyzer.ts — Levenshtein MAX_STR_LENGTH too large for matrix
 * 6. MEDIUM config.ts — coerceConfigTypes no isFinite check after Number()
 * 7. MEDIUM grammar-config.ts — package name allows path traversal (..)
 * 8. MEDIUM verifier.ts — isSafeInvariant allows unbounded dot depth
 * 9. MEDIUM similarity.ts — keywords array not capped
 * 10. MEDIUM config.ts — coerceConfigTypes no recursion depth limit
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";

describe("Audit #88", () => {
  // =========================================================================
  // #1 MEDIUM — evalo.ts add operation missing isSafeInteger on result
  // =========================================================================
  describe("#1 — add should check isSafeInteger on result", () => {
    it("should include isSafeInteger in add case", () => {
      const source = readFileSync("src/synthesis/evalo/evalo.ts", "utf-8");
      const addCase = source.indexOf('case "add"');
      expect(addCase).toBeGreaterThan(-1);
      const block = source.slice(addCase, addCase + 400);
      expect(block).toMatch(/isSafeInteger/);
    });
  });

  // =========================================================================
  // #2 MEDIUM — sandbox-tools.ts log args not individually capped
  // =========================================================================
  describe("#2 — console.log should cap individual args before join", () => {
    it("should slice individual args before joining", () => {
      const source = readFileSync("node_modules/repl-sandbox/dist/sandbox.js", "utf-8");
      const logFn = source.indexOf("log: (...args)");
      expect(logFn).toBeGreaterThan(-1);
      const block = source.slice(logFn, logFn + 300);
      // Each arg should be individually capped via .slice() before join
      expect(block).toMatch(/String\(a\)\.slice\(0,|\.slice\(0,\s*\d+\).*\.join/);
    });
  });

  // =========================================================================
  // #3 MEDIUM — sandbox-tools.ts grep context not size-capped
  // =========================================================================
  describe("#3 — grep should cap context size", () => {
    it("should limit context length before processing", () => {
      const source = readFileSync("node_modules/repl-sandbox/dist/builtins/grep.js", "utf-8");
      const grepFn = source.indexOf("function grep(pattern");
      expect(grepFn).toBeGreaterThan(-1);
      const block = source.slice(Math.max(0, grepFn - 200), grepFn + 500);
      expect(block).toMatch(/MAX_CONTEXT|context\.length\s*>|context\.slice\(0,/i);
    });
  });

  // =========================================================================
  // #4 MEDIUM — rag/manager.ts formatFailureAsHint not escaping backticks
  // =========================================================================
  // #5 MEDIUM — error-analyzer.ts Levenshtein MAX_STR_LENGTH too large
  // =========================================================================
  describe("#5 — levenshteinDistance should have reasonable matrix cap", () => {
    it("should cap string length to prevent OOM matrix", () => {
      const source = readFileSync("src/feedback/error-analyzer.ts", "utf-8");
      const fnStart = source.indexOf("function levenshteinDistance");
      expect(fnStart).toBeGreaterThan(-1);
      const block = source.slice(fnStart, fnStart + 300);
      // MAX_STR_LENGTH should be <= 2000 to keep matrix under ~16M entries
      expect(block).toMatch(/MAX_STR_LENGTH\s*=\s*[12][\d_]{0,4}[^0]/);
    });
  });

  // =========================================================================
  // #6 MEDIUM — config.ts coerceConfigTypes no isFinite check
  // =========================================================================
  describe("#6 — coerceConfigTypes should check isFinite", () => {
    it("should validate Number() result is finite", () => {
      const source = readFileSync("src/config.ts", "utf-8");
      const fnStart = source.indexOf("function coerceConfigTypes");
      expect(fnStart).toBeGreaterThan(-1);
      const block = source.slice(fnStart, fnStart + 400);
      expect(block).toMatch(/isFinite|Number\.isFinite/);
    });
  });

  // =========================================================================
  // #7 MEDIUM — grammar-config.ts package name allows path traversal (..)
  // =========================================================================
  describe("#7 — addCustomGrammar should reject .. in package name", () => {
    it("should block path traversal in package name", () => {
      const source = readFileSync("src/config/grammar-config.ts", "utf-8");
      const fnStart = source.indexOf("function addCustomGrammar");
      expect(fnStart).toBeGreaterThan(-1);
      const block = source.slice(fnStart, fnStart + 1000);
      expect(block).toMatch(/\.\."|includes\("\.\."\)|\.\.\/|path.*traversal/i);
    });
  });

  // =========================================================================
  // #8 MEDIUM — verifier.ts isSafeInvariant allows unbounded dot depth
  // =========================================================================
  describe("#8 — isSafeInvariant should limit property access depth", () => {
    it("should reject deeply nested dot access", () => {
      const source = readFileSync("src/constraints/verifier.ts", "utf-8");
      const safePatternPos = source.indexOf("safePattern");
      expect(safePatternPos).toBeGreaterThan(-1);
      const block = source.slice(safePatternPos, safePatternPos + 400);
      expect(block).toMatch(/\.\s*match\(.*\\\..*length|MAX_DOT_DEPTH|dotCount|propertyDepth/i);
    });
  });

  // =========================================================================
  // #9 MEDIUM — similarity.ts keywords array not capped
  // =========================================================================
  describe("#9 — keywordMatchScore should cap keywords", () => {
    it("should limit keywords array size", () => {
      const source = readFileSync("src/rag/similarity.ts", "utf-8");
      const fnStart = source.indexOf("function keywordMatchScore");
      expect(fnStart).toBeGreaterThan(-1);
      const block = source.slice(fnStart, fnStart + 400);
      expect(block).toMatch(/MAX_KEYWORDS|keywords\.length\s*>|keywords\.slice\(0,/i);
    });
  });

  // =========================================================================
  // #10 MEDIUM — config.ts coerceConfigTypes no recursion depth limit
  // =========================================================================
  describe("#10 — coerceConfigTypes should have depth limit", () => {
    it("should track and limit recursion depth", () => {
      const source = readFileSync("src/config.ts", "utf-8");
      const fnStart = source.indexOf("function coerceConfigTypes");
      expect(fnStart).toBeGreaterThan(-1);
      const block = source.slice(fnStart, fnStart + 400);
      expect(block).toMatch(/depth|MAX_DEPTH|MAX_CONFIG_DEPTH/i);
    });
  });
});
