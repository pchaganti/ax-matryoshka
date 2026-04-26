/**
 * Audit #65 — TDD tests for 10 issues
 * These tests should FAIL before the fixes and PASS after.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";

describe("Audit #65", () => {
  // =========================================================================
  // #1 HIGH — language-map getLanguageConfig proto pollution via configs[language]
  // =========================================================================
  describe("#1 — getLanguageConfig should reject dangerous keys", () => {
    it("should guard against __proto__ and similar keys", () => {
      const source = readFileSync("src/treesitter/language-map.ts", "utf-8");
      const fnStart = source.indexOf("function getLanguageConfig(");
      if (fnStart === -1) {
        const altStart = source.indexOf("export function getLanguageConfig(");
        expect(altStart).toBeGreaterThan(-1);
        const block = source.slice(altStart, altStart + 400);
        expect(block).toMatch(/DANGEROUS|__proto__|hasOwnProperty|Object\.hasOwn/i);
      } else {
        const block = source.slice(fnStart, fnStart + 400);
        expect(block).toMatch(/DANGEROUS|__proto__|hasOwnProperty|Object\.hasOwn/i);
      }
    });
  });

  // =========================================================================
  // #3 MEDIUM — compile.ts prettyPrint unescaped strings in replace/split
  // =========================================================================
  describe("#3 — prettyPrint should escape string values", () => {
    it("should use JSON.stringify or escaping for from/to/delim", () => {
      const source = readFileSync("src/synthesis/evalo/compile.ts", "utf-8");
      const fnStart = source.indexOf("function prettyPrint(");
      if (fnStart === -1) {
        const altStart = source.indexOf("export function prettyPrint(");
        expect(altStart).toBeGreaterThan(-1);
        const block = source.slice(altStart, altStart + 800);
        // replace and split cases should escape their string args
        const replaceCase = block.indexOf("replace");
        expect(replaceCase).toBeGreaterThan(-1);
        // Should use JSON.stringify or escapeStringForLiteral on from/to/delim
        expect(block).toMatch(/JSON\.stringify\(extractor\.from\)|escapeString.*extractor\.from|extractor\.from.*replace/);
      } else {
        const block = source.slice(fnStart, fnStart + 800);
        expect(block).toMatch(/JSON\.stringify\(extractor\.from\)|escapeString.*extractor\.from|extractor\.from.*replace/);
      }
    });
  });

  // =========================================================================
  // #4 MEDIUM — session-db storeSymbol missing kind field validation
  // =========================================================================
  describe("#4 — storeSymbol should validate symbol.kind", () => {
    it("should check kind is a valid string", () => {
      const source = readFileSync("src/persistence/session-db.ts", "utf-8");
      const fnStart = source.indexOf("storeSymbol(");
      expect(fnStart).toBeGreaterThan(-1);
      const block = source.slice(fnStart, fnStart + 600);
      expect(block).toMatch(/symbol\.kind.*typeof|typeof.*symbol\.kind|VALID_KINDS|kind.*includes/i);
    });
  });

  // =========================================================================
  // #5 MEDIUM — session-db storeSymbol startLine/endLine not checked >= 1
  // =========================================================================
  describe("#5 — storeSymbol should check line numbers >= 1", () => {
    it("should reject zero or negative line numbers", () => {
      const source = readFileSync("src/persistence/session-db.ts", "utf-8");
      const fnStart = source.indexOf("storeSymbol(");
      expect(fnStart).toBeGreaterThan(-1);
      const block = source.slice(fnStart, fnStart + 1100);
      expect(block).toMatch(/startLine\s*<\s*1|startLine\s*>=?\s*1|startLine\s*<=?\s*0/);
    });
  });

  // =========================================================================
  // #6 MEDIUM — rag/manager recordFailure error field not length-capped
  // =========================================================================
  describe("#6 — recordFailure should cap error field length", () => {
    it("should limit record.error string length", () => {
      const source = readFileSync("src/rag/manager.ts", "utf-8");
      const fnStart = source.indexOf("recordFailure(");
      expect(fnStart).toBeGreaterThan(-1);
      const block = source.slice(fnStart, fnStart + 500);
      expect(block).toMatch(/record\.error.*length|MAX_ERROR|error.*slice/i);
    });
  });

  // =========================================================================
  // #8 MEDIUM — grammar-config symbols validation accepts arrays
  // =========================================================================
  describe("#8 — grammar-config symbols should reject arrays", () => {
    it("should exclude Array.isArray from symbols check", () => {
      const source = readFileSync("src/config/grammar-config.ts", "utf-8");
      const symbolsCheck = source.indexOf("grammar.symbols && typeof grammar.symbols");
      expect(symbolsCheck).toBeGreaterThan(-1);
      const block = source.slice(symbolsCheck, symbolsCheck + 200);
      expect(block).toMatch(/Array\.isArray/);
    });
  });

  // #9 removed: rlm.ts extractFinalAnswer helper deleted (adapter methods now handle
  // all JSON parsing; adapter-level caps are covered by audit92).

  // =========================================================================
  // #10 MEDIUM — language-map buildExtensionMap no typeof on ext element
  // =========================================================================
  describe("#10 — buildExtensionMap should validate ext is string", () => {
    it("should check typeof ext before toLowerCase", () => {
      const source = readFileSync("src/treesitter/language-map.ts", "utf-8");
      const fnStart = source.indexOf("function buildExtensionMap(");
      expect(fnStart).toBeGreaterThan(-1);
      const block = source.slice(fnStart, fnStart + 400);
      expect(block).toMatch(/typeof ext\s*===?\s*"string"|typeof ext\s*!==?\s*"string"/);
    });
  });
});
