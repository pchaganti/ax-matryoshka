/**
 * Audit #51 — TDD tests for 10 issues
 * These tests should FAIL before the fixes and PASS after.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";

describe("Audit #51", () => {
  // =========================================================================
  // #1 HIGH — relational-solver.ts: parseNumberImpl scientific notation missing isFinite
  // =========================================================================
  describe("#1 — parseNumberImpl scientific notation should check isFinite", () => {
    it("should guard against Infinity from scientific notation", () => {
      const source = readFileSync("src/logic/relational-solver.ts", "utf-8");
      const fnStart = source.indexOf("function parseNumberImpl");
      const fnSource = source.slice(fnStart, fnStart + 800);
      // Find the scientific notation branch
      const sciBlock = fnSource.match(/scientific notation[\s\S]*?parseFloat\(trimmed\)[\s\S]*?null/);
      expect(sciBlock).not.toBeNull();
      expect(sciBlock![0]).toMatch(/isFinite/);
    });
  });

  // =========================================================================
  // #2 HIGH — relational-solver.ts: parseNumberImpl percentage missing isFinite
  // =========================================================================
  describe("#2 — parseNumberImpl percentage should check isFinite", () => {
    it("should guard against Infinity from percentage parsing", () => {
      const source = readFileSync("src/logic/relational-solver.ts", "utf-8");
      const fnStart = source.indexOf("function parseNumberImpl");
      const fnSource = source.slice(fnStart, fnStart + 800);
      // Find the percentage branch: parseFloat line and its return
      const percentBlock = fnSource.match(/percentMatch\[1\][\s\S]*?isNaN\(num\)[\s\S]*?null/);
      expect(percentBlock).not.toBeNull();
      expect(percentBlock![0]).toMatch(/isFinite/);
    });
  });

  // =========================================================================
  // #3 HIGH — predicate-compiler.ts: error leaks regex pattern object
  // =========================================================================
  describe("#3 — predicate-compiler error should not leak regex pattern", () => {
    it("should not interpolate regex pattern in error message", () => {
      const source = readFileSync("src/persistence/predicate-compiler.ts", "utf-8");
      const errorLine = source.match(/throw new Error\(.*?Dangerous operation detected.*?\)/);
      expect(errorLine).not.toBeNull();
      // Should NOT contain ${pattern} which would leak the regex source
      expect(errorLine![0]).not.toMatch(/\$\{pattern\}/);
    });
  });

  // =========================================================================
  // #4 HIGH — nucleus.ts: fuzzy_search limit not clamped in jsonToSexp
  // =========================================================================
  describe("#4 — nucleus jsonToSexp fuzzy_search should clamp limit", () => {
    it("should clamp fuzzy_search limit to a safe range", () => {
      const source = readFileSync("src/adapters/nucleus.ts", "utf-8");
      const fuzzyCase = source.match(/case "fuzzy_search"[\s\S]*?break;\s*\}/);
      expect(fuzzyCase).not.toBeNull();
      expect(fuzzyCase![0]).toMatch(/Math\.min|Math\.max|limit\s*>\s*\d|MAX_LIMIT|clamp/);
    });
  });

  // =========================================================================
  // #5 MEDIUM — nucleus-engine.ts: fuzzy_search limit not clamped before slice
  // =========================================================================
  describe("#5 — nucleus-engine fuzzy_search should clamp limit", () => {
    it("should clamp limit before slicing results", () => {
      const source = readFileSync("src/engine/nucleus-engine.ts", "utf-8");
      const fuzzyFn = source.match(/fuzzy_search:[\s\S]*?results\.slice\(0,\s*\w+\)/);
      expect(fuzzyFn).not.toBeNull();
      expect(fuzzyFn![0]).toMatch(/Math\.min|Math\.max|Math\.floor|clamp/);
    });
  });

  // =========================================================================
  // #6 MEDIUM — relational-solver.ts: reduce has no array length guard
  // =========================================================================
  describe("#6 — relational-solver reduce should guard array length", () => {
    it("should have a max iteration guard", () => {
      const source = readFileSync("src/logic/relational-solver.ts", "utf-8");
      const reduceFn = source.match(/function reduce[\s\S]*?return acc;\s*\}/);
      expect(reduceFn).not.toBeNull();
      expect(reduceFn![0]).toMatch(/MAX_REDUCE|length\s*>|\.slice\(|limit/i);
    });
  });

  // =========================================================================
  // #7 MEDIUM — session-db.ts: getLines start/end not validated as integers
  // =========================================================================
  describe("#7 — session-db getLines should validate integers", () => {
    it("should floor start and end to integers", () => {
      const source = readFileSync("src/persistence/session-db.ts", "utf-8");
      const getLinesFn = source.match(/getLines\(start.*?end.*?\)[\s\S]*?stmt\.all/);
      expect(getLinesFn).not.toBeNull();
      expect(getLinesFn![0]).toMatch(/Math\.floor|Number\.isInteger|Math\.trunc/);
    });
  });

  // =========================================================================
  // #8 MEDIUM — lattice-tool.ts: error leaks full file path
  // =========================================================================
  describe("#8 — lattice-tool error should not leak full file path", () => {
    it("should sanitize file path in error message", () => {
      const source = readFileSync("src/tool/lattice-tool.ts", "utf-8");
      const errorLine = source.match(/Failed to load.*?\$\{.*?\}/);
      expect(errorLine).not.toBeNull();
      // Should use basename or a safe path representation, not raw filePath
      expect(errorLine![0]).toMatch(/basename|path\.basename|documentName|sanitize/i);
    });
  });

  // =========================================================================
  // #9 MEDIUM — parser-registry.ts: moduleExport bracket access needs proto guard
  // =========================================================================
  // #10 MEDIUM — relational-solver.ts: standard number path missing isFinite
  // =========================================================================
  describe("#10 — parseNumberImpl standard number should check isFinite", () => {
    it("should guard against Infinity from standard number parsing", () => {
      const source = readFileSync("src/logic/relational-solver.ts", "utf-8");
      const fnStart = source.indexOf("function parseNumberImpl");
      const fnSource = source.slice(fnStart, fnStart + 800);
      // Find the standard number path at the end (after "Standard number with commas")
      const stdBlock = fnSource.match(/Standard number[\s\S]*?parseFloat\(cleaned\)[\s\S]*?null/);
      expect(stdBlock).not.toBeNull();
      expect(stdBlock![0]).toMatch(/isFinite/);
    });
  });
});
