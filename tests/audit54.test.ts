/**
 * Audit #54 — TDD tests for 10 issues
 * These tests should FAIL before the fixes and PASS after.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";

describe("Audit #54", () => {
  // =========================================================================
  // #1 HIGH — relational-solver index primitive missing integer/bounds check
  // =========================================================================
  describe("#1 — relational-solver index should validate index", () => {
    it("should check integer and non-negative on index primitive", () => {
      const source = readFileSync("src/logic/relational-solver.ts", "utf-8");
      const indexCase = source.match(/index:\s*\(input,\s*args\)\s*=>\s*\{[\s\S]*?input\[idx\]/);
      expect(indexCase).not.toBeNull();
      expect(indexCase![0]).toMatch(/Number\.isInteger|isInteger|idx\s*<\s*0/);
    });
  });

  // =========================================================================
  // #2 HIGH — relational-solver match missing negative group check
  // =========================================================================
  describe("#2 — relational-solver match should reject negative group", () => {
    it("should guard against negative group index", () => {
      const source = readFileSync("src/logic/relational-solver.ts", "utf-8");
      const matchCase = source.match(/match:\s*\(input,\s*args\)\s*=>\s*\{[\s\S]*?result\[group\]/);
      expect(matchCase).not.toBeNull();
      expect(matchCase![0]).toMatch(/group\s*<\s*0/);
    });
  });

  // =========================================================================
  // #3 HIGH — extractor currency_integer template missing isNaN guard
  // =========================================================================
  describe("#3 — extractor currency_integer should guard NaN", () => {
    it("should include isNaN or isFinite in testFn", () => {
      const source = readFileSync("src/synthesis/extractor/synthesis.ts", "utf-8");
      const currIntBlock = source.match(/name:\s*"currency_integer"[\s\S]*?testFn:\s*\(s\)\s*=>[^}]+/);
      expect(currIntBlock).not.toBeNull();
      expect(currIntBlock![0]).toMatch(/isNaN|isFinite/);
    });
  });

  // =========================================================================
  // #4 HIGH — extractor currency_decimal template missing isFinite guard
  // =========================================================================
  describe("#4 — extractor currency_decimal should guard Infinity", () => {
    it("should include isFinite in testFn", () => {
      const source = readFileSync("src/synthesis/extractor/synthesis.ts", "utf-8");
      const currDecBlock = source.match(/name:\s*"currency_decimal"[\s\S]*?testFn:\s*\(s\)\s*=>[^}]+/);
      expect(currDecBlock).not.toBeNull();
      expect(currDecBlock![0]).toMatch(/isFinite/);
    });
  });

  // =========================================================================
  // #5 HIGH — extractor percentage_to_decimal template missing isFinite guard
  // =========================================================================
  describe("#5 — extractor percentage_to_decimal should guard Infinity", () => {
    it("should include isFinite in testFn", () => {
      const source = readFileSync("src/synthesis/extractor/synthesis.ts", "utf-8");
      const pctBlock = source.match(/name:\s*"percentage_to_decimal"[\s\S]*?testFn:\s*\(s\)\s*=>[^}]+/);
      expect(pctBlock).not.toBeNull();
      expect(pctBlock![0]).toMatch(/isFinite/);
    });
  });

  // =========================================================================
  // #6 MEDIUM — minikanren occursIn unbounded recursion
  // =========================================================================
  describe("#6 — occursIn should have depth limit", () => {
    it("should include a depth parameter", () => {
      const source = readFileSync("src/minikanren/unify.ts", "utf-8");
      const occursInFn = source.match(/const occursIn[\s\S]*?occursIn\(/);
      expect(occursInFn).not.toBeNull();
      expect(occursInFn![0]).toMatch(/depth|MAX_DEPTH|limit/i);
    });
  });

  // =========================================================================
  // #7 MEDIUM — minikanren reifyComp unbounded recursion
  // =========================================================================
  describe("#7 — reifyComp should have depth limit", () => {
    it("should include a depth parameter or limit", () => {
      const source = readFileSync("src/minikanren/reify.ts", "utf-8");
      const reifyCompFn = source.match(/function reifyComp[\s\S]*?reifyS\(/);
      expect(reifyCompFn).not.toBeNull();
      expect(reifyCompFn![0]).toMatch(/depth|MAX_DEPTH|limit/i);
    });
  });

  // =========================================================================
  // #8 MEDIUM — minikanren walk no depth limit
  // =========================================================================
  describe("#8 — walk should have depth limit", () => {
    it("should include a depth guard or iteration limit", () => {
      const source = readFileSync("src/minikanren/common.ts", "utf-8");
      const walkFn = source.match(/export function walk\([\s\S]*?\n\}/);
      expect(walkFn).not.toBeNull();
      expect(walkFn![0]).toMatch(/depth|MAX_WALK|limit|iteration/i);
    });
  });

  // =========================================================================
  // #9 MEDIUM — extractor tryDelimiterFieldExtraction unbounded maxFields
  // =========================================================================
  describe("#9 — tryDelimiterFieldExtraction should limit maxFields", () => {
    it("should clamp maxFields to prevent huge iteration", () => {
      const source = readFileSync("src/synthesis/extractor/synthesis.ts", "utf-8");
      const maxFieldsLine = source.match(/maxFields\s*=[\s\S]*?Math\.max/);
      expect(maxFieldsLine).not.toBeNull();
      expect(maxFieldsLine![0]).toMatch(/Math\.min|MAX_FIELDS|clamp|limit/i);
    });
  });

  // =========================================================================
  // #10 MEDIUM — predicate-compiler Number() without isFinite check
  // =========================================================================
  describe("#10 — predicate-compiler numeric param should check isFinite", () => {
    it("should validate Number(value) is finite before SQL", () => {
      const source = readFileSync("src/persistence/predicate-compiler.ts", "utf-8");
      // Find the numeric comparison block that uses Number(value)
      const numBlock = source.match(/Numeric comparison[\s\S]*?params:\s*\[.*?\]/);
      expect(numBlock).not.toBeNull();
      expect(numBlock![0]).toMatch(/isFinite|Number\.isFinite/);
    });
  });
});
