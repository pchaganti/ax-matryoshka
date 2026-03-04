/**
 * Audit #46 — TDD tests for 10 issues
 * These tests should FAIL before the fixes and PASS after.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";

describe("Audit #46", () => {
  // =========================================================================
  // #1 HIGH — evalo/compile.ts: compiled parseFloat missing isFinite guard
  // =========================================================================
  describe("#1 — compiled parseFloat should guard against Infinity", () => {
    it("should check isFinite in compiled parseFloat", () => {
      const source = readFileSync("src/synthesis/evalo/compile.ts", "utf-8");
      const parseFloatCase = source.match(/case "parseFloat"[\s\S]*?case "add"/);
      expect(parseFloatCase).not.toBeNull();
      expect(parseFloatCase![0]).toMatch(/isFinite/);
    });
  });

  // =========================================================================
  // #2 HIGH — lc-compiler.ts: compiler parseFloat missing isFinite guard
  // =========================================================================
  describe("#2 — lc-compiler parseFloat should guard against Infinity", () => {
    it("should check isFinite in compiled parseFloat", () => {
      const source = readFileSync("src/logic/lc-compiler.ts", "utf-8");
      const parseFloatCase = source.match(/case "parseFloat"[\s\S]*?case "if"/);
      expect(parseFloatCase).not.toBeNull();
      expect(parseFloatCase![0]).toMatch(/isFinite/);
    });
  });

  // =========================================================================
  // #3 HIGH — lc-interpreter.ts: coerce number missing isFinite
  // =========================================================================
  describe("#3 — lc-interpreter coerce number should check isFinite", () => {
    it("should guard against Infinity in number coercion", () => {
      const source = readFileSync("src/logic/lc-interpreter.ts", "utf-8");
      const coerceCase = source.match(/case "coerce"[\s\S]*?case "number"[\s\S]*?case "string"/);
      expect(coerceCase).not.toBeNull();
      expect(coerceCase![0]).toMatch(/isFinite/);
    });
  });

  // =========================================================================
  // #4 HIGH — lc-solver.ts: parseNumber scientific notation missing isFinite
  // =========================================================================
  describe("#4 — lc-solver parseNumber should check isFinite on scientific notation", () => {
    it("should guard against Infinity from scientific notation", () => {
      const source = readFileSync("src/logic/lc-solver.ts", "utf-8");
      const sciNotation = source.match(/scientific notation[\s\S]*?return.*parseFloat|scientific notation[\s\S]*?isFinite/);
      expect(sciNotation).not.toBeNull();
      expect(sciNotation![0]).toMatch(/isFinite/);
    });
  });

  // =========================================================================
  // #5 HIGH — predicate-compiler: ++/-- not blocked
  // =========================================================================
  describe("#5 — predicate-compiler should block increment/decrement operators", () => {
    it("should have a check for ++ and -- operators", () => {
      const source = readFileSync("src/persistence/predicate-compiler.ts", "utf-8");
      expect(source).toMatch(/\+\+|--.*not allowed|increment|decrement/i);
    });
  });

  // =========================================================================
  // #6 MEDIUM — lc-compiler replace: from pattern not validated with validateRegex
  // =========================================================================
  describe("#6 — lc-compiler replace should validate regex pattern", () => {
    it("should call validateRegex on from pattern", () => {
      const source = readFileSync("src/logic/lc-compiler.ts", "utf-8");
      const replaceCase = source.match(/case "replace"[\s\S]*?case "split"/);
      expect(replaceCase).not.toBeNull();
      expect(replaceCase![0]).toMatch(/validateRegex/);
    });
  });

  // =========================================================================
  // #7 MEDIUM — predicate-compiler: spread operator not blocked
  // =========================================================================
  describe("#7 — predicate-compiler should block spread operator", () => {
    it("should check for spread operator", () => {
      const source = readFileSync("src/persistence/predicate-compiler.ts", "utf-8");
      expect(source).toMatch(/\.\.\.|spread/i);
      const spreadBlock = source.match(/spread|\.\.\..*not allowed/i);
      expect(spreadBlock).not.toBeNull();
    });
  });

  // =========================================================================
  // #8 MEDIUM — predicate-compiler: void operator not blocked
  // =========================================================================
  describe("#8 — predicate-compiler should block void operator", () => {
    it("should include void in dangerous patterns", () => {
      const source = readFileSync("src/persistence/predicate-compiler.ts", "utf-8");
      expect(source).toMatch(/\\bvoid\\b/);
    });
  });

  // =========================================================================
  // #9 MEDIUM — nucleus-engine: grep pattern length not validated
  // =========================================================================
  describe("#9 — nucleus-engine grep should validate pattern length", () => {
    it("should check pattern length before RegExp construction", () => {
      const source = readFileSync("src/engine/nucleus-engine.ts", "utf-8");
      const grepSection = source.match(/grep:\s*\(pattern[\s\S]*?new RegExp/);
      expect(grepSection).not.toBeNull();
      expect(grepSection![0]).toMatch(/pattern\.length|MAX_PATTERN|length\s*>/);
    });
  });

  // =========================================================================
  // #10 MEDIUM — lc-solver: percent coercion propagates Infinity
  // =========================================================================
  describe("#10 — lc-solver percent coercion should guard against Infinity", () => {
    it("should check isFinite in parseNumber or percent case", () => {
      const source = readFileSync("src/logic/lc-solver.ts", "utf-8");
      const parseNumberFn = source.match(/function parseNumber[\s\S]*?\n\}/);
      expect(parseNumberFn).not.toBeNull();
      // parseNumber itself should validate all return paths with isFinite
      expect(parseNumberFn![0]).toMatch(/isFinite/);
    });
  });
});
