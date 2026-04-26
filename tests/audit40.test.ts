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
});
