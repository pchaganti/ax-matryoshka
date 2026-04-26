/**
 * Audit #61 — TDD tests for 10 issues
 * These tests should FAIL before the fixes and PASS after.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";

describe("Audit #61", () => {

  // =========================================================================
  // #2 HIGH — compile.ts match calls .match() on potentially null strCode
  // =========================================================================
  describe("#2 — compiled match should guard against non-string input", () => {
    it("should wrap match in typeof string check", () => {
      const source = readFileSync("src/synthesis/evalo/compile.ts", "utf-8");
      const matchCase = source.match(/case "match"[\s\S]*?\.match\(new RegExp/);
      expect(matchCase).not.toBeNull();
      expect(matchCase![0]).toMatch(/typeof.*!==?\s*"string"|typeof.*string/);
    });
  });

  // =========================================================================
  // #4 MEDIUM — grammar-config addCustomGrammar no extensions array validation
  // =========================================================================
  describe("#4 — addCustomGrammar should validate extensions array", () => {
    it("should check extensions array bounds and format", () => {
      const source = readFileSync("src/config/grammar-config.ts", "utf-8");
      const fnStart = source.indexOf("function addCustomGrammar");
      expect(fnStart).toBeGreaterThan(-1);
      const block = source.slice(fnStart, fnStart + 600);
      expect(block).toMatch(/extensions\.length|MAX_EXT|Array\.isArray.*extensions/i);
    });
  });

  // =========================================================================
  // #5 MEDIUM — sugar.ts sweetenPair listLen never incremented
  // =========================================================================
  describe("#5 — sweetenPair should increment listLen in recursion", () => {
    it("should pass incremented listLen through recursive calls", () => {
      const source = readFileSync("src/minikanren/sugar.ts", "utf-8");
      const fnStart = source.indexOf("function sweetenPair");
      expect(fnStart).toBeGreaterThan(-1);
      const block = source.slice(fnStart, fnStart + 400);
      expect(block).toMatch(/listLen\s*\+\s*1|listLen\s*\+\+/);
    });
  });

  // =========================================================================
  // #7 MEDIUM — storeSymbol no length limit on symbol.name
  // =========================================================================
  describe("#7 — storeSymbol should validate symbol.name length", () => {
    it("should enforce max name length", () => {
      const source = readFileSync("src/persistence/session-db.ts", "utf-8");
      const fnStart = source.indexOf("storeSymbol(");
      expect(fnStart).toBeGreaterThan(-1);
      const block = source.slice(fnStart, fnStart + 600);
      expect(block).toMatch(/name\.length|MAX_NAME|MAX_SYMBOL/i);
    });
  });

  // =========================================================================
  // #8 MEDIUM — storeSymbol no length limit on symbol.signature
  // =========================================================================
  describe("#8 — storeSymbol should validate signature length", () => {
    it("should enforce max signature length", () => {
      const source = readFileSync("src/persistence/session-db.ts", "utf-8");
      const fnStart = source.indexOf("storeSymbol(");
      expect(fnStart).toBeGreaterThan(-1);
      const block = source.slice(fnStart, fnStart + 600);
      expect(block).toMatch(/signature\.length|MAX_SIG/i);
    });
  });

});
