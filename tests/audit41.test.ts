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
  describe("#1 — sandbox-tools should lock down constructor property", () => {
    it("should define constructor as undefined on sandboxGlobals", () => {
      const source = readFileSync("src/synthesis/sandbox-tools.ts", "utf-8");
      // Should have Object.defineProperty lockdown for constructor
      expect(source).toMatch(/defineProperty\(sandboxGlobals,\s*['"]constructor['"]/);
    });
  });

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
  // #4 MEDIUM — lc-solver add missing isFinite guard
  // =========================================================================
  describe("#4 — lc-solver add should guard against Infinity", () => {
    it("should check isFinite in evaluate add", () => {
      const source = readFileSync("src/logic/lc-solver.ts", "utf-8");
      const addCase = source.match(/case "add":\s*\{[\s\S]*?return left \+ right/);
      expect(addCase).not.toBeNull();
      expect(addCase![0]).toMatch(/isFinite|Number\.isFinite/);
    });

    it("should check isFinite in evaluateWithBinding add", () => {
      const source = readFileSync("src/logic/lc-solver.ts", "utf-8");
      // Find the second add case (in evaluateWithBinding)
      const allAddCases = source.match(/case "add":\s*\{[\s\S]*?(?:return left \+ right|addResult.*left \+ right)[\s\S]*?case "add":\s*\{[\s\S]*?(?:return left \+ right|addResult.*left \+ right)/);
      expect(allAddCases).not.toBeNull();
      // The second add case should also have isFinite
      const secondAdd = allAddCases![0].match(/case "add":\s*\{[\s\S]*?(?:return left \+ right|addResult.*left \+ right)$/);
      expect(secondAdd).not.toBeNull();
      expect(secondAdd![0]).toMatch(/isFinite|Number\.isFinite/);
    });
  });

  // =========================================================================
  // #5 MEDIUM — lc-solver sum string/object paths use isNaN not isFinite
  // =========================================================================
  describe("#5 — lc-solver sum should use isFinite for parsed strings", () => {
    it("should use isFinite instead of isNaN for string parsing in sum", () => {
      const source = readFileSync("src/logic/lc-solver.ts", "utf-8");
      // Find the sum case's string branch
      const sumStringBranch = source.match(/case "sum"[\s\S]*?typeof val === "string"[\s\S]*?parseFloat\(cleaned\)[\s\S]*?return acc \+ num/);
      expect(sumStringBranch).not.toBeNull();
      // Should use isFinite, not just isNaN
      expect(sumStringBranch![0]).toMatch(/isFinite\(num\)|Number\.isFinite\(num\)|!isFinite/);
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
  // #8 MEDIUM — handle-ops sort NaN guard
  // =========================================================================
  describe("#8 — handle-ops sort should handle NaN comparison", () => {
    it("should guard against NaN in numeric sort comparisons", () => {
      const source = readFileSync("src/persistence/handle-ops.ts", "utf-8");
      // Capture past the subtraction to include the NaN guard
      const sortBlock = source.match(/sort\(\(a, b\)[\s\S]*?aVal - bVal[\s\S]*?cmp/);
      expect(sortBlock).not.toBeNull();
      expect(sortBlock![0]).toMatch(/isNaN|NaN|isFinite/);
    });
  });

  // =========================================================================
  // #9 MEDIUM — lc-compiler parseInt/parseFloat lacks NaN guard
  // =========================================================================
  describe("#9 — lc-compiler parseInt/parseFloat should guard NaN", () => {
    it("compiled parseInt should return null for NaN", () => {
      const source = readFileSync("src/logic/lc-compiler.ts", "utf-8");
      // The parseInt case should emit code containing isNaN or isFinite guard
      expect(source).toMatch(/case "parseInt"[\s\S]*?isNaN|case "parseInt"[\s\S]*?isFinite/);
    });

    it("compiled parseFloat should return null for NaN", () => {
      const source = readFileSync("src/logic/lc-compiler.ts", "utf-8");
      // The parseFloat case should emit code containing isNaN or isFinite guard
      expect(source).toMatch(/case "parseFloat"[\s\S]*?isNaN|case "parseFloat"[\s\S]*?isFinite/);
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
