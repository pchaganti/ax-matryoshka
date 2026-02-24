/**
 * Tests for Constraint Verification
 *
 * TDD tests for the constraint verifier that checks if results
 * satisfy specified output constraints.
 */

import { describe, it, expect } from "vitest";
import { verifyResult, verifyInvariant } from "../../src/constraints/verifier.js";
import type { OutputConstraint, SynthesisConstraint } from "../../src/constraints/types.js";

describe("verifyResult", () => {
  describe("type checking", () => {
    it("should accept correct number type", () => {
      const constraint: SynthesisConstraint = { output: { type: "number" } };
      const result = verifyResult(42, constraint);
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it("should reject wrong type (string instead of number)", () => {
      const constraint: SynthesisConstraint = { output: { type: "number" } };
      const result = verifyResult("hello", constraint);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain("Expected type number, got string");
    });

    it("should accept correct string type", () => {
      const constraint: SynthesisConstraint = { output: { type: "string" } };
      const result = verifyResult("hello", constraint);
      expect(result.valid).toBe(true);
    });

    it("should accept correct boolean type", () => {
      const constraint: SynthesisConstraint = { output: { type: "boolean" } };
      expect(verifyResult(true, constraint).valid).toBe(true);
      expect(verifyResult(false, constraint).valid).toBe(true);
    });

    it("should accept correct array type", () => {
      const constraint: SynthesisConstraint = { output: { type: "array" } };
      const result = verifyResult([1, 2, 3], constraint);
      expect(result.valid).toBe(true);
    });

    it("should reject non-array as array", () => {
      const constraint: SynthesisConstraint = { output: { type: "array" } };
      const result = verifyResult("not an array", constraint);
      expect(result.valid).toBe(false);
      expect(result.errors[0]).toContain("Expected type array");
    });

    it("should accept correct object type", () => {
      const constraint: SynthesisConstraint = { output: { type: "object" } };
      const result = verifyResult({ a: 1 }, constraint);
      expect(result.valid).toBe(true);
    });

    it("should reject array as object", () => {
      const constraint: SynthesisConstraint = { output: { type: "object" } };
      const result = verifyResult([1, 2], constraint);
      expect(result.valid).toBe(false);
    });

    it("should accept null type", () => {
      const constraint: SynthesisConstraint = { output: { type: "null" } };
      const result = verifyResult(null, constraint);
      expect(result.valid).toBe(true);
    });
  });

  describe("numeric constraints", () => {
    it("should accept value within min/max range", () => {
      const constraint: SynthesisConstraint = {
        output: { type: "number", min: 0, max: 100 },
      };
      expect(verifyResult(50, constraint).valid).toBe(true);
      expect(verifyResult(0, constraint).valid).toBe(true);
      expect(verifyResult(100, constraint).valid).toBe(true);
    });

    it("should reject value below min", () => {
      const constraint: SynthesisConstraint = {
        output: { type: "number", min: 0 },
      };
      const result = verifyResult(-5, constraint);
      expect(result.valid).toBe(false);
      expect(result.errors[0]).toContain("below minimum");
    });

    it("should reject value above max", () => {
      const constraint: SynthesisConstraint = {
        output: { type: "number", max: 100 },
      };
      const result = verifyResult(150, constraint);
      expect(result.valid).toBe(false);
      expect(result.errors[0]).toContain("above maximum");
    });

    it("should accept integer when required", () => {
      const constraint: SynthesisConstraint = {
        output: { type: "number", integer: true },
      };
      expect(verifyResult(42, constraint).valid).toBe(true);
    });

    it("should reject non-integer when integer required", () => {
      const constraint: SynthesisConstraint = {
        output: { type: "number", integer: true },
      };
      const result = verifyResult(42.5, constraint);
      expect(result.valid).toBe(false);
      expect(result.errors[0]).toContain("integer");
    });

    it("should reject NaN", () => {
      const constraint: SynthesisConstraint = { output: { type: "number" } };
      const result = verifyResult(NaN, constraint);
      expect(result.valid).toBe(false);
      expect(result.errors[0]).toContain("NaN");
    });

    it("should reject Infinity by default", () => {
      const constraint: SynthesisConstraint = { output: { type: "number" } };
      const result = verifyResult(Infinity, constraint);
      expect(result.valid).toBe(false);
    });
  });

  describe("string constraints", () => {
    it("should accept string matching pattern", () => {
      const constraint: SynthesisConstraint = {
        output: { type: "string", pattern: "^\\d+$" },
      };
      expect(verifyResult("12345", constraint).valid).toBe(true);
    });

    it("should reject string not matching pattern", () => {
      const constraint: SynthesisConstraint = {
        output: { type: "string", pattern: "^\\d+$" },
      };
      const result = verifyResult("abc", constraint);
      expect(result.valid).toBe(false);
      expect(result.errors[0]).toContain("pattern");
    });

    it("should accept string within length bounds", () => {
      const constraint: SynthesisConstraint = {
        output: { type: "string", minLength: 2, maxLength: 10 },
      };
      expect(verifyResult("hello", constraint).valid).toBe(true);
    });

    it("should reject string below minLength", () => {
      const constraint: SynthesisConstraint = {
        output: { type: "string", minLength: 5 },
      };
      const result = verifyResult("hi", constraint);
      expect(result.valid).toBe(false);
      expect(result.errors[0]).toContain("minimum length");
    });

    it("should reject string above maxLength", () => {
      const constraint: SynthesisConstraint = {
        output: { type: "string", maxLength: 5 },
      };
      const result = verifyResult("hello world", constraint);
      expect(result.valid).toBe(false);
      expect(result.errors[0]).toContain("maximum length");
    });

    it("should reject ReDoS pattern as invalid", () => {
      const constraint: SynthesisConstraint = {
        output: { type: "string", pattern: "(a+)+" },
      };
      const result = verifyResult("aaa", constraint);
      expect(result.valid).toBe(false);
      expect(result.errors[0]).toContain("pattern");
    });
  });

  describe("array constraints", () => {
    it("should accept array within item count bounds", () => {
      const constraint: SynthesisConstraint = {
        output: { type: "array", minItems: 1, maxItems: 5 },
      };
      expect(verifyResult([1, 2, 3], constraint).valid).toBe(true);
    });

    it("should reject array below minItems", () => {
      const constraint: SynthesisConstraint = {
        output: { type: "array", minItems: 2 },
      };
      const result = verifyResult([1], constraint);
      expect(result.valid).toBe(false);
      expect(result.errors[0]).toContain("minimum");
    });

    it("should reject array above maxItems", () => {
      const constraint: SynthesisConstraint = {
        output: { type: "array", maxItems: 2 },
      };
      const result = verifyResult([1, 2, 3, 4], constraint);
      expect(result.valid).toBe(false);
      expect(result.errors[0]).toContain("maximum");
    });

    it("should validate array item types", () => {
      const constraint: SynthesisConstraint = {
        output: { type: "array", items: { type: "number" } },
      };
      expect(verifyResult([1, 2, 3], constraint).valid).toBe(true);
    });

    it("should reject array with wrong item types", () => {
      const constraint: SynthesisConstraint = {
        output: { type: "array", items: { type: "number" } },
      };
      const result = verifyResult([1, "two", 3], constraint);
      expect(result.valid).toBe(false);
      expect(result.errors[0]).toContain("item");
    });

    it("should accept empty array when minItems is 0 or undefined", () => {
      const constraint: SynthesisConstraint = {
        output: { type: "array" },
      };
      expect(verifyResult([], constraint).valid).toBe(true);
    });
  });

  describe("object constraints", () => {
    it("should accept object with required properties", () => {
      const constraint: SynthesisConstraint = {
        output: {
          type: "object",
          properties: {
            name: { type: "string" },
            age: { type: "number" },
          },
          required: ["name"],
        },
      };
      expect(verifyResult({ name: "Alice", age: 30 }, constraint).valid).toBe(true);
    });

    it("should reject object missing required property", () => {
      const constraint: SynthesisConstraint = {
        output: {
          type: "object",
          properties: {
            name: { type: "string" },
          },
          required: ["name"],
        },
      };
      const result = verifyResult({}, constraint);
      expect(result.valid).toBe(false);
      expect(result.errors[0]).toContain("required");
    });

    it("should validate property types", () => {
      const constraint: SynthesisConstraint = {
        output: {
          type: "object",
          properties: {
            count: { type: "number" },
          },
        },
      };
      const result = verifyResult({ count: "not a number" }, constraint);
      expect(result.valid).toBe(false);
    });

    it("should accept object with extra properties", () => {
      const constraint: SynthesisConstraint = {
        output: {
          type: "object",
          properties: {
            name: { type: "string" },
          },
        },
      };
      const result = verifyResult({ name: "Alice", extra: "field" }, constraint);
      expect(result.valid).toBe(true);
    });
  });

  describe("invariants", () => {
    it("should pass when invariant is satisfied", () => {
      const constraint: SynthesisConstraint = {
        output: { type: "number" },
        invariants: ["result > 0"],
      };
      const result = verifyResult(42, constraint);
      expect(result.valid).toBe(true);
    });

    it("should fail when invariant is violated", () => {
      const constraint: SynthesisConstraint = {
        output: { type: "number" },
        invariants: ["result > 0"],
      };
      const result = verifyResult(-5, constraint);
      expect(result.valid).toBe(false);
      expect(result.errors[0]).toContain("Invariant");
    });

    it("should check multiple invariants", () => {
      const constraint: SynthesisConstraint = {
        output: { type: "number" },
        invariants: ["result > 0", "result < 100"],
      };
      expect(verifyResult(50, constraint).valid).toBe(true);
      expect(verifyResult(150, constraint).valid).toBe(false);
    });
  });

  describe("edge cases", () => {
    it("should handle undefined result", () => {
      const constraint: SynthesisConstraint = { output: { type: "number" } };
      const result = verifyResult(undefined, constraint);
      expect(result.valid).toBe(false);
    });

    it("should handle null when not expected", () => {
      const constraint: SynthesisConstraint = { output: { type: "number" } };
      const result = verifyResult(null, constraint);
      expect(result.valid).toBe(false);
    });

    it("should collect multiple errors", () => {
      const constraint: SynthesisConstraint = {
        output: { type: "number", min: 0, max: 10 },
      };
      const result = verifyResult("not a number", constraint);
      expect(result.errors.length).toBeGreaterThan(0);
    });
  });
});

describe("verifyInvariant", () => {
  it("should evaluate simple comparisons", () => {
    expect(verifyInvariant(42, "result > 0")).toBe(true);
    expect(verifyInvariant(-1, "result > 0")).toBe(false);
    expect(verifyInvariant(10, "result >= 10")).toBe(true);
    expect(verifyInvariant(10, "result <= 10")).toBe(true);
  });

  it("should evaluate equality checks", () => {
    expect(verifyInvariant(42, "result === 42")).toBe(true);
    expect(verifyInvariant(42, "result !== 0")).toBe(true);
  });

  it("should evaluate array length checks", () => {
    expect(verifyInvariant([1, 2, 3], "result.length > 0")).toBe(true);
    expect(verifyInvariant([], "result.length === 0")).toBe(true);
  });

  it("should evaluate type checks", () => {
    expect(verifyInvariant(42, "typeof result === 'number'")).toBe(true);
    expect(verifyInvariant("hello", "typeof result === 'string'")).toBe(true);
  });

  it("should return false for invalid expressions", () => {
    expect(verifyInvariant(42, "invalid syntax ][")).toBe(false);
  });

  it("should prevent dangerous code execution", () => {
    // Should not execute arbitrary code
    expect(verifyInvariant(42, "process.exit(1)")).toBe(false);
    expect(verifyInvariant(42, "require('fs')")).toBe(false);
  });

  it("should reject bracket access to dangerous properties", () => {
    expect(verifyInvariant({}, 'result["constructor"]')).toBe(false);
    expect(verifyInvariant({}, 'result["__proto__"]')).toBe(false);
    expect(verifyInvariant({}, 'result["prototype"]')).toBe(false);
  });

  it("should reject function calls (parentheses)", () => {
    expect(verifyInvariant("hello", "result.toString()")).toBe(false);
    expect(verifyInvariant(42, "(function(){})()")).toBe(false);
  });

  it("should still allow valid comparison expressions", () => {
    expect(verifyInvariant(42, "result > 0")).toBe(true);
    expect(verifyInvariant("hello", "result.length > 3")).toBe(true);
    expect(verifyInvariant(10, "result === 10")).toBe(true);
    expect(verifyInvariant([1, 2], "result.length > 0")).toBe(true);
  });
});
