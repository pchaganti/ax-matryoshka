/**
 * Audit #70 — TDD tests for 10 issues
 * These tests should FAIL before the fixes and PASS after.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";

describe("Audit #70", () => {
  // =========================================================================
  // #1 HIGH — verifier verifyNumberConstraint min/max not validated as finite
  // =========================================================================
  describe("#1 — verifyNumberConstraint should validate constraint.min/max are finite", () => {
    it("should check isFinite on constraint.min or constraint.max", () => {
      const source = readFileSync("src/constraints/verifier.ts", "utf-8");
      const fnStart = source.indexOf("function verifyNumberConstraint(");
      expect(fnStart).toBeGreaterThan(-1);
      const block = source.slice(fnStart, fnStart + 600);
      expect(block).toMatch(/constraint\.min.*isFinite|isFinite.*constraint\.min|Number\.isFinite\(constraint\.min/i);
    });
  });

  // =========================================================================
  // #2 MEDIUM — verifier verifyStringConstraint minLength/maxLength not validated as non-negative integers
  // =========================================================================
  describe("#2 — verifyStringConstraint should validate minLength/maxLength as non-negative integers", () => {
    it("should check isInteger or >= 0 on minLength/maxLength", () => {
      const source = readFileSync("src/constraints/verifier.ts", "utf-8");
      const fnStart = source.indexOf("function verifyStringConstraint(");
      expect(fnStart).toBeGreaterThan(-1);
      const block = source.slice(fnStart, fnStart + 800);
      expect(block).toMatch(/minLength.*isInteger|isInteger.*minLength|minLength.*<\s*0/i);
    });
  });

  // =========================================================================
  // #3 MEDIUM — verifier verifyArrayConstraint minItems/maxItems not validated as non-negative integers
  // =========================================================================
  describe("#3 — verifyArrayConstraint should validate minItems/maxItems as non-negative integers", () => {
    it("should check isInteger or >= 0 on minItems/maxItems", () => {
      const source = readFileSync("src/constraints/verifier.ts", "utf-8");
      const fnStart = source.indexOf("function verifyArrayConstraint(");
      expect(fnStart).toBeGreaterThan(-1);
      const block = source.slice(fnStart, fnStart + 600);
      expect(block).toMatch(/minItems.*isInteger|isInteger.*minItems|minItems.*<\s*0/i);
    });
  });

  // =========================================================================
  // #4 MEDIUM — error-analyzer levenshteinDistance no string length cap
  // =========================================================================
  describe("#4 — levenshteinDistance should cap input string lengths", () => {
    it("should check a.length or b.length before allocating matrix", () => {
      const source = readFileSync("src/feedback/error-analyzer.ts", "utf-8");
      const fnStart = source.indexOf("function levenshteinDistance(");
      expect(fnStart).toBeGreaterThan(-1);
      const block = source.slice(fnStart, fnStart + 300);
      expect(block).toMatch(/MAX_STR|\.length\s*>/i);
    });
  });

  // =========================================================================
  // #5 MEDIUM — error-analyzer findSimilar sort uses float subtraction
  // =========================================================================
  describe("#5 — findSimilar sort should use safe comparator", () => {
    it("should not use raw subtraction for distance sorting", () => {
      const source = readFileSync("src/feedback/error-analyzer.ts", "utf-8");
      const sortStart = source.indexOf(".sort((a, b) =>");
      expect(sortStart).toBeGreaterThan(-1);
      const block = source.slice(sortStart, sortStart + 80);
      const hasRawSubtraction = /\.sort\(\(a,\s*b\)\s*=>\s*a\.distance\s*-\s*b\.distance\)/.test(block);
      expect(hasRawSubtraction).toBe(false);
    });
  });

  // =========================================================================
  // #6 MEDIUM — knowledge-base findSimilar sort uses float subtraction
  // =========================================================================
  describe("#6 — knowledge-base findSimilar sort should use safe comparator", () => {
    it("should not use raw subtraction for weight sorting", () => {
      const source = readFileSync("src/synthesis/knowledge-base.ts", "utf-8");
      const sortStart = source.indexOf("return bWeight - aWeight");
      // If raw subtraction exists, it needs fixing
      expect(sortStart === -1).toBe(true);
    });
  });

  // =========================================================================
  // #7 MEDIUM — synthesis-integrator hashExamples unbounded string concatenation
  // =========================================================================
  describe("#7 — hashExamples should cap input string length", () => {
    it("should check total string length before hashing", () => {
      const source = readFileSync("src/logic/synthesis-integrator.ts", "utf-8");
      const fnStart = source.indexOf("private hashExamples(");
      expect(fnStart).toBeGreaterThan(-1);
      const block = source.slice(fnStart, fnStart + 400);
      expect(block).toMatch(/MAX_HASH_INPUT|str\.length\s*>/i);
    });
  });

  // =========================================================================
  // #8 MEDIUM — synthesis-integrator findCommonPattern unbounded inner loop
  // =========================================================================
  describe("#8 — findCommonPattern should cap first string search length", () => {
    it("should limit first.length before inner loop", () => {
      const source = readFileSync("src/logic/synthesis-integrator.ts", "utf-8");
      const fnStart = source.indexOf("private findCommonPattern(");
      expect(fnStart).toBeGreaterThan(-1);
      const block = source.slice(fnStart, fnStart + 500);
      expect(block).toMatch(/MAX_SEARCH|Math\.min.*first\.length|capped|first\.slice/i);
    });
  });

  // =========================================================================
  // #9 MEDIUM — predicate-compiler toSQLCondition no length validation
  // =========================================================================
  describe("#9 — toSQLCondition should validate predicate length", () => {
    it("should check predicate.length before processing", () => {
      const source = readFileSync("src/persistence/predicate-compiler.ts", "utf-8");
      const fnStart = source.indexOf("toSQLCondition(");
      expect(fnStart).toBeGreaterThan(-1);
      const block = source.slice(fnStart, fnStart + 300);
      expect(block).toMatch(/predicate\.length|MAX_CODE|MAX_PREDICATE/i);
    });
  });

  // =========================================================================
  // #10 MEDIUM — compile.ts escapeStringForLiteral no output length cap
  // =========================================================================
  describe("#10 — escapeStringForLiteral should cap output length", () => {
    it("should check string length before or after escaping", () => {
      const source = readFileSync("src/synthesis/evalo/compile.ts", "utf-8");
      const fnStart = source.indexOf("function escapeStringForLiteral(");
      expect(fnStart).toBeGreaterThan(-1);
      const block = source.slice(fnStart, fnStart + 400);
      expect(block).toMatch(/MAX_ESCAPE|str\.length|\.length\s*>/i);
    });
  });
});
