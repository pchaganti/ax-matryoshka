/**
 * Audit #54 — TDD tests for 10 issues
 * These tests should FAIL before the fixes and PASS after.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";

describe("Audit #54", () => {
  // =========================================================================
  // #1 HIGH — relational-solver index primitive missing integer/bounds check
  // =========================================================================
  describe("#1 — relational-solver index should validate index", () => {
    it("should check integer and non-negative on index primitive", () => {
      const source = readFileSync("src/logic/relational-solver.ts", "utf-8");
      const indexCase = source.match(/index:\s*\(input,\s*args\)\s*=>\s*\{[\s\S]*?input\[idx\]/);
      expect(indexCase).not.toBeNull();
      expect(indexCase![0]).toMatch(/Number\.isInteger|isInteger|idx\s*<\s*0/);
    });
  });

  // =========================================================================
  // #2 HIGH — relational-solver match missing negative group check
  // =========================================================================
  describe("#2 — relational-solver match should reject negative group", () => {
    it("should guard against negative group index", () => {
      const source = readFileSync("src/logic/relational-solver.ts", "utf-8");
      const matchCase = source.match(/match:\s*\(input,\s*args\)\s*=>\s*\{[\s\S]*?result\[group\]/);
      expect(matchCase).not.toBeNull();
      expect(matchCase![0]).toMatch(/group\s*<\s*0/);
    });
  });

});
