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
import { readFileSync } from "fs";

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

  describe("parseCurrency recursion depth limit", () => {
    it("should not stack overflow on deeply nested parentheses", () => {
      // Create deeply nested negative parens: ((((($1,234)))))
      let input = "$100";
      for (let i = 0; i < 200; i++) {
        input = `(${input})`;
      }
      // This should either return null or a number, but not throw stack overflow
      const result = synthesizeFromExamples([
        { input: "$100", output: 100 },
        { input: "$200", output: 200 },
      ]);
      if (result.success) {
        expect(() => result.apply(input)).not.toThrow();
      }
    });
  });

  describe("parseDateImpl month/day validation", () => {
    it("should reject invalid month in US format (13/01/2024)", () => {
      const result = synthesizeFromExamples([
        { input: "01/15/2024", output: "2024-01-15" },
        { input: "02/20/2024", output: "2024-02-20" },
      ]);
      if (result.success) {
        // Month 13 should return null, not "2024-13-01"
        const output = result.apply("13/01/2024");
        if (typeof output === "string" && output.match(/^\d{4}-\d{2}-\d{2}$/)) {
          const month = parseInt(output.split("-")[1], 10);
          expect(month).toBeLessThanOrEqual(12);
          expect(month).toBeGreaterThanOrEqual(1);
        }
      }
    });

    it("should reject invalid day in date (32nd of January)", () => {
      const result = synthesizeFromExamples([
        { input: "01/15/2024", output: "2024-01-15" },
        { input: "02/20/2024", output: "2024-02-20" },
      ]);
      if (result.success) {
        const output = result.apply("01/32/2024");
        if (typeof output === "string" && output.match(/^\d{4}-\d{2}-\d{2}$/)) {
          const day = parseInt(output.split("-")[2], 10);
          expect(day).toBeLessThanOrEqual(31);
        }
      }
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


// =====================================================================
// Source-pattern checks (from audits)
// =====================================================================
describe("Source-pattern checks (from audits)", () => {
  // from tests/audit23.test.ts Audit23 #1: relational-solver parseDate month-aware day limit
  describe("Audit23 #1: relational-solver parseDate month-aware day limit", () => {
    it("should reject Feb 31 in US format", async () => {
      const { evaluateComposition } = await import(
        "../../src/logic/relational-solver.js"
      );
      const comp: any = {
        steps: [{ primitive: "parseDate", args: { format: "US" } }],
      };
      const result = evaluateComposition(comp, "02/31/2024");
      expect(result).toBeNull();
    });

    it("should reject Feb 30 in natural format", async () => {
      const { evaluateComposition } = await import(
        "../../src/logic/relational-solver.js"
      );
      const comp: any = {
        steps: [{ primitive: "parseDate", args: {} }],
      };
      const result = evaluateComposition(comp, "February 30, 2024");
      expect(result).toBeNull();
    });

    it("should reject April 31 in EU format", async () => {
      const { evaluateComposition } = await import(
        "../../src/logic/relational-solver.js"
      );
      const comp: any = {
        steps: [{ primitive: "parseDate", args: { format: "EU" } }],
      };
      const result = evaluateComposition(comp, "31/04/2024", );
      expect(result).toBeNull();
    });

    it("should accept valid dates", async () => {
      const { evaluateComposition } = await import(
        "../../src/logic/relational-solver.js"
      );
      const usComp: any = {
        steps: [{ primitive: "parseDate", args: { format: "US" } }],
      };
      expect(evaluateComposition(usComp, "01/15/2024")).toBe("2024-01-15");

      const natComp: any = {
        steps: [{ primitive: "parseDate", args: {} }],
      };
      expect(evaluateComposition(natComp, "February 28, 2024")).toBe("2024-02-28");
      expect(evaluateComposition(natComp, "February 29, 2024")).toBe("2024-02-29"); // 2024 is leap year
    });
  });

  // from tests/audit25.test.ts Audit25 #1: parseDate US auto-detection without format hint
  describe("Audit25 #1: parseDate US auto-detection without format hint", () => {
    it("should auto-detect US date format when no hint is provided", async () => {
      const { evaluateComposition } = await import(
        "../../src/logic/relational-solver.js"
      );
      const comp: any = {
        steps: [{ primitive: "parseDate", args: {} }],
      };
      // No format hint — should still parse MM/DD/YYYY
      const result = evaluateComposition(comp, "01/15/2024");
      expect(result).toBe("2024-01-15");
    });

    it("should auto-detect US date when hint is explicitly US", async () => {
      const { evaluateComposition } = await import(
        "../../src/logic/relational-solver.js"
      );
      const comp: any = {
        steps: [{ primitive: "parseDate", args: { format: "US" } }],
      };
      const result = evaluateComposition(comp, "01/15/2024");
      expect(result).toBe("2024-01-15");
    });
  });

  // from tests/audit32.test.ts #15 — relational-solver filter/map should not use spread in reduce
  describe("#15 — relational-solver filter/map should not use spread in reduce", () => {
        it("should use push instead of spread for filter", () => {
          const source = readFileSync("src/logic/relational-solver.ts", "utf-8");
          const filterDerived = source.match(/case "filter":[\s\S]*?case "map"/);
          expect(filterDerived).not.toBeNull();
          // Should NOT use [...acc, item] pattern
          expect(filterDerived![0]).not.toMatch(/\[\.\.\.acc,?\s*item\]/);
        });

        it("should use push instead of spread for map", () => {
          const source = readFileSync("src/logic/relational-solver.ts", "utf-8");
          const mapDerived = source.match(/case "map":[\s\S]*?case "sum"/);
          expect(mapDerived).not.toBeNull();
          // Should NOT use [...acc, transform(item)] pattern
          expect(mapDerived![0]).not.toMatch(/\[\.\.\.acc/);
        });
      });

  // from tests/audit40.test.ts #3 — relational-solver replace should escape $ backreferences
  describe("#3 — relational-solver replace should escape $ backreferences", () => {
      it("should escape $ in replacement string", () => {
        const source = readFileSync("src/logic/relational-solver.ts", "utf-8");
        const replaceBlock = source.match(/replace:\s*\(input[\s\S]*?input\.replace\(regex,[\s\S]*?\)/);
        expect(replaceBlock).not.toBeNull();
        // Should escape $ in the replacement string before passing to .replace()
        expect(replaceBlock![0]).toMatch(/\$.*\$\$|\\\$/);
      });
    });

  // from tests/audit43.test.ts #10 — parseCurrencyImpl should not allow double-negation
  describe("#10 — parseCurrencyImpl should not allow double-negation", () => {
      it("should not recursively match leading minus after minus", () => {
        const source = readFileSync("src/logic/relational-solver.ts", "utf-8");
        const negMatch = source.match(/negMinusMatch = trimmed\.match\(.*\)/);
        expect(negMatch).not.toBeNull();
        // Should prevent matching another leading minus (e.g., ^-([^-].*)$)
        expect(negMatch![0]).toMatch(/\[\^-\]|\(\?!-\)/);
      });
    });

  // from tests/audit44.test.ts #4 — relational-solver synthesis should use epsilon for float comparison
  describe("#4 — relational-solver synthesis should use epsilon for float comparison", () => {
      it("should not use strict inequality for float comparison in candidate evaluation", () => {
        const source = readFileSync("src/logic/relational-solver.ts", "utf-8");
        const evalBlock = source.match(/const result = evaluateComposition[\s\S]*?allMatch = false/);
        expect(evalBlock).not.toBeNull();
        // Should NOT use simple !== for comparing results; should use epsilon or tolerance
        expect(evalBlock![0]).not.toMatch(/result !== output/);
      });
    });

  // from tests/audit49.test.ts #4 — relational-solver split should validate index
  describe("#4 — relational-solver split should validate index", () => {
      it("should check Number.isSafeInteger or bounds on split index", () => {
        const source = readFileSync("src/logic/relational-solver.ts", "utf-8");
        const splitFn = source.match(/split:\s*\(input[\s\S]*?parts\[idx\]/);
        expect(splitFn).not.toBeNull();
        expect(splitFn![0]).toMatch(/isSafeInteger|isInteger|idx\s*<\s*0|idx\s*>=\s*parts/);
      });
    });

  // from tests/audit51.test.ts #6 — relational-solver reduce should guard array length
  describe("#6 — relational-solver reduce should guard array length", () => {
      it("should have a max iteration guard", () => {
        const source = readFileSync("src/logic/relational-solver.ts", "utf-8");
        const reduceFn = source.match(/function reduce[\s\S]*?return acc;\s*\}/);
        expect(reduceFn).not.toBeNull();
        expect(reduceFn![0]).toMatch(/MAX_REDUCE|length\s*>|\.slice\(|limit/i);
      });
    });

  // from tests/audit53.test.ts #3 — relational-solver split should validate delimiter
  describe("#3 — relational-solver split should validate delimiter", () => {
      it("should check delimiter is not empty", () => {
        const source = readFileSync("src/logic/relational-solver.ts", "utf-8");
        const splitPrim = source.match(/split:\s*\(input,\s*args\)[\s\S]*?input\.split\(delim\)/);
        expect(splitPrim).not.toBeNull();
        expect(splitPrim![0]).toMatch(/delim\.length|!delim|delim\s*===\s*""/);
      });
    });

  // from tests/audit54.test.ts #1 — relational-solver index should validate index
  describe("#1 — relational-solver index should validate index", () => {
      it("should check integer and non-negative on index primitive", () => {
        const source = readFileSync("src/logic/relational-solver.ts", "utf-8");
        const indexCase = source.match(/index:\s*\(input,\s*args\)\s*=>\s*\{[\s\S]*?input\[idx\]/);
        expect(indexCase).not.toBeNull();
        expect(indexCase![0]).toMatch(/Number\.isInteger|isInteger|idx\s*<\s*0/);
      });
    });

  // from tests/audit54.test.ts #2 — relational-solver match should reject negative group
  describe("#2 — relational-solver match should reject negative group", () => {
      it("should guard against negative group index", () => {
        const source = readFileSync("src/logic/relational-solver.ts", "utf-8");
        const matchCase = source.match(/match:\s*\(input,\s*args\)\s*=>\s*\{[\s\S]*?result\[group\]/);
        expect(matchCase).not.toBeNull();
        expect(matchCase![0]).toMatch(/group\s*<\s*0/);
      });
    });

  // from tests/audit63.test.ts #1 — relational-solver split should cap parts length
  describe("#1 — relational-solver split should cap parts length", () => {
      it("should limit split result size", () => {
        const source = readFileSync("src/logic/relational-solver.ts", "utf-8");
        const splitStart = source.indexOf("split: (input, args)");
        expect(splitStart).toBeGreaterThan(-1);
        const block = source.slice(splitStart, splitStart + 400);
        // Should have an explicit cap like MAX_SPLIT_PARTS or parts.length > N
        expect(block).toMatch(/MAX_SPLIT_PARTS|parts\.length\s*>/i);
      });
    });

  // from tests/audit80.test.ts #7 — relational-solver parseInt should use radix 10
  describe("#7 — relational-solver parseInt should use radix 10", () => {
      it("should pass radix 10 to parseInt(shortYear)", () => {
        const source = readFileSync("src/logic/relational-solver.ts", "utf-8");
        const parseIntCall = source.indexOf("parseInt(shortYear)");
        if (parseIntCall === -1) {
          // Already fixed — uses parseInt(shortYear, 10)
          const fixedCall = source.indexOf("parseInt(shortYear, 10)");
          expect(fixedCall).toBeGreaterThan(-1);
        } else {
          // Still unfixed
          expect(parseIntCall).toBe(-1); // Force failure
        }
      });
    });

});
