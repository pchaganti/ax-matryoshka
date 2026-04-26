/**
 * Audit #53 — TDD tests for 10 issues
 * These tests should FAIL before the fixes and PASS after.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";

describe("Audit #53", () => {
  // #1 removed: FINAL_VAR parser deleted from base adapter (legacy marker).

  // =========================================================================
  // #3 HIGH — relational-solver.ts: split missing empty delimiter check
  // =========================================================================
  describe("#3 — relational-solver split should validate delimiter", () => {
    it("should check delimiter is not empty", () => {
      const source = readFileSync("src/logic/relational-solver.ts", "utf-8");
      const splitPrim = source.match(/split:\s*\(input,\s*args\)[\s\S]*?input\.split\(delim\)/);
      expect(splitPrim).not.toBeNull();
      expect(splitPrim![0]).toMatch(/delim\.length|!delim|delim\s*===\s*""/);
    });
  });

  // =========================================================================
  // #5 MEDIUM — lattice-tool.ts: getStats leaks documentPath
  // =========================================================================
  describe("#5 — lattice-tool getStats should not leak documentPath", () => {
    it("should not include raw documentPath in stats response", () => {
      const source = readFileSync("src/tool/lattice-tool.ts", "utf-8");
      // Find the private getStats method definition and its return block
      const statsIdx = source.indexOf("private getStats()");
      expect(statsIdx).toBeGreaterThan(-1);
      const statsBlock = source.slice(statsIdx, statsIdx + 300);
      // Should NOT include documentPath in the returned data
      expect(statsBlock).not.toMatch(/documentPath/);
    });
  });

  // =========================================================================
  // #6 MEDIUM — minikanren/common.ts: walkAll unbounded recursion
  // =========================================================================
  describe("#6 — walkAll should have recursion depth limit", () => {
    it("should include a depth parameter or limit", () => {
      const source = readFileSync("src/minikanren/common.ts", "utf-8");
      const walkAllFn = source.match(/function walkAll[\s\S]*?walkAll\(/);
      expect(walkAllFn).not.toBeNull();
      expect(walkAllFn![0]).toMatch(/depth|MAX_DEPTH|limit/i);
    });
  });

  // =========================================================================
  // #7 MEDIUM — lc-interpreter.ts: parseCurrency no input length limit
  // =========================================================================
  describe("#7 — lc-interpreter parseCurrency should limit input length", () => {
    it("should check string length before processing", () => {
      const source = readFileSync("src/logic/lc-interpreter.ts", "utf-8");
      const currencyCase = source.match(/case "parseCurrency"[\s\S]*?replace\(\/\[/);
      expect(currencyCase).not.toBeNull();
      expect(currencyCase![0]).toMatch(/\.length|MAX_PARSE|MAX_INPUT/);
    });
  });

  // =========================================================================
  // #8 MEDIUM — lc-interpreter.ts: parseDate uses Date.parse without length limit
  // =========================================================================
  describe("#8 — lc-interpreter parseDate should limit input length", () => {
    it("should check string length before parsing", () => {
      const source = readFileSync("src/logic/lc-interpreter.ts", "utf-8");
      const dateCase = source.match(/case "parseDate"[\s\S]*?new Date\(cleaned\)/);
      expect(dateCase).not.toBeNull();
      expect(dateCase![0]).toMatch(/\.length|MAX_PARSE|MAX_INPUT/);
    });
  });

  // =========================================================================
  // #9 MEDIUM — regex/synthesis.ts: error embeds unbounded conflicting examples
  // =========================================================================
  describe("#9 — regex synthesis error should limit conflict string length", () => {
    it("should truncate or limit conflicting examples in error", () => {
      const source = readFileSync("src/synthesis/regex/synthesis.ts", "utf-8");
      const errorLine = source.match(/Conflicting examples[\s\S]*?join/);
      expect(errorLine).not.toBeNull();
      expect(errorLine![0]).toMatch(/slice|substring|truncat|MAX|limit/i);
    });
  });

});
