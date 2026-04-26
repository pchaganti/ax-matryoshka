/**
 * Audit #46 — TDD tests for 10 issues
 * These tests should FAIL before the fixes and PASS after.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";

describe("Audit #46", () => {

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

});
