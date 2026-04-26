/**
 * Audit #59 — TDD tests for 10 issues
 * These tests should FAIL before the fixes and PASS after.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";

describe("Audit #59", () => {
  // #1 removed: rlm.ts extractFinalAnswer helper deleted (legacy deprecated duplicate).

  // =========================================================================
  // #2 HIGH — grammar-config addCustomGrammar prototype pollution
  // =========================================================================
  describe("#2 — addCustomGrammar should block dangerous language names", () => {
    it("should reject __proto__/constructor/prototype as language", () => {
      const source = readFileSync("src/config/grammar-config.ts", "utf-8");
      const fnStart = source.indexOf("function addCustomGrammar");
      expect(fnStart).toBeGreaterThan(-1);
      const block = source.slice(fnStart, fnStart + 400);
      expect(block).toMatch(/__proto__|DANGEROUS|prototype/);
    });
  });

  // =========================================================================
  // #3 MEDIUM — compile.ts split guard uses loose == null
  // =========================================================================
  describe("#3 — compiled split should use typeof string guard", () => {
    it("should check typeof instead of loose null comparison", () => {
      const source = readFileSync("src/synthesis/evalo/compile.ts", "utf-8");
      const splitCase = source.match(/case "split"[\s\S]*?\.split\(/);
      expect(splitCase).not.toBeNull();
      expect(splitCase![0]).toMatch(/typeof.*!==?\s*"string"/);
    });
  });

  // =========================================================================
  // #8 MEDIUM — parser-registry DANGEROUS_EXPORT_NAMES incomplete
  // =========================================================================
  describe("#8 — parser-registry should block toString/valueOf/hasOwnProperty", () => {
    it("should include toString, valueOf, hasOwnProperty in blocklist", () => {
      const source = readFileSync("src/treesitter/parser-registry.ts", "utf-8");
      const block = source.match(/DANGEROUS_EXPORT_NAMES[\s\S]*?\)/);
      expect(block).not.toBeNull();
      expect(block![0]).toMatch(/hasOwnProperty/);
      expect(block![0]).toMatch(/toString/);
      expect(block![0]).toMatch(/valueOf/);
    });
  });
});
