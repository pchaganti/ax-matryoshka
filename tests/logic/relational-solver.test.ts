/**
 * Tests for Relational Solver
 *
 * The relational solver runs bidirectionally:
 * - Forward: (program, input) → output
 * - Backward: (input, output) → program (SYNTHESIS)
 *
 * Key capabilities:
 * 1. Automatic primitive composition
 * 2. Function derivation (filter from reduce)
 * 3. Synthesis on failure (when built-ins don't work)
 */

import { describe, it, expect } from "vitest";

// Import the relational solver (to be implemented)
import {
  synthesizeFromExamples,
  deriveFunction,
  composeToMatch,
  evaluateComposition,
  type Primitive,
  type Composition,
} from "../../src/logic/relational-solver.js";

describe("Relational Solver", () => {

  describe("Primitive Composition", () => {
    /**
     * Given a set of primitives and input/output examples,
     * the solver should find a composition that transforms input → output
     */

    it("should compose match + parseInt for '$100' -> 100", () => {
      const examples = [
        { input: "$100", output: 100 },
        { input: "$250", output: 250 },
      ];

      const result = synthesizeFromExamples(examples);

      expect(result.success).toBe(true);
      expect(result.composition).toBeDefined();
      // The composition should be: parseInt(match(input, /\$(\d+)/, 1))
      expect(result.apply("$500")).toBe(500);
    });

    it("should compose match + replace + parseInt for '$1,234' -> 1234", () => {
      const examples = [
        { input: "$1,234", output: 1234 },
        { input: "$5,678", output: 5678 },
      ];

      const result = synthesizeFromExamples(examples);

      expect(result.success).toBe(true);
      expect(result.apply("$9,999")).toBe(9999);
      expect(result.apply("$12,345")).toBe(12345);
    });

    it("should compose match + parseDate for 'Jan 15, 2024' -> '2024-01-15'", () => {
      const examples = [
        { input: "Jan 15, 2024", output: "2024-01-15" },
        { input: "Feb 20, 2024", output: "2024-02-20" },
      ];

      const result = synthesizeFromExamples(examples);

      expect(result.success).toBe(true);
      expect(result.apply("Mar 10, 2024")).toBe("2024-03-10");
    });

    it("should compose split + index for 'a,b,c' -> 'b'", () => {
      const examples = [
        { input: "a,b,c", output: "b" },
        { input: "x,y,z", output: "y" },
      ];

      const result = synthesizeFromExamples(examples);

      expect(result.success).toBe(true);
      expect(result.apply("1,2,3")).toBe("2");
    });

    it("should find multi-step composition: extract number from 'Total: $1,234.56'", () => {
      const examples = [
        { input: "Total: $1,234.56", output: 1234.56 },
        { input: "Total: $999.00", output: 999.00 },
      ];

      const result = synthesizeFromExamples(examples);

      expect(result.success).toBe(true);
      expect(result.apply("Total: $5,000.00")).toBe(5000.00);
    });
  });

  describe("Function Derivation", () => {
    /**
     * Higher-order functions should be derivable from primitives.
     * filter = reduce with conditional cons
     * map = reduce with transform + cons
     */

    it("should derive filter from reduce", () => {
      const filter = deriveFunction("filter");

      expect(filter).toBeDefined();

      // filter([1,2,3,4,5], x => x > 2) should equal [3,4,5]
      const predicate = (x: number) => x > 2;
      const result = filter([1, 2, 3, 4, 5], predicate);

      expect(result).toEqual([3, 4, 5]);
    });

    it("should derive map from reduce", () => {
      const map = deriveFunction("map");

      expect(map).toBeDefined();

      // map([1,2,3], x => x * 2) should equal [2,4,6]
      const transform = (x: number) => x * 2;
      const result = map([1, 2, 3], transform);

      expect(result).toEqual([2, 4, 6]);
    });

    it("should derive sum from reduce", () => {
      const sum = deriveFunction("sum");

      expect(sum).toBeDefined();

      const result = sum([1, 2, 3, 4, 5]);
      expect(result).toBe(15);
    });

    it("should derive count from reduce", () => {
      const count = deriveFunction("count");

      expect(count).toBeDefined();

      const result = count([1, 2, 3, 4, 5]);
      expect(result).toBe(5);
    });
  });

  describe("Automatic Synthesis on Failure", () => {
    /**
     * When a built-in primitive fails (returns null/undefined),
     * the solver should automatically try to synthesize a composition
     * that works for the given data.
     */

    it("should synthesize date parser for unusual format '15-Jan-24'", () => {
      // Built-in parseDate doesn't handle this format
      const examples = [
        { input: "15-Jan-24", output: "2024-01-15" },
        { input: "20-Feb-24", output: "2024-02-20" },
      ];

      const result = synthesizeFromExamples(examples);

      expect(result.success).toBe(true);
      expect(result.apply("10-Mar-24")).toBe("2024-03-10");
    });

    it("should synthesize parser for 'Q3-2024' -> '2024-07'", () => {
      const examples = [
        { input: "Q1-2024", output: "2024-01" },
        { input: "Q2-2024", output: "2024-04" },
        { input: "Q3-2024", output: "2024-07" },
        { input: "Q4-2024", output: "2024-10" },
      ];

      const result = synthesizeFromExamples(examples);

      expect(result.success).toBe(true);
      expect(result.apply("Q1-2025")).toBe("2025-01");
    });

    it("should synthesize extractor for complex pattern", () => {
      // Extract order ID from "Order #12345 (SHIPPED)"
      const examples = [
        { input: "Order #12345 (SHIPPED)", output: 12345 },
        { input: "Order #67890 (PENDING)", output: 67890 },
      ];

      const result = synthesizeFromExamples(examples);

      expect(result.success).toBe(true);
      expect(result.apply("Order #11111 (DELIVERED)")).toBe(11111);
    });
  });

  describe("Composition Search", () => {
    /**
     * Given a target transformation, find the minimal composition
     * of available primitives that achieves it.
     */

    it("should find minimal composition for simple extraction", () => {
      const composition = composeToMatch(
        { input: "value: 42", output: 42 },
        ["match", "parseInt", "parseFloat", "replace", "split"]
      );

      expect(composition).toBeDefined();
      expect(composition!.steps.length).toBeLessThanOrEqual(2);
    });

    it("should find composition using available primitives only", () => {
      const limitedPrimitives: Primitive[] = ["match", "parseInt"];

      const composition = composeToMatch(
        { input: "$100", output: 100 },
        limitedPrimitives
      );

      expect(composition).toBeDefined();
      // Should only use match and parseInt
      expect(composition!.steps.every(s => limitedPrimitives.includes(s.primitive))).toBe(true);
    });

    it("should return null when no composition is possible", () => {
      // Can't transform a string to a completely unrelated string
      // without the right primitives
      const composition = composeToMatch(
        { input: "hello", output: "HELLO" },
        ["parseInt", "parseFloat"] // no string transform primitives
      );

      expect(composition).toBeNull();
    });
  });

  describe("Bidirectional Evaluation", () => {
    /**
     * The relational evaluator should work in both directions:
     * - Forward: evaluate(composition, input) → output
     * - Backward: synthesize(input, output) → composition
     */

    it("should evaluate composition forward", () => {
      const composition: Composition = {
        steps: [
          { primitive: "match", args: { pattern: "\\d+", group: 0 } },
          { primitive: "parseInt", args: {} },
        ]
      };

      // Forward evaluation
      const result = evaluateComposition(composition, "abc123def");
      expect(result).toBe(123);
    });

    it("should synthesize composition backward", () => {
      // Backward: given input and output, find composition
      const result = synthesizeFromExamples([
        { input: "abc123def", output: 123 }
      ]);

      expect(result.success).toBe(true);
      // The synthesized composition should work on new inputs
      expect(result.apply("xyz456uvw")).toBe(456);
    });
  });

  describe("regex validation in primitives", () => {
    it("should return null for match with nested-quantifier regex (ReDoS)", () => {
      const composition: Composition = { steps: [{ primitive: "match" as Primitive, args: { pattern: "(a+)+", group: 0 } }] };
      const result = evaluateComposition(composition, "aaaaaaaaaaaaaaaaaa!");
      expect(result).toBeNull();
    });

    it("should return null for replace with nested-quantifier regex (ReDoS)", () => {
      const composition: Composition = { steps: [{ primitive: "replace" as Primitive, args: { from: "(a+)+", to: "x" } }] };
      const result = evaluateComposition(composition, "aaaaaaaaaaaaaaaaaa!");
      expect(result).toBeNull();
    });
  });

  describe("NaN guard in parseInt/parseFloat primitives", () => {
    it("should return null instead of NaN for parseInt of non-numeric input", () => {
      const composition: Composition = { steps: [{ primitive: "parseInt" as Primitive, args: {} }] };
      const result = evaluateComposition(composition, "hello");
      expect(result).toBeNull();
    });

    it("should return null instead of NaN for parseFloat of non-numeric input", () => {
      const composition: Composition = { steps: [{ primitive: "parseFloat" as Primitive, args: {} }] };
      const result = evaluateComposition(composition, "hello");
      expect(result).toBeNull();
    });

    it("should return valid number for parseInt of numeric input", () => {
      const composition: Composition = { steps: [{ primitive: "parseInt" as Primitive, args: {} }] };
      const result = evaluateComposition(composition, "42");
      expect(result).toBe(42);
    });
  });
});

