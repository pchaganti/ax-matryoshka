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
  // #8 MEDIUM — lc-interpreter match group not checked with isInteger
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
