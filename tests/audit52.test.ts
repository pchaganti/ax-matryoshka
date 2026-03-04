/**
 * Audit #52 — TDD tests for 10 issues
 * These tests should FAIL before the fixes and PASS after.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";

describe("Audit #52", () => {
  // =========================================================================
  // #1 HIGH — symbol-extractor.ts: walkTree unbounded horizontal iteration
  // =========================================================================
  describe("#1 — walkTree should limit child iteration count", () => {
    it("should have a MAX_CHILDREN or childCount limit in walk loop", () => {
      const source = readFileSync("src/treesitter/symbol-extractor.ts", "utf-8");
      const walkLoop = source.match(/Recurse into children[\s\S]*?walkTree/);
      expect(walkLoop).not.toBeNull();
      expect(walkLoop![0]).toMatch(/MAX_CHILDREN|Math\.min/);
    });
  });

  // =========================================================================
  // #2 HIGH — lc-parser.ts: parseConstraintObject prototype pollution
  // =========================================================================
  describe("#2 — parseConstraintObject should guard against prototype pollution", () => {
    it("should check key against dangerous names before bracket assignment", () => {
      const source = readFileSync("src/logic/lc-parser.ts", "utf-8");
      const constraintBlock = source.match(/parseConstraintObject[\s\S]*?constraints\[key\]/);
      expect(constraintBlock).not.toBeNull();
      expect(constraintBlock![0]).toMatch(/__proto__|hasOwnProperty|DANGEROUS|prototype/);
    });
  });

  // =========================================================================
  // #3 MEDIUM — predicate-compiler.ts: comma bypass via nested parens
  // =========================================================================
  describe("#3 — predicate-compiler comma check should handle nested parens", () => {
    it("should strip nested parentheses before comma check", () => {
      const source = readFileSync("src/persistence/predicate-compiler.ts", "utf-8");
      // Find the comma operator blocking section
      const commaBlock = source.match(/comma operator[\s\S]*?replace\([^)]+\)/);
      expect(commaBlock).not.toBeNull();
      // Should handle nesting: either loop/repeat the replace, or use a recursive approach
      expect(commaBlock![0]).toMatch(/while|loop|replace\([^)]+\)[\s\S]*?replace\(|nested|depth/i);
    });
  });

  // =========================================================================
  // #4 MEDIUM — lc-interpreter.ts: lines missing integer validation
  // =========================================================================
  describe("#4 — lc-interpreter lines should validate start/end as integers", () => {
    it("should floor or check integer on start and end", () => {
      const source = readFileSync("src/logic/lc-interpreter.ts", "utf-8");
      const linesCase = source.match(/case "lines"[\s\S]*?Math\.min\(lines\.length/);
      expect(linesCase).not.toBeNull();
      expect(linesCase![0]).toMatch(/Math\.floor|Number\.isInteger|Math\.trunc/);
    });
  });

  // =========================================================================
  // #5 MEDIUM — evalo/compile.ts: slice allows negative indices
  // =========================================================================
  describe("#5 — evalo compile slice should reject negative indices", () => {
    it("should validate start >= 0", () => {
      const source = readFileSync("src/synthesis/evalo/compile.ts", "utf-8");
      const sliceCase = source.match(/case "slice"[\s\S]*?\.slice\(/);
      expect(sliceCase).not.toBeNull();
      expect(sliceCase![0]).toMatch(/start\s*<\s*0|start\s*>=\s*0/);
    });
  });

  // =========================================================================
  // #6 MEDIUM — evalo/evalo.ts: slice evaluation allows negative indices
  // =========================================================================
  describe("#6 — evalo evalExtractor slice should reject negative indices", () => {
    it("should validate start and end are non-negative", () => {
      const source = readFileSync("src/synthesis/evalo/evalo.ts", "utf-8");
      const sliceCase = source.match(/case "slice"[\s\S]*?str\.slice\(/);
      expect(sliceCase).not.toBeNull();
      expect(sliceCase![0]).toMatch(/start\s*[<>]=?\s*0|start\s*<\s*0|isInteger/);
    });
  });

  // =========================================================================
  // #7 MEDIUM — sandbox.ts: locate_line negative index not clamped
  // =========================================================================
  describe("#7 — sandbox locate_line should clamp negative indices", () => {
    it("should use Math.max to clamp negative index results", () => {
      const source = readFileSync("src/sandbox.ts", "utf-8");
      const locateFn = source.match(/function locate_line[\s\S]*?let startIdx[\s\S]*?totalLines \+ start/);
      expect(locateFn).not.toBeNull();
      expect(locateFn![0]).toMatch(/Math\.max\(0/);
    });
  });

  // =========================================================================
  // #8 MEDIUM — nucleus.ts: DANGEROUS_VAR_NAMES is case-sensitive
  // =========================================================================
  describe("#8 — nucleus DANGEROUS_VAR_NAMES should be case-insensitive", () => {
    it("should use case-insensitive check or toLowerCase", () => {
      const source = readFileSync("src/adapters/nucleus.ts", "utf-8");
      const varCheck = source.match(/DANGEROUS_VAR_NAMES[\s\S]*?varMatch\[1\]/);
      expect(varCheck).not.toBeNull();
      expect(varCheck![0]).toMatch(/toLowerCase|(?:\/i\b)|case.insensitive/i);
    });
  });

  // =========================================================================
  // #9 MEDIUM — parser-registry.ts: parseDocument no content size limit
  // =========================================================================
  describe("#9 — parser-registry parseDocument should limit content size", () => {
    it("should check content length before parsing", () => {
      const source = readFileSync("src/treesitter/parser-registry.ts", "utf-8");
      const parseFn = source.match(/parseDocument\(content[\s\S]*?parser\.parse/);
      expect(parseFn).not.toBeNull();
      expect(parseFn![0]).toMatch(/content\.length|MAX_CONTENT|MAX_FILE_SIZE|MAX_PARSE/);
    });
  });

  // =========================================================================
  // #10 MEDIUM — fuzzy-search.ts: limit not clamped in fuzzySearch
  // =========================================================================
  describe("#10 — fuzzy-search fuzzySearch should clamp limit", () => {
    it("should enforce a max limit on results", () => {
      const source = readFileSync("src/fuzzy-search.ts", "utf-8");
      const searchFn = source.match(/function fuzzySearch[\s\S]*?results\.slice\(0,\s*\w+\)/);
      expect(searchFn).not.toBeNull();
      expect(searchFn![0]).toMatch(/Math\.min|Math\.max|clamp|MAX_LIMIT/);
    });
  });
});
