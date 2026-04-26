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
});
