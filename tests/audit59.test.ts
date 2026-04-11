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
  // #4 MEDIUM — session-db storeSymbol missing isFinite on line numbers
  // =========================================================================
  describe("#4 — storeSymbol should validate line numbers", () => {
    it("should check isFinite on startLine/endLine", () => {
      const source = readFileSync("src/persistence/session-db.ts", "utf-8");
      const fnStart = source.indexOf("storeSymbol(");
      expect(fnStart).toBeGreaterThan(-1);
      const block = source.slice(fnStart, fnStart + 1100);
      expect(block).toMatch(/is(?:Finite|SafeInteger).*startLine|startLine.*is(?:Finite|SafeInteger)|Number\.is(?:Finite|SafeInteger)/);
    });
  });

  // =========================================================================
  // #5 MEDIUM — session-db getSymbolsAtLine missing isFinite check
  // =========================================================================
  describe("#5 — getSymbolsAtLine should validate line parameter", () => {
    it("should check isFinite on line parameter", () => {
      const source = readFileSync("src/persistence/session-db.ts", "utf-8");
      const fnStart = source.indexOf("getSymbolsAtLine(");
      expect(fnStart).toBeGreaterThan(-1);
      const block = source.slice(fnStart, fnStart + 300);
      expect(block).toMatch(/isFinite|Number\.isFinite/);
    });
  });

  // =========================================================================
  // #6 MEDIUM — symbol-extractor nameNode.text no length limit
  // =========================================================================
  describe("#6 — getNodeName should limit returned text length", () => {
    it("should check text length before returning", () => {
      const source = readFileSync("src/treesitter/symbol-extractor.ts", "utf-8");
      const fnStart = source.indexOf("private getNodeName");
      expect(fnStart).toBeGreaterThan(-1);
      const block = source.slice(fnStart, fnStart + 600);
      expect(block).toMatch(/text\.length|MAX_NAME/i);
    });
  });

  // =========================================================================
  // #7 MEDIUM — nucleus.ts extractJson no depth limit
  // =========================================================================
  describe("#7 — extractJson should limit nesting depth", () => {
    it("should cap brace nesting depth", () => {
      const source = readFileSync("src/adapters/nucleus.ts", "utf-8");
      const fnStart = source.indexOf("extractJson");
      expect(fnStart).toBeGreaterThan(-1);
      const block = source.slice(fnStart, fnStart + 900);
      expect(block).toMatch(/MAX_DEPTH|depth\s*>\s*\d+/);
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

  // =========================================================================
  // #9 MEDIUM — predicate-compiler isValidFieldName no length limit
  // =========================================================================
  describe("#9 — isValidFieldName should limit field name length", () => {
    it("should enforce a max length on field names", () => {
      const source = readFileSync("src/persistence/predicate-compiler.ts", "utf-8");
      const fnStart = source.indexOf("isValidFieldName");
      expect(fnStart).toBeGreaterThan(-1);
      const block = source.slice(fnStart, fnStart + 200);
      expect(block).toMatch(/\.length|MAX_FIELD/i);
    });
  });

  // =========================================================================
  // #10 MEDIUM — common.ts keysIn() unbounded key return
  // =========================================================================
  describe("#10 — keysIn should limit number of returned keys", () => {
    it("should cap the number of keys returned", () => {
      const source = readFileSync("src/minikanren/common.ts", "utf-8");
      const fnStart = source.indexOf("function keysIn");
      expect(fnStart).toBeGreaterThan(-1);
      const block = source.slice(fnStart, fnStart + 300);
      expect(block).toMatch(/MAX_KEYS|\.slice\(0/i);
    });
  });
});
