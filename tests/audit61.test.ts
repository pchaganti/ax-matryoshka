/**
 * Audit #61 — TDD tests for 10 issues
 * These tests should FAIL before the fixes and PASS after.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";

describe("Audit #61", () => {
  // =========================================================================
  // #1 HIGH — lc-parser parseTerm no recursion depth limit
  // =========================================================================
  describe("#1 — parseTerm should have recursion depth limit", () => {
    it("should track and limit parse depth", () => {
      const source = readFileSync("src/logic/lc-parser.ts", "utf-8");
      const fnStart = source.indexOf("function parseTerm(");
      expect(fnStart).toBeGreaterThan(-1);
      const block = source.slice(fnStart, fnStart + 300);
      expect(block).toMatch(/MAX_PARSE_DEPTH|depth\s*>/i);
    });
  });

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
  // #3 MEDIUM — rlm.ts ReDoS-prone regex for JSON array matching
  // =========================================================================
  describe("#3 — generateClassifierGuidance should limit JSON search scope", () => {
    it("should cap fullLog length before regex match", () => {
      const source = readFileSync("src/rlm.ts", "utf-8");
      const guidanceStart = source.indexOf("generateClassifierGuidance");
      expect(guidanceStart).toBeGreaterThan(-1);
      const block = source.slice(guidanceStart, guidanceStart + 500);
      expect(block).toMatch(/\.slice\(0|MAX_LOG|fullLog\.length/i);
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
  // #6 MEDIUM — nucleus.ts escapeForSexp no input length cap
  // =========================================================================
  describe("#6 — escapeForSexp should cap input length", () => {
    it("should limit string length before escaping", () => {
      const source = readFileSync("src/adapters/nucleus.ts", "utf-8");
      const fnStart = source.indexOf("function escapeForSexp");
      expect(fnStart).toBeGreaterThan(-1);
      const block = source.slice(fnStart, fnStart + 300);
      expect(block).toMatch(/\.length|MAX_ESCAPE|\.slice\(0/i);
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

  // =========================================================================
  // #9 MEDIUM — symbol-extractor getSignature split should use limit
  // =========================================================================
  describe("#9 — getSignature split should limit line count", () => {
    it("should pass a limit to split()", () => {
      const source = readFileSync("src/treesitter/symbol-extractor.ts", "utf-8");
      const sigStart = source.indexOf("private getSignature");
      expect(sigStart).toBeGreaterThan(-1);
      const block = source.slice(sigStart, sigStart + 600);
      // split("\n", limit) or split("\n").slice(0, N)
      expect(block).toMatch(/split\("\\n",\s*\d+\)|split\("\\n"\)\.slice/);
    });
  });

  // =========================================================================
  // #10 MEDIUM — storeSymbol should validate parentSymbolId
  // =========================================================================
  describe("#10 — storeSymbol should validate parentSymbolId", () => {
    it("should check parentSymbolId is finite if provided", () => {
      const source = readFileSync("src/persistence/session-db.ts", "utf-8");
      const fnStart = source.indexOf("storeSymbol(");
      expect(fnStart).toBeGreaterThan(-1);
      const block = source.slice(fnStart, fnStart + 1000);
      expect(block).toMatch(/parentSymbolId.*isFinite|isFinite.*parentSymbolId|parentSymbolId.*Integer/i);
    });
  });
});
