/**
 * Audit #41 — TDD tests for 10 issues
 * These tests should FAIL before the fixes and PASS after.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";

describe("Audit #41", () => {
  // =========================================================================
  // #1 HIGH — sandbox-tools missing constructor property lockdown
  // =========================================================================
  // #2 HIGH — lc-compiler var/lambda emit unsanitized names
  // =========================================================================
  describe("#2 — lc-compiler should validate var names and lambda params", () => {
    it("should validate var name is a safe identifier", () => {
      const source = readFileSync("src/logic/lc-compiler.ts", "utf-8");
      const varCase = source.match(/case "var"[\s\S]*?return term\.name/);
      expect(varCase).not.toBeNull();
      // Should have regex test to validate identifier safety
      expect(varCase![0]).toMatch(/\.test\(term\.name\)/);
    });

    it("should validate lambda param is a safe identifier", () => {
      const source = readFileSync("src/logic/lc-compiler.ts", "utf-8");
      // Check that the lambda case has identifier validation for term.param
      const lambdaBlock = source.match(/case "lambda"[\s\S]*?term\.param\)/);
      expect(lambdaBlock).not.toBeNull();
      expect(lambdaBlock![0]).toMatch(/test\(term\.param\)/);
    });
  });

  // =========================================================================
  // #3 HIGH — lc-compiler replace doesn't escape $ in replacement
  // =========================================================================
  describe("#3 — lc-compiler replace should escape $ backreferences", () => {
    it("should escape $ in replacement string", () => {
      const source = readFileSync("src/logic/lc-compiler.ts", "utf-8");
      const replaceCase = source.match(/case "replace"[\s\S]*?\.replace\(/);
      expect(replaceCase).not.toBeNull();
      // Should escape $ in the replacement to prevent backreference injection
      expect(replaceCase![0]).toMatch(/\$\$|\\\$/);
    });
  });

  // =========================================================================
  // #6 MEDIUM — lc-solver parseDate missing "sept"
  // =========================================================================
  describe("#6 — lc-solver parseDate should include sept abbreviation", () => {
    it("should have sept as a standalone key in months lookup", () => {
      const source = readFileSync("src/logic/lc-solver.ts", "utf-8");
      expect(source).toMatch(/\bsept\b.*:\s*"09"/);
    });
  });

  // =========================================================================
  // #7 MEDIUM — predicate-compiler missing arguments in blocklist
  // =========================================================================
  describe("#7 — predicate-compiler should block arguments keyword", () => {
    it("should include arguments in dangerous patterns", () => {
      const source = readFileSync("src/persistence/predicate-compiler.ts", "utf-8");
      expect(source).toMatch(/\\barguments\\b/);
    });
  });

  // =========================================================================
  // #10 LOW — lc-compiler match doesn't validate negative group
  // =========================================================================
  describe("#10 — lc-compiler match should reject negative group", () => {
    it("should guard against negative group index", () => {
      const source = readFileSync("src/logic/lc-compiler.ts", "utf-8");
      // The match case should check for negative group and return "null"
      const matchCase = source.match(/case "match"[\s\S]*?term\.group\s*<\s*0/);
      expect(matchCase).not.toBeNull();
    });
  });
});
