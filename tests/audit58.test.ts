/**
 * Audit #58 — TDD tests for 10 issues
 * These tests should FAIL before the fixes and PASS after.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";

describe("Audit #58", () => {
  // =========================================================================
  // #1 MEDIUM — lc-parser symbol accumulation no length limit
  // =========================================================================
  describe("#1 — lc-parser symbol loop should limit length", () => {
    it("should limit symbol string accumulation length", () => {
      const source = readFileSync("src/logic/lc-parser.ts", "utf-8");
      const symLoop = source.match(/let sym = ""[\s\S]*?sym \+= input\[i\]/);
      expect(symLoop).not.toBeNull();
      expect(symLoop![0]).toMatch(/sym\.length|MAX_SYM/i);
    });
  });

  // =========================================================================
  // #2 MEDIUM — session-db search query length not validated
  // =========================================================================
  describe("#2 — session-db search should limit query length", () => {
    it("should check query length before processing", () => {
      const source = readFileSync("src/persistence/session-db.ts", "utf-8");
      const searchStart = source.indexOf("search(query: string)");
      expect(searchStart).toBeGreaterThan(-1);
      const block = source.slice(searchStart, searchStart + 300);
      expect(block).toMatch(/query\.length|MAX_QUERY/i);
    });
  });

  // =========================================================================
  // #3 MEDIUM — session-db getHandleDataSlice limit no upper bound
  // =========================================================================
  describe("#3 — getHandleDataSlice should cap limit", () => {
    it("should enforce a maximum limit value", () => {
      const source = readFileSync("src/persistence/session-db.ts", "utf-8");
      const fnStart = source.indexOf("getHandleDataSlice(");
      expect(fnStart).toBeGreaterThan(-1);
      const block = source.slice(fnStart, fnStart + 400);
      expect(block).toMatch(/MAX_SLICE|Math\.min.*limit/i);
    });
  });

  // =========================================================================
  // #4 MEDIUM — iota(NaN) silently produces MAX_IOTA elements
  // =========================================================================
  describe("#4 — iota should return empty for NaN", () => {
    it("should guard against NaN input", () => {
      const source = readFileSync("src/minikanren/common.ts", "utf-8");
      const iotaFn = source.match(/export function iota[\s\S]*?\n\}/);
      expect(iotaFn).not.toBeNull();
      expect(iotaFn![0]).toMatch(/isFinite|isNaN|Number\.isFinite/);
    });
  });

  // =========================================================================
  // #5 MEDIUM — evalo slice end uses isInteger not isSafeInteger
  // =========================================================================
  describe("#5 — evalo slice should use isSafeInteger for end", () => {
    it("should validate end with isSafeInteger", () => {
      const source = readFileSync("src/synthesis/evalo/evalo.ts", "utf-8");
      const sliceCase = source.match(/case "slice"[\s\S]*?extractor\.end\)/);
      expect(sliceCase).not.toBeNull();
      expect(sliceCase![0]).toMatch(/isSafeInteger/);
    });
  });

  // =========================================================================
  // #6 MEDIUM — compile.ts slice uses isInteger not isSafeInteger
  // =========================================================================
  describe("#6 — compiled slice should use isSafeInteger", () => {
    it("should validate start/end with isSafeInteger", () => {
      const source = readFileSync("src/synthesis/evalo/compile.ts", "utf-8");
      const sliceCase = source.match(/case "slice"[\s\S]*?extractor\.end/);
      expect(sliceCase).not.toBeNull();
      expect(sliceCase![0]).toMatch(/isSafeInteger/);
    });
  });

  // =========================================================================
  // #7 MEDIUM — symbol-extractor getSignature node.text no length limit
  // =========================================================================
  describe("#7 — getSignature should limit node.text length", () => {
    it("should check node.text length before splitting", () => {
      const source = readFileSync("src/treesitter/symbol-extractor.ts", "utf-8");
      const sigStart = source.indexOf("private getSignature");
      expect(sigStart).toBeGreaterThan(-1);
      const block = source.slice(sigStart, sigStart + 500);
      expect(block).toMatch(/text\.length\s*>|MAX_SIG/i);
    });
  });

  // =========================================================================
  // #8 MEDIUM — nucleus.ts DANGEROUS_VAR_NAMES incomplete
  // =========================================================================
  describe("#8 — nucleus DANGEROUS_VAR_NAMES should include toString/valueOf", () => {
    it("should block hasOwnProperty, toString, valueOf", () => {
      const source = readFileSync("src/adapters/nucleus.ts", "utf-8");
      const dangerousBlock = source.match(/DANGEROUS_VAR_NAMES[\s\S]*?FINAL_VAR/);
      expect(dangerousBlock).not.toBeNull();
      expect(dangerousBlock![0]).toMatch(/hasOwnProperty/);
      expect(dangerousBlock![0]).toMatch(/toString/);
      expect(dangerousBlock![0]).toMatch(/valueOf/);
    });
  });

  // =========================================================================
  // #9 MEDIUM — lc-interpreter lines operation no max return limit
  // =========================================================================
  describe("#9 — lc-interpreter lines should cap returned line count", () => {
    it("should enforce a max lines returned limit", () => {
      const source = readFileSync("src/logic/lc-interpreter.ts", "utf-8");
      const linesCase = source.match(/case "lines"[\s\S]*?\.join\("\\n"\)/);
      expect(linesCase).not.toBeNull();
      expect(linesCase![0]).toMatch(/MAX_LINES|end\s*-\s*start\s*>/i);
    });
  });

  // =========================================================================
  // #10 MEDIUM — streams.ts take() n not validated
  // =========================================================================
  describe("#10 — take should validate n is non-negative integer", () => {
    it("should check n is valid before processing", () => {
      const source = readFileSync("src/minikanren/streams.ts", "utf-8");
      const takeFn = source.match(/export function take[\s\S]*?while/);
      expect(takeFn).not.toBeNull();
      expect(takeFn![0]).toMatch(/isInteger|Math\.floor|Math\.max\(0/);
    });
  });
});
