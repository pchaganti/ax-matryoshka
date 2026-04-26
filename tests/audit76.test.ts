/**
 * Audit #76 — TDD tests for 10 issues
 * These tests should FAIL before the fixes and PASS after.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";

describe("Audit #76", () => {
  // =========================================================================
  // #1 HIGH — lc-parser.ts string literal parsing has no length cap
  // =========================================================================
  describe("#1 — lc-parser string literal should have length cap", () => {
    it("should cap string literal accumulation", () => {
      const source = readFileSync("src/logic/lc-parser.ts", "utf-8");
      const strLiteral = source.indexOf('let str = ""');
      expect(strLiteral).toBeGreaterThan(-1);
      const block = source.slice(strLiteral, strLiteral + 400);
      expect(block).toMatch(/MAX_STRING|str\.length\s*>=?\s*\d{3,}/);
    });
  });

  // =========================================================================
  // #2 HIGH — lc-interpreter.ts parseFloat missing string length check
  // =========================================================================
  describe("#2 — lc-interpreter parseFloat should validate string length", () => {
    it("should check string length before parseFloat", () => {
      const source = readFileSync("src/logic/lc-interpreter.ts", "utf-8");
      const parseFloatCase = source.indexOf('case "parseFloat"');
      expect(parseFloatCase).toBeGreaterThan(-1);
      const block = source.slice(parseFloatCase, parseFloatCase + 400);
      expect(block).toMatch(/\.length\s*>/);
    });
  });

  // =========================================================================
  // #3 HIGH — lc-interpreter.ts parseInt missing string length check
  // =========================================================================
  describe("#3 — lc-interpreter parseInt should validate string length", () => {
    it("should check string length before parseInt", () => {
      const source = readFileSync("src/logic/lc-interpreter.ts", "utf-8");
      const parseIntCase = source.indexOf('case "parseInt"');
      expect(parseIntCase).toBeGreaterThan(-1);
      const block = source.slice(parseIntCase, parseIntCase + 400);
      expect(block).toMatch(/\.length\s*>/);
    });
  });

  // =========================================================================
  // #4 MEDIUM — lc-solver.ts parseInt missing string length check
  // =========================================================================
  describe("#4 — lc-solver parseInt should validate string length", () => {
    it("should check string length before parseInt", () => {
      const source = readFileSync("src/logic/lc-solver.ts", "utf-8");
      const parseIntCase = source.indexOf('case "parseInt"');
      expect(parseIntCase).toBeGreaterThan(-1);
      const block = source.slice(parseIntCase, parseIntCase + 300);
      expect(block).toMatch(/\.length\s*>/);
    });
  });

  // =========================================================================
  // #5 MEDIUM — lc-solver.ts parseFloat missing string length check
  // =========================================================================
  describe("#5 — lc-solver parseFloat should validate string length", () => {
    it("should check string length before parseFloat", () => {
      const source = readFileSync("src/logic/lc-solver.ts", "utf-8");
      const parseFloatCase = source.indexOf('case "parseFloat"');
      expect(parseFloatCase).toBeGreaterThan(-1);
      const block = source.slice(parseFloatCase, parseFloatCase + 300);
      expect(block).toMatch(/\.length\s*>/);
    });
  });

  // =========================================================================
  // #7 MEDIUM — lc-interpreter.ts coerce "number" missing string length check
  // =========================================================================
  describe("#7 — lc-interpreter coerce number should validate string length", () => {
    it("should check string length before parseFloat in coerce", () => {
      const source = readFileSync("src/logic/lc-interpreter.ts", "utf-8");
      const coerceCase = source.indexOf('case "coerce"');
      expect(coerceCase).toBeGreaterThan(-1);
      const block = source.slice(coerceCase, coerceCase + 400);
      expect(block).toMatch(/\.length\s*>|MAX_COERCE/);
    });
  });

  // =========================================================================
  // #10 MEDIUM — lc-solver.ts split missing delimiter length cap
  // =========================================================================
  describe("#10 — lc-solver split should cap delimiter length", () => {
    it("should check delimiter length", () => {
      const source = readFileSync("src/logic/lc-solver.ts", "utf-8");
      const splitCase = source.indexOf('case "split"');
      expect(splitCase).toBeGreaterThan(-1);
      const block = source.slice(splitCase, splitCase + 400);
      expect(block).toMatch(/delim\.length\s*>\s*\d{2,}/);
    });
  });
});
