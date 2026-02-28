/**
 * Audit #56 — TDD tests for 10 issues
 * These tests should FAIL before the fixes and PASS after.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";

describe("Audit #56", () => {
  // =========================================================================
  // #1 HIGH — common.ts iota() unbounded array allocation
  // =========================================================================
  describe("#1 — iota should have bounds check on n", () => {
    it("should limit n to a safe maximum", () => {
      const source = readFileSync("src/minikanren/common.ts", "utf-8");
      const iotaFn = source.match(/export function iota[\s\S]*?\n\}/);
      expect(iotaFn).not.toBeNull();
      expect(iotaFn![0]).toMatch(/MAX_IOTA|Math\.min|limit|clamp/i);
    });
  });

  // =========================================================================
  // #2 HIGH — symbol-extractor getSignature node.text null crash
  // =========================================================================
  describe("#2 — getSignature should guard node.text", () => {
    it("should check node.text before using it", () => {
      const source = readFileSync("src/treesitter/symbol-extractor.ts", "utf-8");
      // Should NOT have the unsafe `as string` cast
      expect(source).not.toMatch(/node\.text\s+as\s+string/);
      // Should have a guard before using node.text
      const sigStart = source.indexOf("private getSignature");
      const sigBlock = source.slice(sigStart, sigStart + 400);
      expect(sigBlock).toMatch(/!node\.text|typeof node\.text/);
    });
  });

  // =========================================================================
  // #3 MEDIUM — symbol-extractor nameNode.text/child.text no null check
  // =========================================================================
  describe("#3 — getNodeName should guard .text access", () => {
    it("should validate text property before returning", () => {
      const source = readFileSync("src/treesitter/symbol-extractor.ts", "utf-8");
      const getNodeNameStart = source.indexOf("private getNodeName");
      expect(getNodeNameStart).toBeGreaterThan(-1);
      const block = source.slice(getNodeNameStart, getNodeNameStart + 500);
      // Should not have bare `return nameNode.text;` or `return child.text;`
      // Should have guards like `nameNode.text ?? null` or `if (nameNode.text)`
      expect(block).not.toMatch(/return nameNode\.text;/);
      expect(block).not.toMatch(/return child\.text;/);
    });
  });

  // =========================================================================
  // #4 MEDIUM — extractor tryStructuredExtraction parseFloat missing isFinite
  // =========================================================================
  describe("#4 — tryStructuredExtraction testFn should check isFinite", () => {
    it("should guard parseFloat in structured currency testFn", () => {
      const source = readFileSync("src/synthesis/extractor/synthesis.ts", "utf-8");
      const fnStart = source.indexOf("function tryStructuredExtraction");
      expect(fnStart).toBeGreaterThan(-1);
      const block = source.slice(fnStart, fnStart + 1200);
      // The currency testFn's parseFloat should have isFinite guard
      const testFnMatch = block.match(/testFn.*=[\s\S]*?parseFloat[\s\S]*?null/);
      expect(testFnMatch).not.toBeNull();
      expect(testFnMatch![0]).toMatch(/isFinite/);
    });
  });

  // =========================================================================
  // #5 MEDIUM — evalo split index missing Number.isInteger
  // =========================================================================
  describe("#5 — evalo split should validate index is integer", () => {
    it("should check Number.isInteger on extractor.index", () => {
      const source = readFileSync("src/synthesis/evalo/evalo.ts", "utf-8");
      const splitCase = source.match(/case "split"[\s\S]*?parts\[extractor\.index\]/);
      expect(splitCase).not.toBeNull();
      expect(splitCase![0]).toMatch(/Number\.isInteger|isInteger/);
    });
  });

  // =========================================================================
  // #6 MEDIUM — evalo parseInt missing isSafeInteger
  // =========================================================================
  describe("#6 — evalo parseInt should check isSafeInteger", () => {
    it("should guard parseInt result with isSafeInteger or isFinite", () => {
      const source = readFileSync("src/synthesis/evalo/evalo.ts", "utf-8");
      const parseIntCase = source.match(/case "parseInt"[\s\S]*?isNaN\(intResult\)[\s\S]*?intResult/);
      expect(parseIntCase).not.toBeNull();
      expect(parseIntCase![0]).toMatch(/isSafeInteger|isFinite/);
    });
  });

  // =========================================================================
  // #7 MEDIUM — rlm.ts fuzzy_search limit not validated
  // =========================================================================
  describe("#7 — rlm fuzzy_search should validate limit parameter", () => {
    it("should clamp limit to a valid positive integer", () => {
      const source = readFileSync("src/rlm.ts", "utf-8");
      const fuzzyBlock = source.match(/fuzzy_search:\s*\(query.*?limit.*?\)\s*=>\s*\{[\s\S]*?slice\(0,\s*\w+\)/);
      expect(fuzzyBlock).not.toBeNull();
      expect(fuzzyBlock![0]).toMatch(/Math\.max|Math\.min|Math\.floor|clamp/i);
    });
  });

  // =========================================================================
  // #8 MEDIUM — rlm.ts fuzzyMatch query no length limit
  // =========================================================================
  describe("#8 — rlm fuzzyMatch should limit query length", () => {
    it("should check query length before processing", () => {
      const source = readFileSync("src/rlm.ts", "utf-8");
      const fuzzyFn = source.match(/function fuzzyMatch[\s\S]*?toLowerCase/);
      expect(fuzzyFn).not.toBeNull();
      expect(fuzzyFn![0]).toMatch(/\.length|MAX_QUERY/i);
    });
  });

  // =========================================================================
  // #9 MEDIUM — symbol-extractor startPosition accessed without null check
  // =========================================================================
  describe("#9 — symbol-extractor should guard startPosition access", () => {
    it("should check startPosition exists before accessing row", () => {
      const source = readFileSync("src/treesitter/symbol-extractor.ts", "utf-8");
      // Find the first startPosition usage in symbol creation
      const posBlock = source.match(/startLine:\s*node\.startPosition[^\n]+/);
      expect(posBlock).not.toBeNull();
      // Should have a guard — optional chaining or explicit check
      expect(posBlock![0]).toMatch(/\?\.|startPosition\s*&&|startPosition\s*!=/);
    });
  });

  // =========================================================================
  // #10 MEDIUM — lc-compiler compiled parseInt only checks isNaN
  // =========================================================================
  describe("#10 — lc-compiler parseInt should also check isFinite", () => {
    it("should emit isFinite or isSafeInteger guard", () => {
      const source = readFileSync("src/logic/lc-compiler.ts", "utf-8");
      const parseIntCase = source.match(/case "parseInt"[\s\S]*?isNaN\(_r\)[\s\S]*?_r/);
      expect(parseIntCase).not.toBeNull();
      expect(parseIntCase![0]).toMatch(/isFinite|isSafeInteger/);
    });
  });
});
