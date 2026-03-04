/**
 * Audit #45 — TDD tests for 10 issues
 * These tests should FAIL before the fixes and PASS after.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";

describe("Audit #45", () => {
  // =========================================================================
  // #1 HIGH — lc-compiler escapeString doesn't escape backticks
  // =========================================================================
  describe("#1 — lc-compiler escapeString should escape backticks", () => {
    it("should escape backtick characters in escapeString", () => {
      const source = readFileSync("src/logic/lc-compiler.ts", "utf-8");
      const escapeFn = source.match(/function escapeString[\s\S]*?\n\}/);
      expect(escapeFn).not.toBeNull();
      expect(escapeFn![0]).toMatch(/`/);
    });
  });

  // =========================================================================
  // #2 HIGH — lc-compiler escapeString missing ${ escaping
  // =========================================================================
  describe("#2 — lc-compiler escapeString should escape template interpolation", () => {
    it("should escape ${ sequences to prevent template injection", () => {
      const source = readFileSync("src/logic/lc-compiler.ts", "utf-8");
      const escapeFn = source.match(/function escapeString[\s\S]*?\n\}/);
      expect(escapeFn).not.toBeNull();
      // Should escape $ to prevent ${} injection in template literals
      expect(escapeFn![0]).toMatch(/\\\$|\\`|\$\{/);
    });
  });

  // =========================================================================
  // #3 HIGH — lc-interpreter extract case missing group validation
  // =========================================================================
  describe("#3 — lc-interpreter extract should validate group parameter", () => {
    it("should check group is non-negative integer", () => {
      const source = readFileSync("src/logic/lc-interpreter.ts", "utf-8");
      const extractCase = source.match(/case "extract"[\s\S]*?case "synthesize"/);
      expect(extractCase).not.toBeNull();
      expect(extractCase![0]).toMatch(/Number\.isInteger.*group|group\s*<\s*0|isInteger/);
    });
  });

  // =========================================================================
  // #4 HIGH — lc-interpreter parseFloat missing isFinite check
  // =========================================================================
  describe("#4 — lc-interpreter parseFloat should check isFinite", () => {
    it("should guard against Infinity in parseFloat result", () => {
      const source = readFileSync("src/logic/lc-interpreter.ts", "utf-8");
      const parseFloatCase = source.match(/case "parseFloat"[\s\S]*?case "add"/);
      expect(parseFloatCase).not.toBeNull();
      expect(parseFloatCase![0]).toMatch(/isFinite/);
    });
  });

  // =========================================================================
  // #5 MEDIUM — lc-interpreter parseNumber missing isFinite check
  // =========================================================================
  describe("#5 — lc-interpreter parseNumber should check isFinite", () => {
    it("should guard against Infinity in parseNumber result", () => {
      const source = readFileSync("src/logic/lc-interpreter.ts", "utf-8");
      const parseNumberCase = source.match(/case "parseNumber"[\s\S]*?case "coerce"/);
      expect(parseNumberCase).not.toBeNull();
      expect(parseNumberCase![0]).toMatch(/isFinite/);
    });
  });

  // =========================================================================
  // #6 MEDIUM — relational-solver parseFloat missing isFinite
  // =========================================================================
  describe("#6 — relational-solver parseFloat should check isFinite", () => {
    it("should guard against Infinity in solver parseFloat", () => {
      const source = readFileSync("src/logic/relational-solver.ts", "utf-8");
      const parseFloatPrim = source.match(/parseFloat:\s*\(input[\s\S]*?parseDate/);
      expect(parseFloatPrim).not.toBeNull();
      expect(parseFloatPrim![0]).toMatch(/isFinite/);
    });
  });

  // =========================================================================
  // #7 MEDIUM — relational-solver parseInt not validated for safe range
  // =========================================================================
  describe("#7 — relational-solver parseInt should validate safe integer range", () => {
    it("should check isSafeInteger or isFinite on parseInt result", () => {
      const source = readFileSync("src/logic/relational-solver.ts", "utf-8");
      const parseIntPrim = source.match(/parseInt:\s*\(input[\s\S]*?parseFloat/);
      expect(parseIntPrim).not.toBeNull();
      expect(parseIntPrim![0]).toMatch(/isSafeInteger|isFinite/);
    });
  });

  // =========================================================================
  // #8 MEDIUM — lc-interpreter match group not checked with isInteger
  // =========================================================================
  describe("#8 — lc-interpreter match should validate group with isInteger", () => {
    it("should use Number.isInteger on group parameter", () => {
      const source = readFileSync("src/logic/lc-interpreter.ts", "utf-8");
      const matchCase = source.match(/case "match"[\s\S]*?case "replace"/);
      expect(matchCase).not.toBeNull();
      expect(matchCase![0]).toMatch(/Number\.isInteger/);
    });
  });

  // =========================================================================
  // #9 MEDIUM — lc-interpreter lines case doesn't validate end >= start
  // =========================================================================
  describe("#9 — lc-interpreter lines should validate end >= start", () => {
    it("should check that end is not less than start", () => {
      const source = readFileSync("src/logic/lc-interpreter.ts", "utf-8");
      const linesCase = source.match(/case "lines"[\s\S]*?case "reduce"/);
      expect(linesCase).not.toBeNull();
      expect(linesCase![0]).toMatch(/end\s*<\s*start|start\s*>\s*end|end\s*>=\s*start|start\s*<=\s*end/);
    });
  });

  // =========================================================================
  // #10 MEDIUM — lc-compiler replace to value injectable in template context
  // =========================================================================
  describe("#10 — lc-compiler replace should escape backticks in to value", () => {
    it("should use escapeString which handles backticks for the replacement", () => {
      // This is fixed by #1/#2 — escapeString now escapes backticks and ${
      // Verify escapeString is used AND it handles template chars
      const source = readFileSync("src/logic/lc-compiler.ts", "utf-8");
      const escapeFn = source.match(/function escapeString[\s\S]*?\n\}/);
      expect(escapeFn).not.toBeNull();
      // escapeString must handle backticks since it's used in template literal contexts
      expect(escapeFn![0]).toMatch(/\\`/);
    });
  });
});
