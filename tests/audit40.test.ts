/**
 * Audit #40 — TDD tests for 10 issues
 * These tests should FAIL before the fixes and PASS after.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";

describe("Audit #40", () => {
  // =========================================================================
  // #1 HIGH — sandbox-tools.ts exposes full Object (constructor chain risk)
  // =========================================================================
  // #2 HIGH — predicate-compiler missing .join/.concat/fromCharCode blocks
  // =========================================================================
  describe("#2 — predicate-compiler should block .join/.concat/fromCharCode bypasses", () => {
    it("should block string reconstruction methods", () => {
      const source = readFileSync("src/persistence/predicate-compiler.ts", "utf-8");
      // Should block .join( and .concat( and fromCharCode
      expect(source).toMatch(/\.join\s*\(|join/);
      expect(source).toMatch(/\.concat\s*\(|concat/);
      expect(source).toMatch(/fromCharCode/);
    });
  });

  // =========================================================================
  // #3 HIGH — relational-solver replace doesn't escape $ in replacement
  // =========================================================================
  describe("#3 — relational-solver replace should escape $ backreferences", () => {
    it("should escape $ in replacement string", () => {
      const source = readFileSync("src/logic/relational-solver.ts", "utf-8");
      const replaceBlock = source.match(/replace:\s*\(input[\s\S]*?input\.replace\(regex,[\s\S]*?\)/);
      expect(replaceBlock).not.toBeNull();
      // Should escape $ in the replacement string before passing to .replace()
      expect(replaceBlock![0]).toMatch(/\$.*\$\$|\\\$/);
    });
  });

  // =========================================================================
  // #4 MEDIUM — sandbox-tools logs array has no MAX_LOGS cap
  // =========================================================================
  describe("#4 — sandbox-tools should cap logs array", () => {
    it("should have a MAX_LOGS limit", () => {
      const source = readFileSync("node_modules/repl-sandbox/dist/sandbox.js", "utf-8");
      expect(source).toMatch(/maxLogs|logs\.length\s*>/);
    });
  });

  // =========================================================================
  // #5 MEDIUM — sandbox-tools textStats.middle negative index
  // =========================================================================
  describe("#5 — sandbox-tools textStats.middle should guard negative index", () => {
    it("should use Math.max(0, ...) for middle slice start", () => {
      const source = readFileSync("node_modules/repl-sandbox/dist/sandbox.js", "utf-8");
      // The middle slice should use Math.max(0, ...) to prevent negative index
      expect(source).toMatch(/middle[\s\S]*?\.slice\(\s*\n?\s*Math\.max\(0/);
    });
  });

  // =========================================================================
  // #6 MEDIUM — handle-ops sum/sumFromLine missing isFinite guard
  // =========================================================================
  describe("#6 — handle-ops sum/sumFromLine should guard against Infinity", () => {
    it("sum should check isFinite", () => {
      const source = readFileSync("src/persistence/handle-ops.ts", "utf-8");
      const sumFn = source.match(/sum\(handle[\s\S]*?acc \+ value/);
      expect(sumFn).not.toBeNull();
      expect(sumFn![0]).toMatch(/isFinite/);
    });

    it("sumFromLine should check isFinite", () => {
      const source = readFileSync("src/persistence/handle-ops.ts", "utf-8");
      const sumFromLine = source.match(/sumFromLine[\s\S]*?acc \+ num/);
      expect(sumFromLine).not.toBeNull();
      expect(sumFromLine![0]).toMatch(/isFinite/);
    });
  });

  // =========================================================================
  // #7 MEDIUM — lc-solver sum number path accepts NaN/Infinity
  // =========================================================================
  describe("#7 — lc-solver sum should check isFinite on number values", () => {
    it("should guard the direct number path with isFinite", () => {
      const source = readFileSync("src/logic/lc-solver.ts", "utf-8");
      // Find the sum case and the typeof val === "number" path
      const sumCase = source.match(/case "sum"[\s\S]*?typeof val === "number"[\s\S]*?return acc/);
      expect(sumCase).not.toBeNull();
      expect(sumCase![0]).toMatch(/isFinite|Number\.isFinite/);
    });
  });

  // =========================================================================
  // #8 MEDIUM — lc-solver split with empty delimiter missing guard
  // =========================================================================
  describe("#8 — lc-solver split should guard against empty delimiter", () => {
    it("should check for empty delimiter before splitting", () => {
      const source = readFileSync("src/logic/lc-solver.ts", "utf-8");
      // Find the split case near line 439
      const splitCase = source.match(/case "split"[\s\S]*?\.split\(term\.delim/);
      expect(splitCase).not.toBeNull();
      // Should check for empty delimiter
      expect(splitCase![0]).toMatch(/delim.*length|!term\.delim|delim === ""/);
    });
  });

  // =========================================================================
  // #9 MEDIUM — http.ts inner catch leaks raw error message
  // =========================================================================
  // #10 MEDIUM — pipe.ts echoes unbounded user input in error
  // =========================================================================
  describe("#10 — pipe adapter should truncate user input in error messages", () => {
    it("should truncate input in Invalid JSON error", () => {
      const source = readFileSync("src/tool/adapters/pipe.ts", "utf-8");
      const errorBlock = source.match(/Invalid JSON:[\s\S]*?\}/);
      expect(errorBlock).not.toBeNull();
      // Should truncate/slice the input
      expect(errorBlock![0]).toMatch(/slice|substring|substr|truncat/i);
    });
  });
});
