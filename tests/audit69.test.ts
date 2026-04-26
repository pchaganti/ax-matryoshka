/**
 * Audit #69 — TDD tests for 10 issues
 * These tests should FAIL before the fixes and PASS after.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";

describe("Audit #69", () => {
  // =========================================================================
  // #1 HIGH — evolutionary validateSolution no code length cap before new Function()
  // =========================================================================
  describe("#1 — validateSolution should cap code length", () => {
    it("should check code.length before new Function()", () => {
      const source = readFileSync("src/synthesis/evolutionary.ts", "utf-8");
      const fnStart = source.indexOf("validateSolution(\n");
      expect(fnStart).toBeGreaterThan(-1);
      const block = source.slice(fnStart, fnStart + 400);
      expect(block).toMatch(/MAX_CODE|code\.length\s*>/i);
    });
  });

  // =========================================================================
  // #3 HIGH — manager getHints sort uses raw float subtraction
  // =========================================================================
  describe("#3 — getHints sort should use safe comparator", () => {
    it("should not use raw subtraction for score sorting", () => {
      const source = readFileSync("src/rag/manager.ts", "utf-8");
      const sortStart = source.indexOf("Sort by score");
      expect(sortStart).toBeGreaterThan(-1);
      const block = source.slice(sortStart, sortStart + 200);
      // Should NOT use raw subtraction
      const hasRawSubtraction = /\.sort\(\(a,\s*b\)\s*=>\s*b\.score\s*-\s*a\.score\)/.test(block);
      expect(hasRawSubtraction).toBe(false);
    });
  });

  // =========================================================================
  // #4 HIGH — manager getHints topK not validated
  // =========================================================================
  describe("#4 — getHints should validate topK parameter", () => {
    it("should clamp or validate topK to positive integer", () => {
      const source = readFileSync("src/rag/manager.ts", "utf-8");
      const fnStart = source.indexOf("getHints(");
      expect(fnStart).toBeGreaterThan(-1);
      const block = source.slice(fnStart, fnStart + 300);
      expect(block).toMatch(/Math\.max|Math\.min|Math\.floor|topK\s*[<>=]/i);
    });
  });

  // =========================================================================
  // #6 MEDIUM — symbol-extractor no startLine <= endLine validation
  // =========================================================================
  describe("#6 — extractSymbolFromNode should validate startLine <= endLine", () => {
    it("should ensure endLine >= startLine", () => {
      const source = readFileSync("src/treesitter/symbol-extractor.ts", "utf-8");
      const fnStart = source.indexOf("private extractSymbolFromNode(");
      expect(fnStart).toBeGreaterThan(-1);
      const block = source.slice(fnStart, fnStart + 900);
      expect(block).toMatch(/endLine.*startLine|startLine.*endLine|Math\.max.*endLine/i);
    });
  });
});
