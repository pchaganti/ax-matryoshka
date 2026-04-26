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
  // #9 MEDIUM — symbol-extractor startPosition accessed without null check
  // =========================================================================
  describe("#9 — symbol-extractor should guard startPosition access", () => {
    it("should check startPosition exists before accessing row", () => {
      const source = readFileSync("src/treesitter/symbol-extractor.ts", "utf-8");
      // Find the first startPosition usage in symbol creation
      const posBlock = source.match(/startLine:\s*(?:node\.startPosition|typeof\s+\w+Row)/);
      expect(posBlock).not.toBeNull();
      // Should have a guard — optional chaining, typeof check, or isFinite
      expect(posBlock![0]).toMatch(/\?\.|startPosition\s*&&|startPosition\s*!=|typeof|isFinite/);
    });
  });

  // =========================================================================
  // #10 MEDIUM — lc-compiler compiled parseInt only checks isNaN
});
