/**
 * Audit #43 — TDD tests for 10 issues
 * These tests should FAIL before the fixes and PASS after.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";

describe("Audit #43", () => {
  // =========================================================================
  // #1 HIGH — predicate-compiler: function keyword not blocked
  // =========================================================================
  describe("#1 — predicate-compiler should block function keyword", () => {
    it("should include function in dangerous patterns or validation", () => {
      const source = readFileSync("src/persistence/predicate-compiler.ts", "utf-8");
      expect(source).toMatch(/\\bfunction\\b/);
    });
  });

  // =========================================================================
  // #2 HIGH — predicate-compiler: assignment operators not blocked
  // =========================================================================
  describe("#2 — predicate-compiler should block assignment operators", () => {
    it("should check for assignment operators in predicates", () => {
      const source = readFileSync("src/persistence/predicate-compiler.ts", "utf-8");
      // Should block = (assignment) while still allowing === and !==
      expect(source).toMatch(/assignment|[^=!<>]=\[^=\]|\+=|-=/i);
    });
  });

  // =========================================================================
  // #3 HIGH — lc-interpreter parseCurrency: comma-only US format misclassified
  // =========================================================================
  describe("#3 — lc-interpreter parseCurrency should handle US comma-only format", () => {
    it("should not treat comma-only values as EU format", () => {
      const source = readFileSync("src/logic/lc-interpreter.ts", "utf-8");
      const parseCurrencyBlock = source.match(/case "parseCurrency"[\s\S]*?case "parseDate"/);
      expect(parseCurrencyBlock).not.toBeNull();
      // Should check if comma position indicates thousands (3-digit groups)
      // or EU decimal (not just lastCommaPos > lastDotPos)
      expect(parseCurrencyBlock![0]).toMatch(/afterLastComma|\.length\s*===\s*3|\.length\s*!==\s*3|digits.*comma|comma.*digits/i);
    });
  });

  // =========================================================================
  // #4 MEDIUM — lc-interpreter add: missing isFinite guard
  // =========================================================================
  describe("#4 — lc-interpreter add should guard against Infinity", () => {
    it("should check isFinite in add case", () => {
      const source = readFileSync("src/logic/lc-interpreter.ts", "utf-8");
      const addCase = source.match(/case "add"[\s\S]*?return left \+ right/);
      expect(addCase).not.toBeNull();
      expect(addCase![0]).toMatch(/isFinite|Number\.isFinite/);
    });
  });

  // =========================================================================
  // #5 MEDIUM — evalo/evalo.ts: JSON.stringify conflates NaN and null
  // =========================================================================
  describe("#5 — evalo synthesizeExtractor should use Object.is for constant check", () => {
    it("should use Object.is instead of JSON.stringify for constant output detection", () => {
      const source = readFileSync("src/synthesis/evalo/evalo.ts", "utf-8");
      // The allSame check should NOT use JSON.stringify for comparison
      expect(source).not.toMatch(/allSame\s*=\s*outputs\.every\([^)]*JSON\.stringify/);
    });
  });

  // =========================================================================
  // #6 MEDIUM — nucleus.ts: paren-balancing ignores strings
  // =========================================================================
  describe("#6 — nucleus adapter extractCode should be string-aware in paren-balancing", () => {
    it("should track string context in paren-balancing loop", () => {
      const source = readFileSync("src/adapters/nucleus.ts", "utf-8");
      // The KNOWN_COMMANDS paren-balancing loop should have inString tracking
      const parenSection = source.match(/KNOWN_COMMANDS[\s\S]*?while[\s\S]*?depth === 0[\s\S]*?break/);
      expect(parenSection).not.toBeNull();
      expect(parenSection![0]).toMatch(/inString/);
    });
  });

  // =========================================================================
  // #7 MEDIUM — handle-session.ts: close() missing engine dispose
  // =========================================================================
  describe("#7 — handle-session close should dispose engine", () => {
    it("should call engine.dispose() in close method", () => {
      const source = readFileSync("src/engine/handle-session.ts", "utf-8");
      const closeMethod = source.match(/close\(\)[\s\S]*?parserRegistry\.dispose/);
      expect(closeMethod).not.toBeNull();
      expect(closeMethod![0]).toMatch(/engine\.dispose/);
    });
  });

  // =========================================================================
  // #8 MEDIUM — evalo/compile.ts + lc-compiler.ts: split negative index
  // =========================================================================
  describe("#8 — split should validate index is non-negative", () => {
    it("evalo compile split should guard negative index", () => {
      const source = readFileSync("src/synthesis/evalo/compile.ts", "utf-8");
      const splitCase = source.match(/case "split"[\s\S]*?case "parseInt"/);
      expect(splitCase).not.toBeNull();
      expect(splitCase![0]).toMatch(/isInteger|< 0|>= 0/);
    });

    it("lc-compiler split should guard negative index", () => {
      const source = readFileSync("src/logic/lc-compiler.ts", "utf-8");
      const splitCase = source.match(/case "split"[\s\S]*?case "parseInt"/);
      expect(splitCase).not.toBeNull();
      expect(splitCase![0]).toMatch(/index < 0|index >= 0|isInteger/);
    });
  });

  // =========================================================================
  // #9 MEDIUM — regex/synthesis.ts: escapeForCharClass missing - escape
  // =========================================================================
  describe("#9 — escapeForCharClass should escape dash character", () => {
    it("should include dash in the escape regex", () => {
      const source = readFileSync("src/synthesis/regex/synthesis.ts", "utf-8");
      const escapeFn = source.match(/function escapeForCharClass[\s\S]*?\n\}/);
      expect(escapeFn).not.toBeNull();
      // Should escape - (dash) inside character classes
      expect(escapeFn![0]).toMatch(/\\-|dash/i);
    });
  });

  // =========================================================================
  // #10 LOW — relational-solver.ts parseCurrencyImpl double-negation
  // =========================================================================
  describe("#10 — parseCurrencyImpl should not allow double-negation", () => {
    it("should not recursively match leading minus after minus", () => {
      const source = readFileSync("src/logic/relational-solver.ts", "utf-8");
      const negMatch = source.match(/negMinusMatch = trimmed\.match\(.*\)/);
      expect(negMatch).not.toBeNull();
      // Should prevent matching another leading minus (e.g., ^-([^-].*)$)
      expect(negMatch![0]).toMatch(/\[\^-\]|\(\?!-\)/);
    });
  });
});
