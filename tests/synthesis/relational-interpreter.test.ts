/**
 * Tests for Relational Interpreter - NaN guards and null safety
 */

import { describe, it, expect } from "vitest";
import { exprToCode, type Expr } from "../../src/synthesis/relational/interpreter.js";

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
