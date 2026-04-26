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

  // =========================================================================
  // #3 HIGH — lc-solver.ts evaluateWithBinding split missing delim length cap
  // =========================================================================
  describe("#3 — evaluateWithBinding split should cap delimiter length", () => {
    it("should check delimiter length in evaluateWithBinding split", () => {
      const source = readFileSync("src/logic/lc-solver.ts", "utf-8");
      const firstSplit = source.indexOf('case "split"');
      expect(firstSplit).toBeGreaterThan(-1);
      const secondSplit = source.indexOf('case "split"', firstSplit + 1);
      expect(secondSplit).toBeGreaterThan(-1);
      const block = source.slice(secondSplit, secondSplit + 300);
      expect(block).toMatch(/delim\.length\s*>\s*\d{2,}/);
    });
  });

  // =========================================================================
  // #8 MEDIUM — evalo.ts synthesizeExtractor no max examples cap
  // =========================================================================
  describe("#8 — synthesizeExtractor should cap examples count", () => {
    it("should have MAX_EXAMPLES or length check", () => {
      const source = readFileSync("src/synthesis/evalo/evalo.ts", "utf-8");
      const fnStart = source.indexOf("export function synthesizeExtractor(");
      expect(fnStart).toBeGreaterThan(-1);
      const block = source.slice(fnStart, fnStart + 400);
      expect(block).toMatch(/MAX_EXAMPLES|examples\.length\s*>\s*\d{2,}/);
    });
  });

  // =========================================================================
  // #9 MEDIUM — http.ts timeoutSeconds multiplication overflow
  // =========================================================================
  // #10 MEDIUM — lc-parser.ts classify examples loop unbounded
  // =========================================================================
  describe("#10 — lc-parser classify should cap examples count", () => {
    it("should have max examples check in classify loop", () => {
      const source = readFileSync("src/logic/lc-parser.ts", "utf-8");
      const classifyCase = source.indexOf('case "classify"');
      expect(classifyCase).toBeGreaterThan(-1);
      const block = source.slice(classifyCase, classifyCase + 600);
      expect(block).toMatch(/MAX_CLASSIFY|examples\.length\s*>=?\s*\d{2,}/);
    });
  });
});
