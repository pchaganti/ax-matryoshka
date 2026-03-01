/**
 * Audit #64 — TDD tests for 10 issues
 * These tests should FAIL before the fixes and PASS after.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";

describe("Audit #64", () => {
  // =========================================================================
  // #1 HIGH — lc-solver parseNumber() recursive stack overflow on repeated %
  // =========================================================================
  describe("#1 — parseNumber should limit recursion depth for %", () => {
    it("should have a depth limit or iterative % handling", () => {
      const source = readFileSync("src/logic/lc-solver.ts", "utf-8");
      const fnStart = source.indexOf("function parseNumber(");
      expect(fnStart).toBeGreaterThan(-1);
      const block = source.slice(fnStart, fnStart + 400);
      // Should have depth parameter, iterative loop, or MAX_ constant
      expect(block).toMatch(/depth|MAX_PERCENT|while.*%|iterati/i);
    });
  });

  // =========================================================================
  // #2 HIGH — nucleus extractCode unbounded S-expression search loop
  // =========================================================================
  describe("#2 — extractCode should limit S-expression search iterations", () => {
    it("should cap the while loop iterations", () => {
      const source = readFileSync("src/adapters/nucleus.ts", "utf-8");
      const loopStart = source.indexOf("while (searchFrom >= 0");
      expect(loopStart).toBeGreaterThan(-1);
      const block = source.slice(loopStart - 200, loopStart + 300);
      expect(block).toMatch(/MAX_SEXP_ITER|MAX_SEARCH_ITER|iterations\s*</i);
    });
  });

  // =========================================================================
  // #3 MEDIUM — lc-solver evaluateWithBinding split missing MAX_SPLIT_PARTS
  // =========================================================================
  describe("#3 — evaluateWithBinding split should cap parts", () => {
    it("should limit split result size", () => {
      const source = readFileSync("src/logic/lc-solver.ts", "utf-8");
      const fnStart = source.indexOf("function evaluateWithBinding(");
      expect(fnStart).toBeGreaterThan(-1);
      const splitCase = source.indexOf('case "split":', fnStart);
      expect(splitCase).toBeGreaterThan(-1);
      const block = source.slice(splitCase, splitCase + 500);
      // Should have MAX_SPLIT_PARTS/MAX_EVAL_SPLIT_PARTS or parts.length check
      expect(block).toMatch(/MAX_SPLIT_PARTS|MAX_EVAL_SPLIT|parts\.length\s*>/i);
    });
  });

  // =========================================================================
  // #4 MEDIUM — session-db deleteCheckpoint turn not validated
  // =========================================================================
  describe("#4 — deleteCheckpoint should validate turn parameter", () => {
    it("should check isSafeInteger on turn", () => {
      const source = readFileSync("src/persistence/session-db.ts", "utf-8");
      const fnStart = source.indexOf("deleteCheckpoint(turn");
      expect(fnStart).toBeGreaterThan(-1);
      const block = source.slice(fnStart, fnStart + 300);
      expect(block).toMatch(/isSafeInteger.*turn|isFinite.*turn|turn\s*</i);
    });
  });

  // =========================================================================
  // #5 MEDIUM — session-db getSymbol id not validated
  // =========================================================================
  describe("#5 — getSymbol should validate id parameter", () => {
    it("should check isFinite or isSafeInteger on id", () => {
      const source = readFileSync("src/persistence/session-db.ts", "utf-8");
      const fnStart = source.indexOf("getSymbol(id");
      expect(fnStart).toBeGreaterThan(-1);
      const block = source.slice(fnStart, fnStart + 300);
      expect(block).toMatch(/isSafeInteger.*id|isFinite.*id|isInteger.*id/i);
    });
  });

  // =========================================================================
  // #6 MEDIUM — regex/synthesis conflict detection O(n*m) — use Set
  // =========================================================================
  describe("#6 — conflict detection should use Set for O(1) lookup", () => {
    it("should use Set instead of Array.includes for negatives", () => {
      const source = readFileSync("src/synthesis/regex/synthesis.ts", "utf-8");
      const conflictStart = source.indexOf("Check for conflicts");
      if (conflictStart === -1) {
        // Try alternate text
        const altStart = source.indexOf("conflicts");
        expect(altStart).toBeGreaterThan(-1);
        const block = source.slice(Math.max(0, altStart - 100), altStart + 300);
        expect(block).toMatch(/new Set\(negatives\)|negSet|negativeSet/i);
      } else {
        const block = source.slice(conflictStart, conflictStart + 300);
        expect(block).toMatch(/new Set\(negatives\)|negSet|negativeSet/i);
      }
    });
  });

  // =========================================================================
  // #7 MEDIUM — regex/synthesis unbounded error message string length
  // =========================================================================
  describe("#7 — error messages should cap joined array length", () => {
    it("should slice before joining in failedPositives error", () => {
      const source = readFileSync("src/synthesis/regex/synthesis.ts", "utf-8");
      const errStart = source.indexOf("Pattern fails to match positives");
      expect(errStart).toBeGreaterThan(-1);
      const block = source.slice(errStart - 50, errStart + 150);
      // Should slice the array before joining, like .slice(0, N).join(...)
      expect(block).toMatch(/slice\(\s*0\s*,\s*\d+\s*\)\.join/);
    });
  });

  // =========================================================================
  // #8 MEDIUM — sandbox-tools JSON.stringify without size limit
  // =========================================================================
  describe("#8 — sandbox-tools should cap JSON.stringify output", () => {
    it("should limit stringified output length", () => {
      const source = readFileSync("src/synthesis/sandbox-tools.ts", "utf-8");
      const logStart = source.indexOf("JSON.stringify(ex.output)");
      expect(logStart).toBeGreaterThan(-1);
      const block = source.slice(logStart, logStart + 200);
      // Should truncate JSON output via safeStringify or length cap on the stringified result
      expect(block).toMatch(/MAX_JSON|safeStringify|\.slice\(0|\.substring\(0/i);
    });
  });

  // =========================================================================
  // #9 MEDIUM — symbol-extractor unvalidated node position values
  // =========================================================================
  describe("#9 — extractSymbolFromNode should validate position values", () => {
    it("should check isFinite on row/column before arithmetic", () => {
      const source = readFileSync("src/treesitter/symbol-extractor.ts", "utf-8");
      const fnStart = source.indexOf("extractSymbolFromNode");
      expect(fnStart).toBeGreaterThan(-1);
      const posStart = source.indexOf("startLine:", fnStart);
      expect(posStart).toBeGreaterThan(-1);
      const block = source.slice(posStart - 200, posStart + 200);
      // Should have isFinite or isSafeInteger check on row values
      expect(block).toMatch(/isFinite|isSafeInteger|typeof.*row/i);
    });
  });

  // =========================================================================
  // #10 MEDIUM — lc-interpreter + lc-solver add() result not checked
  // =========================================================================
  describe("#10 — add() should validate result for finitude", () => {
    it("should check isFinite on result of addition", () => {
      const source = readFileSync("src/logic/lc-interpreter.ts", "utf-8");
      const addCase = source.indexOf('case "add"');
      expect(addCase).toBeGreaterThan(-1);
      const block = source.slice(addCase, addCase + 500);
      // Should validate result: const addResult = left + right; isFinite(addResult)
      expect(block).toMatch(/addResult.*isFinite|isFinite.*addResult|isFinite\(left\s*\+\s*right\)/i);
    });
  });
});
