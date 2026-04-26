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

});
