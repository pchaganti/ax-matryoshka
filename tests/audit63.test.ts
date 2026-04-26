/**
 * Audit #63 — TDD tests for 10 issues
 * These tests should FAIL before the fixes and PASS after.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";

describe("Audit #63", () => {
  // =========================================================================
  // #1 HIGH — relational-solver split no MAX_SPLIT_PARTS cap
  // =========================================================================
  describe("#1 — relational-solver split should cap parts length", () => {
    it("should limit split result size", () => {
      const source = readFileSync("src/logic/relational-solver.ts", "utf-8");
      const splitStart = source.indexOf("split: (input, args)");
      expect(splitStart).toBeGreaterThan(-1);
      const block = source.slice(splitStart, splitStart + 400);
      // Should have an explicit cap like MAX_SPLIT_PARTS or parts.length > N
      expect(block).toMatch(/MAX_SPLIT_PARTS|parts\.length\s*>/i);
    });
  });

  // =========================================================================
  // #3 MEDIUM — predicate-compiler paren strip loop no iteration limit
  // =========================================================================
  describe("#3 — predicate paren stripping should limit iterations", () => {
    it("should cap while loop iterations", () => {
      const source = readFileSync("src/persistence/predicate-compiler.ts", "utf-8");
      // The while condition includes the iteration guard now
      const loopStart = source.indexOf("while (prev !== stripped");
      expect(loopStart).toBeGreaterThan(-1);
      const block = source.slice(loopStart - 150, loopStart + 200);
      expect(block).toMatch(/MAX_STRIP_ITERATIONS|iterations\s*</i);
    });
  });

  // =========================================================================
  // #4 MEDIUM — verifier verifyInvariant no typeof string check
  // =========================================================================
  describe("#4 — verifyInvariant should validate invariant is string", () => {
    it("should check typeof invariant before processing", () => {
      const source = readFileSync("src/constraints/verifier.ts", "utf-8");
      const fnStart = source.indexOf("function verifyInvariant(");
      if (fnStart === -1) {
        // exported function
        const altStart = source.indexOf("export function verifyInvariant(");
        expect(altStart).toBeGreaterThan(-1);
        const block = source.slice(altStart, altStart + 300);
        expect(block).toMatch(/typeof invariant\s*!==?\s*"string"|typeof invariant\s*===?\s*"string"/);
      } else {
        const block = source.slice(fnStart, fnStart + 300);
        expect(block).toMatch(/typeof invariant\s*!==?\s*"string"|typeof invariant\s*===?\s*"string"/);
      }
    });
  });

  // =========================================================================
  // #6 MEDIUM — rag/manager generateSelfCorrectionFeedback code null guard
  // =========================================================================
  describe("#6 — generateSelfCorrectionFeedback should guard failure.code", () => {
    it("should null-check failure.code before slicing", () => {
      const source = readFileSync("src/rag/manager.ts", "utf-8");
      const fnStart = source.indexOf("generateSelfCorrectionFeedback(");
      expect(fnStart).toBeGreaterThan(-1);
      const block = source.slice(fnStart, fnStart + 600);
      expect(block).toMatch(/failure\.code\s*\|\||failure\.code\s*\?\./)
    });
  });

  // =========================================================================
  // #8 MEDIUM — regex/synthesis analyzeCharacters spread DoS
  // =========================================================================
  describe("#8 — analyzeCharacters should avoid spread on large arrays", () => {
    it("should use reduce or guard array size before Math.min/max spread", () => {
      const source = readFileSync("src/synthesis/regex/synthesis.ts", "utf-8");
      const fnStart = source.indexOf("function analyzeCharacters(");
      if (fnStart === -1) {
        const altStart = source.indexOf("export function analyzeCharacters(");
        expect(altStart).toBeGreaterThan(-1);
        const block = source.slice(altStart, altStart + 400);
        // Should NOT use Math.min(...lengths) or Math.max(...lengths) unguarded
        // Instead should use reduce or have a length cap
        expect(block).toMatch(/examples\.length\s*>|MAX_EXAMPLES|reduce/i);
      } else {
        const block = source.slice(fnStart, fnStart + 400);
        expect(block).toMatch(/examples\.length\s*>|MAX_EXAMPLES|reduce/i);
      }
    });
  });

  // =========================================================================
  // #9 MEDIUM — symbol-extractor symbolIdCounter no overflow check
  // =========================================================================
  describe("#9 — symbolIdCounter should have overflow check", () => {
    it("should validate counter before increment", () => {
      const source = readFileSync("src/treesitter/symbol-extractor.ts", "utf-8");
      const counterInc = source.indexOf("this.symbolIdCounter++");
      expect(counterInc).toBeGreaterThan(-1);
      // Check the region around the first increment for a guard
      const block = source.slice(counterInc - 200, counterInc + 50);
      expect(block).toMatch(/MAX_SAFE_INTEGER|MAX_SYMBOL_ID|symbolIdCounter\s*>/i);
    });
  });
});
