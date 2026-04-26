/**
 * Audit #91 — 10 security issues
 *
 * 1. MEDIUM nucleus-engine.ts — parseInt in evictOldTurnBindings sort has no NaN guard
 * 2. MEDIUM nucleus-engine.ts — fuzzy_search limit not checked with isFinite before Math.floor
 * 3. MEDIUM lc-parser.ts — parseConstraintObject unbounded while loop, no entry count cap
 * 4. MEDIUM lc-parser.ts — tokenize has no cap on total token count
 * 5. MEDIUM lc-parser.ts — match group parsed without bounds validation (0-99)
 * 6. MEDIUM checkpoint.ts — save/restore/delete/onOperation missing turn validation
 * 7. MEDIUM rlm.ts — JSON.stringify(result.result) unbounded output
 * 8. LOW adapters/nucleus.ts — redundant .toLowerCase() on case-insensitive regex
 * 9. MEDIUM handle-ops.ts — sum() missing field name validation unlike sort()
 * 10. MEDIUM error-analyzer.ts — Levenshtein matrix can be ~100M cells with 10K strings
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";

describe("Audit #91", () => {

  // =========================================================================
  // #3 MEDIUM — lc-parser.ts parseConstraintObject unbounded loop
  // =========================================================================
  describe("#3 — parseConstraintObject should cap entry count", () => {
    it("should limit number of constraint entries", () => {
      const source = readFileSync("src/logic/lc-parser.ts", "utf-8");
      const fnStart = source.indexOf("function parseConstraintObject");
      expect(fnStart).toBeGreaterThan(-1);
      const block = source.slice(fnStart, fnStart + 500);
      // Should have a MAX_CONSTRAINT_ENTRIES or Object.keys().length check
      expect(block).toMatch(/MAX_CONSTRAINT|Object\.keys.*length\s*>=|entryCount|entries\s*>=|entries\s*>/);
    });
  });

  // =========================================================================
  // #4 MEDIUM — lc-parser.ts tokenize no token count cap
  // =========================================================================
  describe("#4 — tokenize should cap total token count", () => {
    it("should limit number of tokens produced", () => {
      const source = readFileSync("src/logic/lc-parser.ts", "utf-8");
      const fnStart = source.indexOf("function tokenize");
      expect(fnStart).toBeGreaterThan(-1);
      const block = source.slice(fnStart, fnStart + 800);
      // Should have MAX_TOKENS or tokens.length check
      expect(block).toMatch(/MAX_TOKENS|tokens\.length\s*>=|tokens\.length\s*>/);
    });
  });

  // =========================================================================
  // #5 MEDIUM — lc-parser.ts match group missing bounds validation
  // =========================================================================
  describe("#5 — match group should be validated in parser", () => {
    it("should reject group values outside 0-99 range", () => {
      const source = readFileSync("src/logic/lc-parser.ts", "utf-8");
      const matchCase = source.indexOf('case "match"', source.indexOf("function parseList"));
      expect(matchCase).toBeGreaterThan(-1);
      const block = source.slice(matchCase, matchCase + 500);
      // Should validate group bounds (0-99 or similar)
      expect(block).toMatch(/group.*<\s*0|group.*>\s*\d{2,}|group.*>=\s*\d{2,}|isSafeInteger.*group/);
    });
  });

  // =========================================================================
  // #6 MEDIUM — checkpoint.ts save/delete missing turn validation
  // =========================================================================
  describe("#6 — checkpoint save/delete should validate turn", () => {
    it("should validate turn parameter in save method", () => {
      const source = readFileSync("src/persistence/checkpoint.ts", "utf-8");
      const saveStart = source.indexOf("save(turn:");
      expect(saveStart).toBeGreaterThan(-1);
      const block = source.slice(saveStart, saveStart + 300);
      // Should validate turn is a safe non-negative integer
      expect(block).toMatch(/isSafeInteger|isFinite|turn\s*<\s*0|typeof turn/);
    });
  });

  // =========================================================================
  // #7 MEDIUM — rlm.ts JSON.stringify(result.result) unbounded
  // =========================================================================
  describe("#7 — rlm.ts should cap JSON.stringify of result", () => {
    it("should limit stringified result length", () => {
      const source = readFileSync("src/fsm/rlm-states.ts", "utf-8");
      const jsonLine = source.indexOf("JSON.stringify(result.value");
      expect(jsonLine).toBeGreaterThan(-1);
      const block = source.slice(jsonLine, jsonLine + 200);
      // Should slice or truncate the serialized output
      expect(block).toMatch(/\.slice\(0,|truncate|\.substring\(0,|MAX_/);
    });
  });

  // #8 removed: DANGEROUS_VAR_NAMES deleted with FINAL_VAR marker.

  // =========================================================================
  // #9 MEDIUM — handle-ops.ts sum() missing field validation
  // =========================================================================
  describe("#9 — sum() should validate field name like sort() does", () => {
    it("should validate field name format and length", () => {
      const source = readFileSync("src/persistence/handle-ops.ts", "utf-8");
      const sumStart = source.indexOf("sum(handle: string, field: string)");
      expect(sumStart).toBeGreaterThan(-1);
      const block = source.slice(sumStart, sumStart + 300);
      // Should validate field name like sort() does (regex + length)
      expect(block).toMatch(/field\.length|test\(field\)|\/\^/);
    });
  });

  // =========================================================================
  // #10 MEDIUM — error-analyzer.ts Levenshtein matrix too large
  // =========================================================================
  describe("#10 — levenshteinDistance should cap matrix size", () => {
    it("should limit total matrix cells to prevent OOM", () => {
      const source = readFileSync("src/feedback/error-analyzer.ts", "utf-8");
      const fnStart = source.indexOf("function levenshteinDistance");
      expect(fnStart).toBeGreaterThan(-1);
      const block = source.slice(fnStart, fnStart + 500);
      // Should have a product/matrix size check, or tighter individual caps (<=1000)
      expect(block).toMatch(/MAX_MATRIX|a\.length\s*\*\s*b\.length|MAX_STR_LENGTH\s*=\s*1[_,]?000\b/);
    });
  });
});
