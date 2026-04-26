/**
 * Audit #66 — TDD tests for 10 issues
 * These tests should FAIL before the fixes and PASS after.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";

describe("Audit #66", () => {
  // =========================================================================
  // #1 HIGH — predicate-compiler validateAndCompile no code length cap
  // =========================================================================
  describe("#1 — validateAndCompile should cap code length", () => {
    it("should check code.length before processing", () => {
      const source = readFileSync("src/persistence/predicate-compiler.ts", "utf-8");
      const fnStart = source.indexOf("private validateAndCompile(");
      expect(fnStart).toBeGreaterThan(-1);
      const block = source.slice(fnStart, fnStart + 400);
      expect(block).toMatch(/MAX_CODE_LENGTH|code\.length\s*>/i);
    });
  });

  // =========================================================================
  // #2 HIGH — verifier verifyInvariant no invariant length cap
  // =========================================================================
  describe("#2 — verifyInvariant should cap invariant length", () => {
    it("should check invariant.length before processing", () => {
      const source = readFileSync("src/constraints/verifier.ts", "utf-8");
      const fnStart = source.indexOf("function verifyInvariant(");
      if (fnStart === -1) {
        const altStart = source.indexOf("export function verifyInvariant(");
        expect(altStart).toBeGreaterThan(-1);
        const block = source.slice(altStart, altStart + 400);
        expect(block).toMatch(/MAX_INVARIANT|invariant\.length\s*>/i);
      } else {
        const block = source.slice(fnStart, fnStart + 400);
        expect(block).toMatch(/MAX_INVARIANT|invariant\.length\s*>/i);
      }
    });
  });

  // =========================================================================
  // #3 HIGH — symbol-extractor unbounded symbols array growth
  // =========================================================================
  describe("#3 — extractSymbols should cap total symbols", () => {
    it("should have MAX_SYMBOLS_COUNT or length check in walkTree", () => {
      const source = readFileSync("src/treesitter/symbol-extractor.ts", "utf-8");
      const walkStart = source.indexOf("private walkTree(");
      expect(walkStart).toBeGreaterThan(-1);
      const block = source.slice(walkStart, walkStart + 600);
      expect(block).toMatch(/MAX_SYMBOLS_COUNT|symbols\.length\s*>|symbols\.length\s*>=/i);
    });
  });

  // =========================================================================
  // #4 HIGH — evalo split with empty delimiter DoS
  // =========================================================================
  describe("#4 — evalo split should reject empty delimiter", () => {
    it("should check delimiter is non-empty before split", () => {
      const source = readFileSync("src/synthesis/evalo/evalo.ts", "utf-8");
      const splitCase = source.indexOf('case "split"');
      expect(splitCase).toBeGreaterThan(-1);
      const block = source.slice(splitCase, splitCase + 300);
      expect(block).toMatch(/!extractor\.delim|delim\.length\s*===?\s*0|delim\s*===?\s*""/i);
    });
  });

  // =========================================================================
  // #5 MEDIUM — symbol-extractor negative position values
  // =========================================================================
  describe("#5 — extractSymbolFromNode should clamp negative positions", () => {
    it("should use Math.max to prevent line 0 or negative columns", () => {
      const source = readFileSync("src/treesitter/symbol-extractor.ts", "utf-8");
      const fnStart = source.indexOf("extractSymbolFromNode");
      expect(fnStart).toBeGreaterThan(-1);
      const posStart = source.indexOf("startLine:", fnStart);
      expect(posStart).toBeGreaterThan(-1);
      const block = source.slice(posStart, posStart + 300);
      expect(block).toMatch(/Math\.max/);
    });
  });

  // =========================================================================
  // #6 MEDIUM — grammar-config moduleExport field not validated
  // =========================================================================
  describe("#6 — addCustomGrammar should validate moduleExport", () => {
    it("should check moduleExport for dangerous names", () => {
      const source = readFileSync("src/config/grammar-config.ts", "utf-8");
      const fnStart = source.indexOf("function addCustomGrammar(");
      expect(fnStart).toBeGreaterThan(-1);
      const block = source.slice(fnStart, fnStart + 1500);
      expect(block).toMatch(/moduleExport.*DANGEROUS|DANGEROUS.*moduleExport|moduleExport.*typeof/i);
    });
  });

  // =========================================================================
  // #7 MEDIUM — grammar-config symbol values not validated
  // =========================================================================
  describe("#7 — addCustomGrammar should validate symbol kind values", () => {
    it("should check symbol values against valid kinds", () => {
      const source = readFileSync("src/config/grammar-config.ts", "utf-8");
      const fnStart = source.indexOf("function addCustomGrammar(");
      expect(fnStart).toBeGreaterThan(-1);
      const block = source.slice(fnStart, fnStart + 1500);
      expect(block).toMatch(/VALID_KINDS|VALID_SYMBOL|validKind/i);
    });
  });

  // =========================================================================
  // #10 MEDIUM — language-map DANGEROUS_KEYS incomplete vs parser-registry
  // =========================================================================
  describe("#10 — getAllLanguageConfigs DANGEROUS_KEYS should include toString/valueOf", () => {
    it("should block hasOwnProperty/toString/valueOf in language keys", () => {
      const source = readFileSync("src/treesitter/language-map.ts", "utf-8");
      const keysStart = source.indexOf("DANGEROUS_LANG_KEYS");
      expect(keysStart).toBeGreaterThan(-1);
      const block = source.slice(keysStart, keysStart + 400);
      expect(block).toMatch(/hasOwnProperty|toString|valueOf/);
    });
  });
});
