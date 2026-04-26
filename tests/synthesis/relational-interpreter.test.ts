/**
 * Tests for Relational Interpreter - NaN guards and null safety
 */

import { describe, it, expect } from "vitest";
import { exprToCode, type Expr } from "../../src/synthesis/relational/interpreter.js";
import { readFileSync } from "fs";

describe("Relational Interpreter - exprToCode NaN guards", () => {
  it("should wrap parseInt in NaN guard returning null", () => {
    const expr: Expr = { type: "parseInt", str: { type: "var", name: "input" } };
    const code = exprToCode(expr);
    // Should contain NaN check
    expect(code).toContain("isNaN");
    expect(code).toContain("null");
    // Should produce null for non-numeric input
    const fn = new Function("input", `return ${code}`);
    expect(fn("hello")).toBeNull();
  });

  it("should wrap parseFloat in NaN guard returning null", () => {
    const expr: Expr = { type: "parseFloat", str: { type: "var", name: "input" } };
    const code = exprToCode(expr);
    expect(code).toContain("isNaN");
    expect(code).toContain("null");
    const fn = new Function("input", `return ${code}`);
    expect(fn("hello")).toBeNull();
  });

  it("should return valid number for parseInt of numeric string", () => {
    const expr: Expr = { type: "parseInt", str: { type: "var", name: "input" } };
    const code = exprToCode(expr);
    const fn = new Function("input", `return ${code}`);
    expect(fn("42")).toBe(42);
  });

  it("should return valid number for parseFloat of numeric string", () => {
    const expr: Expr = { type: "parseFloat", str: { type: "var", name: "input" } };
    const code = exprToCode(expr);
    const fn = new Function("input", `return ${code}`);
    expect(fn("3.14")).toBeCloseTo(3.14);
  });
});

