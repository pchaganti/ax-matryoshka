/**
 * Audit #77 — TDD tests for 10 issues
 * These tests should FAIL before the fixes and PASS after.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";

describe("Audit #77", () => {
  // =========================================================================
  // #1 HIGH — lc-solver.ts evaluateWithBinding parseInt missing length check
  // =========================================================================
  describe("#1 — evaluateWithBinding parseInt should validate string length", () => {
    it("should check string length before parseInt in evaluateWithBinding", () => {
      const source = readFileSync("src/logic/lc-solver.ts", "utf-8");
      // Find the evaluateWithBinding parseInt case (second occurrence)
      const firstParseInt = source.indexOf('case "parseInt"');
      expect(firstParseInt).toBeGreaterThan(-1);
      const secondParseInt = source.indexOf('case "parseInt"', firstParseInt + 1);
      expect(secondParseInt).toBeGreaterThan(-1);
      const block = source.slice(secondParseInt, secondParseInt + 300);
      expect(block).toMatch(/\.length\s*>/);
    });
  });

  // =========================================================================
  // #2 HIGH — lc-solver.ts evaluateWithBinding parseFloat missing length check
  // =========================================================================
  describe("#2 — evaluateWithBinding parseFloat should validate string length", () => {
    it("should check string length before parseFloat in evaluateWithBinding", () => {
      const source = readFileSync("src/logic/lc-solver.ts", "utf-8");
      const firstParseFloat = source.indexOf('case "parseFloat"');
      expect(firstParseFloat).toBeGreaterThan(-1);
      const secondParseFloat = source.indexOf('case "parseFloat"', firstParseFloat + 1);
      expect(secondParseFloat).toBeGreaterThan(-1);
      const block = source.slice(secondParseFloat, secondParseFloat + 300);
      expect(block).toMatch(/\.length\s*>/);
    });
  });
});
