/**
 * Audit #90 — 10 security issues
 *
 * 1. MEDIUM evalo.ts — parseInt missing string length check before parsing
 * 2. MEDIUM knowledge-base.ts — computeSimilarity unbounded join before slice
 * 3. MEDIUM extractor/synthesis.ts — reduce split(delim) without limit param
 * 4. MEDIUM extractor/synthesis.ts — testFn split(delim) without limit param
 * 5. MEDIUM session-db.ts — storeSymbol missing startLine <= endLine validation
 * 6. MEDIUM lc-parser.ts — parseExamples unbounded loop, no MAX_EXAMPLES cap
 * 7. MEDIUM config.ts — resolveEnvVars no array size cap
 * 8. MEDIUM error-analyzer.ts — special char at index 0 not detected
 * 9. MEDIUM base.ts — extractFinalAnswer JSON.stringify unbounded output
 * 10. MEDIUM extractor/synthesis.ts — split_comma/split_pipe testFn no split limit
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";

describe("Audit #90", () => {
  // =========================================================================
  // #1 MEDIUM — evalo.ts parseInt missing string length check
  // =========================================================================
  describe("#1 — parseInt should check string length before parsing", () => {
    it("should validate string length in parseInt case", () => {
      const source = readFileSync("src/synthesis/evalo/evalo.ts", "utf-8");
      const intCase = source.indexOf('case "parseInt"');
      expect(intCase).toBeGreaterThan(-1);
      const block = source.slice(intCase, intCase + 300);
      // Should have length check like parseFloat does
      expect(block).toMatch(/\.length\s*>/);
    });
  });

  // =========================================================================
  // #2 MEDIUM — knowledge-base.ts computeSimilarity unbounded join
  // =========================================================================
  describe("#2 — computeSimilarity should cap array before join", () => {
    it("should limit examples array before joining", () => {
      const source = readFileSync("src/synthesis/knowledge-base.ts", "utf-8");
      const fnStart = source.indexOf("private computeSimilarity");
      expect(fnStart).toBeGreaterThan(-1);
      const block = source.slice(fnStart, fnStart + 600);
      // Should cap arrays before join to prevent unbounded intermediate strings
      expect(block).toMatch(/\.slice\(0,.*\)\.join|MAX_EXAMPLES|examples\.length\s*>/i);
    });
  });

  // =========================================================================
  // #3 MEDIUM — extractor/synthesis.ts reduce split without limit
  // =========================================================================
  describe("#3 — delimiter reduce should use split limit", () => {
    it("should pass limit to split in reduce", () => {
      const source = readFileSync("src/synthesis/extractor/synthesis.ts", "utf-8");
      const reduceLine = source.indexOf("examples.reduce((max, e) => Math.max(max, e.input.split");
      expect(reduceLine).toBeGreaterThan(-1);
      const block = source.slice(reduceLine, reduceLine + 200);
      // split should have a limit parameter
      expect(block).toMatch(/split\(delim,\s*\d|split\(delim,\s*MAX/);
    });
  });

  // =========================================================================
  // #4 MEDIUM — extractor/synthesis.ts testFn split without limit
  // =========================================================================
  describe("#4 — delimiter testFn should use split limit", () => {
    it("should pass limit to split in testFn", () => {
      const source = readFileSync("src/synthesis/extractor/synthesis.ts", "utf-8");
      const testFnLine = source.indexOf("const testFn = (s: string) =>");
      expect(testFnLine).toBeGreaterThan(-1);
      const block = source.slice(testFnLine, testFnLine + 200);
      // split should have a limit parameter
      expect(block).toMatch(/split\(delim,\s*\d|split\(delim,\s*MAX/);
    });
  });

  // =========================================================================
  // #5 MEDIUM — session-db.ts storeSymbol missing startLine <= endLine
  // =========================================================================
  describe("#5 — storeSymbol should validate startLine <= endLine", () => {
    it("should reject startLine > endLine", () => {
      const source = readFileSync("src/persistence/session-db.ts", "utf-8");
      const fnStart = source.indexOf("storeSymbol(");
      expect(fnStart).toBeGreaterThan(-1);
      const block = source.slice(fnStart, fnStart + 1200);
      expect(block).toMatch(/startLine\s*>\s*.*endLine|endLine\s*<\s*.*startLine|startLine\s*<=\s*.*endLine/);
    });
  });

  // =========================================================================
  // #6 MEDIUM — lc-parser.ts parseExamples no MAX_EXAMPLES cap
  // =========================================================================
  describe("#6 — parseExamples should cap number of examples", () => {
    it("should limit examples count in while loop", () => {
      const source = readFileSync("src/logic/lc-parser.ts", "utf-8");
      const fnStart = source.indexOf("function parseExamples");
      expect(fnStart).toBeGreaterThan(-1);
      const block = source.slice(fnStart, fnStart + 500);
      expect(block).toMatch(/MAX_EXAMPLES|examples\.length\s*>=|examples\.length\s*>/);
    });
  });

  // =========================================================================
  // #7 MEDIUM — config.ts resolveEnvVars no array size cap
  // =========================================================================
  describe("#7 — resolveEnvVars should cap array size", () => {
    it("should limit array length before recursing", () => {
      const source = readFileSync("src/config.ts", "utf-8");
      const fnStart = source.indexOf("function resolveEnvVars");
      expect(fnStart).toBeGreaterThan(-1);
      const block = source.slice(fnStart, fnStart + 800);
      expect(block).toMatch(/MAX_ARRAY|Array\.isArray.*length\s*>|\.slice\(0,.*MAX/i);
    });
  });

  // =========================================================================
  // #8 MEDIUM — error-analyzer.ts special char at idx 0 not detected
  // =========================================================================
  describe("#8 — analyzeInvalidRegex should detect chars at index 0", () => {
    it("should use idx >= 0 not idx > 0 for special char detection", () => {
      const source = readFileSync("src/feedback/error-analyzer.ts", "utf-8");
      const filterLine = source.indexOf("specialChars.filter");
      expect(filterLine).toBeGreaterThan(-1);
      const block = source.slice(filterLine, filterLine + 200);
      // Should check idx >= 0 (or idx !== -1), not idx > 0
      expect(block).not.toMatch(/idx\s*>\s*0\s*&&/);
    });
  });

  // =========================================================================
  // #9 MEDIUM — base.ts extractFinalAnswer JSON.stringify unbounded
  // =========================================================================
  describe("#9 — extractFinalAnswer should cap JSON.stringify output", () => {
    it("should limit stringified output length", () => {
      const source = readFileSync("src/adapters/base.ts", "utf-8");
      const jsonLine = source.indexOf("JSON.stringify(parsed, null, 2)");
      expect(jsonLine).toBeGreaterThan(-1);
      const block = source.slice(jsonLine, jsonLine + 100);
      expect(block).toMatch(/\.slice\(0,|\.substring\(0,/);
    });
  });

  // =========================================================================
  // #10 MEDIUM — extractor/synthesis.ts split_comma/split_pipe no limit
  // =========================================================================
  describe("#10 — split_comma testFn should use split limit", () => {
    it("should pass limit to split in comma testFn", () => {
      const source = readFileSync("src/synthesis/extractor/synthesis.ts", "utf-8");
      const commaFn = source.indexOf('name: "split_comma"');
      expect(commaFn).toBeGreaterThan(-1);
      const block = source.slice(commaFn, commaFn + 300);
      // testFn should have a split limit
      expect(block).toMatch(/split\(['"],['"]\s*,\s*\d|split\(","\s*,\s*\d|MAX_SPLIT/);
    });
  });
});