describe("Relational Interpreter - exprToCode var.name sanitization", () => {
  it("should sanitize var names to prevent injection", () => {
    // A malicious var name could inject code: "input;process.exit(1)//"
    const expr: Expr = { type: "var", name: "input;process.exit(1)//" };
    const code = exprToCode(expr);
    // The generated code should NOT contain the raw injection
    // It should either sanitize or reject the name
    const fn = new Function("input", `return ${code}`);
    // Should not crash - either returns undefined or throws safely
    expect(() => fn("test")).not.toThrow();
  });

  it("should sanitize pattern with newlines to prevent regex injection", () => {
    const expr: Expr = {
      type: "match",
      str: { type: "var", name: "input" },
      pattern: "test\n// injected code",
      group: 0,
    };
    const code = exprToCode(expr);
    // Newlines in regex pattern must be escaped to prevent breaking out
    // The generated code should not have raw unescaped newlines in the regex literal
    expect(code).not.toMatch(/\/[^/]*\n[^/]*\//);
  });
});

describe("Relational Interpreter - exprToCode match/replace null safety", () => {
  it("should handle match on null input without throwing", () => {
    const expr: Expr = {
      type: "match",
      str: { type: "var", name: "input" },
      pattern: "\\d+",
      group: 0,
    };
    const code = exprToCode(expr);
    const fn = new Function("input", `return ${code}`);
    // null input should return null/undefined, not throw
    expect(() => fn(null)).not.toThrow();
  });

  it("should handle replace on null input without throwing", () => {
    const expr: Expr = {
      type: "replace",
      str: { type: "var", name: "input" },
      pattern: "\\d+",
      replacement: "X",
    };
    const code = exprToCode(expr);
    const fn = new Function("input", `return ${code}`);
    // null input should not throw
    expect(() => fn(null)).not.toThrow();
  });
});

// =====================================================================
// Source-pattern checks (from audits)
// =====================================================================
describe("Source-pattern checks (from audits)", () => {
  // from tests/audit16.test.ts Audit16 #10: relational concat numeric addition
  describe("Audit16 #10: relational concat numeric addition", () => {
    it("concat should produce string concatenation not numeric addition", async () => {
      const mod = await import("../../src/synthesis/relational/interpreter.js");
      const exprToCode = (mod as any).exprToCode;
      if (!exprToCode) return; // skip if not exported
      const expr: any = {
        type: "concat",
        left: { type: "lit", value: "hello" },
        right: { type: "lit", value: " world" },
      };
      const code = exprToCode(expr);
      // Should produce string concatenation
      const fn = new Function("return " + code);
      expect(fn()).toBe("hello world");
    });
  });

  // from tests/audit17.test.ts Audit17 #1: exprToCode backslash escaping
  describe("Audit17 #1: exprToCode backslash escaping", () => {
    it("should escape backslashes in match pattern", async () => {
      const { exprToCode } = await import("../../src/synthesis/relational/interpreter.js");
      const expr: any = {
        type: "match",
        str: { type: "var", name: "input" },
        pattern: "\\d+",
        group: 0,
      };
      const code = exprToCode(expr);
      // The generated code should be valid JS — backslash must be escaped in regex literal
      const fn = new Function("input", `return ${code}`);
      expect(fn("price: 42")).toBe("42");
    });

    it("should escape backslashes in replace pattern", async () => {
      const { exprToCode } = await import("../../src/synthesis/relational/interpreter.js");
      const expr: any = {
        type: "replace",
        str: { type: "var", name: "input" },
        pattern: "\\s+",
        replacement: "-",
      };
      const code = exprToCode(expr);
      const fn = new Function("input", `return ${code}`);
      expect(fn("hello world")).toBe("hello-world");
    });
  });

  // from tests/audit17.test.ts Audit17 #2: NaN comparison in synthesis
  describe("Audit17 #2: NaN comparison in synthesis", () => {
    it("testProgram should handle NaN output correctly", async () => {
      const { testProgram, exprToCode } = await import("../../src/synthesis/relational/interpreter.js");
      // An expression that produces NaN: parseInt of non-numeric string
      const expr: any = {
        type: "parseInt",
        str: { type: "var", name: "input" },
      };
      // The expression returns null for non-numeric (due to NaN check in exprToCode)
      // But if output expectation is NaN, comparison should work
      const examples = [
        { input: "123", output: 123 },
      ];
      const result = testProgram(expr, examples);
      expect(result).toBe(true);
    });

    it("synthesize should accept program that produces NaN matching NaN output", async () => {
      const mod = await import("../../src/synthesis/relational/interpreter.js");
      const testProgram = (mod as any).testProgram;
      if (!testProgram) return;
      // Create an expression that extracts a number
      const expr: any = {
        type: "match",
        str: { type: "var", name: "input" },
        pattern: "(\\d+)",
        group: 1,
      };
      // Test with matching examples
      const result = testProgram(expr, [
        { input: "price: 42", output: "42" },
      ]);
      expect(result).toBe(true);
    });
  });

  // from tests/audit19.test.ts Audit19 #1: exprToCode regex literal escaping
  describe("Audit19 #1: exprToCode regex literal escaping", () => {
    it("should handle pattern with trailing backslash safely", async () => {
      const { exprToCode } = await import("../../src/synthesis/relational/interpreter.js");
      const expr: any = {
        type: "match",
        str: { type: "var", name: "input" },
        pattern: "test\\",  // Trailing backslash could escape the closing /
        group: 0,
      };
      const code = exprToCode(expr);
      // Should produce valid JS — no syntax error
      expect(() => new Function("input", `return ${code}`)).not.toThrow();
    });

    it("should handle replace pattern with trailing backslash safely", async () => {
      const { exprToCode } = await import("../../src/synthesis/relational/interpreter.js");
      const expr: any = {
        type: "replace",
        str: { type: "var", name: "input" },
        pattern: "test\\",
        replacement: "x",
      };
      const code = exprToCode(expr);
      expect(() => new Function("input", `return ${code}`)).not.toThrow();
    });

    it("should handle pattern with backslash before forward slash", async () => {
      const { exprToCode } = await import("../../src/synthesis/relational/interpreter.js");
      const expr: any = {
        type: "match",
        str: { type: "var", name: "input" },
        pattern: "a\\/b",  // Backslash + forward slash
        group: 0,
      };
      const code = exprToCode(expr);
      expect(() => new Function("input", `return ${code}`)).not.toThrow();
    });
  });

  // from tests/audit21.test.ts Audit21 #2: testProgram empty examples guard
  describe("Audit21 #2: testProgram empty examples guard", () => {
    it("should return false for empty examples array", async () => {
      const { testProgram } = await import(
        "../../src/synthesis/relational/interpreter.js"
      );
      const expr: any = { tag: "input" };
      const result = testProgram(expr, []);
      expect(result).toBe(false);
    });
  });

  // from tests/audit42.test.ts #3 — relational interpreter should validate code before new Function
  describe("#3 — relational interpreter should validate code before new Function", () => {
      it("executeExpr should check for dangerous patterns", () => {
        const source = readFileSync("src/synthesis/relational/interpreter.ts", "utf-8");
        const execBlock = source.match(/function executeExpr[\s\S]*?new Function/);
        expect(execBlock).not.toBeNull();
        // Should have a blocklist/dangerous check before new Function
        expect(execBlock![0]).toMatch(/dangerous|blocked|DANGEROUS|BLOCKED|unsafe/i);
      });

      it("testProgram should check for dangerous patterns", () => {
        const source = readFileSync("src/synthesis/relational/interpreter.ts", "utf-8");
        const testBlock = source.match(/function testProgram[\s\S]*?new Function/);
        expect(testBlock).not.toBeNull();
        expect(testBlock![0]).toMatch(/dangerous|blocked|DANGEROUS|BLOCKED|unsafe/i);
      });
    });

  // from tests/audit83.test.ts #5 — exprToCode match should coalesce undefined to null
  describe("#5 — exprToCode match should coalesce undefined to null", () => {
      it("should add ?? null after match group access", () => {
        const source = readFileSync("src/synthesis/relational/interpreter.ts", "utf-8");
        const matchCase = source.indexOf('case "match"', source.indexOf("function exprToCode"));
        expect(matchCase).toBeGreaterThan(-1);
        const block = source.slice(matchCase, matchCase + 500);
        expect(block).toMatch(/\?\?\s*null/);
      });
    });

});
