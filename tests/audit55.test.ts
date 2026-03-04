/**
 * Audit #55 — TDD tests for 10 issues
 * These tests should FAIL before the fixes and PASS after.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";

describe("Audit #55", () => {
  // =========================================================================
  // #1 HIGH — sugar.ts unsweetenArray unbounded recursion
  // =========================================================================
  describe("#1 — unsweetenArray should have depth limit", () => {
    it("should include a depth parameter or limit", () => {
      const source = readFileSync("src/minikanren/sugar.ts", "utf-8");
      const fn = source.match(/function unsweetenArray[\s\S]*?unsweetenArray\(/);
      expect(fn).not.toBeNull();
      expect(fn![0]).toMatch(/depth|MAX_DEPTH|limit/i);
    });
  });

  // =========================================================================
  // #2 HIGH — sugar.ts sweetenPair unbounded recursion
  // =========================================================================
  describe("#2 — sweetenPair should have depth limit", () => {
    it("should include a depth parameter or limit", () => {
      const source = readFileSync("src/minikanren/sugar.ts", "utf-8");
      const fn = source.match(/function sweetenPair[\s\S]*?sweeten\(/);
      expect(fn).not.toBeNull();
      expect(fn![0]).toMatch(/depth|MAX_DEPTH|limit/i);
    });
  });

  // =========================================================================
  // #3 HIGH — sugar.ts unsweeten/sweeten compound recursion no depth limit
  // =========================================================================
  describe("#3 — unsweeten/sweeten should have depth limit", () => {
    it("unsweeten should accept and pass depth parameter", () => {
      const source = readFileSync("src/minikanren/sugar.ts", "utf-8");
      const fn = source.match(/export function unsweeten\([^)]*\)/);
      expect(fn).not.toBeNull();
      expect(fn![0]).toMatch(/depth/i);
    });

    it("sweeten should accept and pass depth parameter", () => {
      const source = readFileSync("src/minikanren/sugar.ts", "utf-8");
      const fn = source.match(/export function sweeten\([^)]*\)/);
      expect(fn).not.toBeNull();
      expect(fn![0]).toMatch(/depth/i);
    });
  });

  // =========================================================================
  // #4 HIGH — lc-solver parseCurrency parseFloat missing isFinite
  // =========================================================================
  describe("#4 — lc-solver parseCurrency should check isFinite", () => {
    it("should guard parseFloat result with isFinite", () => {
      const source = readFileSync("src/logic/lc-solver.ts", "utf-8");
      // Find parseCurrency function's final parseFloat
      const fn = source.match(/function parseCurrency[\s\S]*?parseFloat\(normalized\)[\s\S]*?return/);
      expect(fn).not.toBeNull();
      expect(fn![0]).toMatch(/isFinite/);
    });
  });

  // =========================================================================
  // #5 MEDIUM — lc-parser tokenizer parseFloat missing isFinite
  // =========================================================================
  describe("#5 — lc-parser tokenizer should check isFinite on parsed numbers", () => {
    it("should guard parseFloat with isFinite in tokenizer", () => {
      const source = readFileSync("src/logic/lc-parser.ts", "utf-8");
      const block = source.match(/const parsed = parseFloat\(num\)[\s\S]*?tokens\.push/);
      expect(block).not.toBeNull();
      expect(block![0]).toMatch(/isFinite/);
    });
  });

  // =========================================================================
  // #6 MEDIUM — symbol-extractor extractGoTypeDeclaration missing MAX_CHILDREN
  // =========================================================================
  describe("#6 — extractGoTypeDeclaration should limit child iteration", () => {
    it("should use MAX_CHILDREN or similar limit", () => {
      const source = readFileSync("src/treesitter/symbol-extractor.ts", "utf-8");
      // Find the extractGoTypeDeclaration method's own for loop
      const methodStart = source.indexOf("private extractGoTypeDeclaration");
      expect(methodStart).toBeGreaterThan(-1);
      const methodBlock = source.slice(methodStart, methodStart + 500);
      const forLoop = methodBlock.match(/for \(let i = 0; i < ([^;]+);/);
      expect(forLoop).not.toBeNull();
      // Should NOT use raw node.childCount — should clamp with Math.min, MAX_CHILDREN, or a clamped variable
      expect(forLoop![1]).toMatch(/MAX_CHILDREN|Math\.min|childLimit|Limit/);
    });
  });

  // =========================================================================
  // #7 MEDIUM — symbol-extractor getNodeName missing MAX_CHILDREN
  // =========================================================================
  describe("#7 — getNodeName should limit child iteration", () => {
    it("should use MAX_CHILDREN or similar limit", () => {
      const source = readFileSync("src/treesitter/symbol-extractor.ts", "utf-8");
      const fn = source.match(/getNodeName[\s\S]*?for \(let i = 0; i < /);
      expect(fn).not.toBeNull();
      expect(fn![0]).toMatch(/MAX_CHILDREN|Math\.min/);
    });
  });

  // =========================================================================
  // #8 MEDIUM — session-db createHandle no max array size
  // =========================================================================
  describe("#8 — session-db createHandle should limit array size", () => {
    it("should enforce a maximum number of items", () => {
      const source = readFileSync("src/persistence/session-db.ts", "utf-8");
      const fn = source.match(/createHandle\(data[\s\S]*?insertAll\(data\)/);
      expect(fn).not.toBeNull();
      expect(fn![0]).toMatch(/MAX_HANDLE|data\.length|limit/i);
    });
  });

  // =========================================================================
  // #9 MEDIUM — regex/synthesis synthesizeRegex no length limit on examples
  // =========================================================================
  describe("#9 — synthesizeRegex should limit example count", () => {
    it("should enforce max number of examples", () => {
      const source = readFileSync("src/synthesis/regex/synthesis.ts", "utf-8");
      const fnStart = source.indexOf("export function synthesizeRegex");
      expect(fnStart).toBeGreaterThan(-1);
      const fnBlock = source.slice(fnStart, fnStart + 400);
      // Should clamp or reject if too many positives
      expect(fnBlock).toMatch(/MAX_EXAMPLES|positives\s*=\s*positives\.slice|positives\.length\s*>\s*\d/);
    });
  });

  // =========================================================================
  // #10 MEDIUM — regex/synthesis matchTemplate no example string length limit
  // =========================================================================
  describe("#10 — matchTemplate should limit example string length", () => {
    it("should check example string lengths", () => {
      const source = readFileSync("src/synthesis/regex/synthesis.ts", "utf-8");
      const fnStart = source.indexOf("export function matchTemplate");
      expect(fnStart).toBeGreaterThan(-1);
      const fnBlock = source.slice(fnStart, fnStart + 300);
      // Should check individual example string length
      expect(fnBlock).toMatch(/MAX_EXAMPLE_LENGTH|\.length\s*>\s*\d|every.*\.length/);
    });
  });
});
