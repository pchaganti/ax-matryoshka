/**
 * Audit #44 — TDD tests for 10 issues
 * These tests should FAIL before the fixes and PASS after.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";

describe("Audit #44", () => {
  // =========================================================================
  // #1 HIGH — evalo/compile.ts: compiled add missing isFinite guard
  // =========================================================================
  describe("#1 — compiled add should guard against Infinity result", () => {
    it("should check isFinite on the addition result", () => {
      const source = readFileSync("src/synthesis/evalo/compile.ts", "utf-8");
      const addCase = source.match(/case "add"[\s\S]*?case "if"/);
      expect(addCase).not.toBeNull();
      expect(addCase![0]).toMatch(/isFinite/);
    });
  });

  // =========================================================================
  // #2 HIGH — lc-compiler.ts: match case missing regex validation
  // =========================================================================
  describe("#2 — lc-compiler match should validate regex pattern", () => {
    it("should call validateRegex on the pattern", () => {
      const source = readFileSync("src/logic/lc-compiler.ts", "utf-8");
      const matchCase = source.match(/case "match"[\s\S]*?case "replace"/);
      expect(matchCase).not.toBeNull();
      expect(matchCase![0]).toMatch(/validateRegex/);
    });
  });

  // =========================================================================
  // #3 HIGH — predicate-compiler: .call/.apply/.bind not blocked
  // =========================================================================
  describe("#3 — predicate-compiler should block .call/.apply/.bind", () => {
    it("should have a check for call/apply/bind methods", () => {
      const source = readFileSync("src/persistence/predicate-compiler.ts", "utf-8");
      expect(source).toMatch(/\.call\b|\.apply\b|\.bind\b/);
    });
  });

  // =========================================================================
  // #4 HIGH — relational-solver: float comparison uses !== (breaks 0.1+0.2)
  // =========================================================================
  describe("#4 — relational-solver synthesis should use epsilon for float comparison", () => {
    it("should not use strict inequality for float comparison in candidate evaluation", () => {
      const source = readFileSync("src/logic/relational-solver.ts", "utf-8");
      const evalBlock = source.match(/const result = evaluateComposition[\s\S]*?allMatch = false/);
      expect(evalBlock).not.toBeNull();
      // Should NOT use simple !== for comparing results; should use epsilon or tolerance
      expect(evalBlock![0]).not.toMatch(/result !== output/);
    });
  });

  // =========================================================================
  // #5 MEDIUM — lc-interpreter: split index not validated as integer
  // =========================================================================
  describe("#5 — lc-interpreter split should validate index is integer", () => {
    it("should check Number.isInteger on term.index", () => {
      const source = readFileSync("src/logic/lc-interpreter.ts", "utf-8");
      const splitCase = source.match(/case "split"[\s\S]*?case "parseInt"/);
      expect(splitCase).not.toBeNull();
      expect(splitCase![0]).toMatch(/Number\.isInteger|isInteger/);
    });
  });

  // =========================================================================
  // #6 MEDIUM — lc-interpreter: sum missing cumulative overflow guard
  // =========================================================================
  describe("#6 — lc-interpreter sum should guard cumulative overflow", () => {
    it("should check isFinite on running total", () => {
      const source = readFileSync("src/logic/lc-interpreter.ts", "utf-8");
      const sumCase = source.match(/case "sum"[\s\S]*?return total/);
      expect(sumCase).not.toBeNull();
      // Should check isFinite(total) after accumulation
      expect(sumCase![0]).toMatch(/isFinite\(total\)/);
    });
  });

  // =========================================================================
  // #7 MEDIUM — lc-interpreter: fuzzy_search limit not bounds-checked
  // =========================================================================
  describe("#7 — lc-interpreter fuzzy_search should cap limit", () => {
    it("should clamp limit to a reasonable maximum", () => {
      const source = readFileSync("src/logic/lc-interpreter.ts", "utf-8");
      const fuzzyCase = source.match(/case "fuzzy_search"[\s\S]*?case/);
      expect(fuzzyCase).not.toBeNull();
      // Should have Math.min or max limit check
      expect(fuzzyCase![0]).toMatch(/Math\.min|Math\.max|MAX_|limit.*>|limit.*</);
    });
  });

  // #8 removed: FINAL_VAR parser deleted from the nucleus adapter (legacy marker).

  // =========================================================================
  // #9 MEDIUM — predicate-compiler: comma operator not blocked
  // =========================================================================
  describe("#9 — predicate-compiler should block comma operator", () => {
    it("should check for comma operator in predicates", () => {
      const source = readFileSync("src/persistence/predicate-compiler.ts", "utf-8");
      // Should have a check that blocks comma usage (outside of valid contexts)
      expect(source).toMatch(/comma|,/i);
      // More specifically, should block the comma operator pattern
      const validationSection = source.match(/Block.*comma|comma.*operator|,\s*.*not allowed/i);
      expect(validationSection).not.toBeNull();
    });
  });

  // =========================================================================
  // #10 MEDIUM — lc-compiler: match group not validated as integer
  // =========================================================================
  describe("#10 — lc-compiler match should validate group as non-negative integer", () => {
    it("should check isInteger on group (not just < 0)", () => {
      const source = readFileSync("src/logic/lc-compiler.ts", "utf-8");
      const matchCase = source.match(/case "match"[\s\S]*?case "replace"/);
      expect(matchCase).not.toBeNull();
      // Must validate isInteger — simple < 0 check misses NaN, 1.5, Infinity
      expect(matchCase![0]).toMatch(/Number\.isInteger/);
    });
  });
});
