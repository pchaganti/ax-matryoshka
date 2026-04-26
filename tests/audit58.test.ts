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

  // #8 removed: DANGEROUS_VAR_NAMES deleted with FINAL_VAR marker.

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

});
