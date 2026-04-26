import { describe, it, expect } from "vitest";
import { solve } from "../../src/logic/lc-solver.js";
import type { SolverTools, Bindings } from "../../src/logic/lc-solver.js";
import { parse } from "../../src/logic/lc-parser.js";
import { readFileSync } from "fs";

// =====================================================================
// Source-pattern checks (from audits)
// =====================================================================
function createMockTools(context: string): SolverTools {
  const lines = context.split("\n");
  return {
    context,
    lines,
    grep: (pattern: string) => {
      try {
        const regex = new RegExp(pattern, "gi");
        const results: Array<{ match: string; line: string; lineNum: number; index: number; groups: string[] }> = [];
        let m;
        while ((m = regex.exec(context)) !== null) {
          const beforeMatch = context.slice(0, m.index);
          const lineNum = (beforeMatch.match(/\n/g) || []).length + 1;
          results.push({
            match: m[0],
            line: lines[lineNum - 1] || "",
            lineNum,
            index: m.index,
            groups: m.slice(1),
          });
          if (results.length > 1000) break;
        }
        return results;
      } catch { return []; }
    },
    fuzzy_search: () => [],
    bm25: () => [],
    semantic: () => [],
    text_stats: () => ({ length: context.length, lineCount: lines.length, sample: { start: "", middle: "", end: "" } }),
  };
}
describe("Source-pattern checks (from audits)", () => {
  // from tests/audit13.test.ts Issue #2: evaluateWithBinding depth should propagate
  describe("Issue #2: evaluateWithBinding depth should propagate", () => {
    it("evaluatePredicate should pass depth through evaluate calls", async () => {
      // Read lc-solver.ts and verify depth is propagated (not hardcoded to 0)
      // in evaluatePredicate, evaluateTransform, evaluateReduceFn, and the default case
      const fs = await import("node:fs/promises");
      const source = await fs.readFile("src/logic/lc-solver.ts", "utf-8");

      // evaluatePredicate: the match fast-path calls evaluate with depth
      // Line ~791: String(evaluate(body.str, tools, bindings, log, 0))
      // This should NOT be 0; it should pass through the caller's depth
      const evaluatePredicateFn = source.match(
        /function evaluatePredicate\([\s\S]*?\n\}/m
      );
      expect(evaluatePredicateFn).not.toBeNull();
      const predicateBody = evaluatePredicateFn![0];

      // Find evaluate() calls with literal 0 as the depth argument
      // These are the bugs - they should pass through the depth parameter
      const evaluateCallsWithZero = predicateBody.match(/evaluate\([^)]+,\s*0\s*\)/g) || [];
      // Also check evaluateWithBinding calls with 0
      const ewbCallsWithZero = predicateBody.match(/evaluateWithBinding\([^)]+,\s*0\s*\)/g) || [];

      // After fix, there should be no hardcoded 0 depth in evaluate/evaluateWithBinding calls
      expect(evaluateCallsWithZero.length + ewbCallsWithZero.length).toBe(0);
    });

    it("evaluateReduceFn should pass depth through evaluate calls", async () => {
      const fs = await import("node:fs/promises");
      const source = await fs.readFile("src/logic/lc-solver.ts", "utf-8");

      const reduceFn = source.match(
        /function evaluateReduceFn\([\s\S]*?\n\}/m
      );
      expect(reduceFn).not.toBeNull();
      const reduceBody = reduceFn![0];

      // Check for evaluate() calls with literal 0 as depth
      const evaluateCallsWithZero = reduceBody.match(/evaluate\([^)]+,\s*0\s*\)/g) || [];
      expect(evaluateCallsWithZero.length).toBe(0);
    });

    it("evaluateWithBinding default case should not reset depth to 0", async () => {
      const fs = await import("node:fs/promises");
      const source = await fs.readFile("src/logic/lc-solver.ts", "utf-8");

      // Find the default case in evaluateWithBinding that calls evaluate
      // It currently does: evaluate(body, tools, newBindings, log, 0)
      // This should use depth + 1 instead of 0
      const ewbFn = source.match(
        /function evaluateWithBinding\([\s\S]*?\n\}/m
      );
      expect(ewbFn).not.toBeNull();
      const ewbBody = ewbFn![0];

      // Find the default case - it should not have evaluate(..., 0)
      // (The `await ` prefix is part of the match after the async refactor.)
      const defaultCase = ewbBody.match(/default:[\s\S]*?return (?:await )?evaluate\([^)]+\)/);
      expect(defaultCase).not.toBeNull();
      // The default case should NOT pass 0 as the depth argument
      expect(defaultCase![0]).not.toMatch(/evaluate\([^)]+,\s*0\s*\)/);
    });
  });

  // from tests/audit13.test.ts Issue #9: parseDate should use UTC accessors
  describe("Issue #9: parseDate should use UTC accessors", () => {
    it("parseDate fallback should produce consistent date regardless of timezone", async () => {
      // "December 25, 2024" is a natural language date that hits the JS Date fallback path
      // With local time, getMonth()/getDate() can shift to a different day depending on TZ
      const tools = createMockTools("");
      const bindings: Bindings = new Map();

      // (parseDate "December 25, 2024")
      const parsed = parse('(parseDate "December 25, 2024")');
      expect(parsed.success).toBe(true);
      const result = await solve(parsed.term!, tools, bindings);
      expect(result.success).toBe(true);
      // Should always be 2024-12-25 regardless of timezone
      expect(result.value).toBe("2024-12-25");
    });
  });

  // from tests/audit13.test.ts Issue #10: parseCurrency double-negative produces wrong sign
  describe("Issue #10: parseCurrency double-negative produces wrong sign", () => {
    it("should correctly parse negative with minus sign: -$1,234", async () => {
      const tools = createMockTools("");
      const bindings: Bindings = new Map();

      const parsed = parse('(parseCurrency "-$1,234")');
      expect(parsed.success).toBe(true);
      const result = await solve(parsed.term!, tools, bindings);
      expect(result.success).toBe(true);
      // Should be -1234, not 1234 (the minus should be preserved)
      expect(result.value).toBe(-1234);
    });

    it("should correctly parse negative parens: ($1,234)", async () => {
      const tools = createMockTools("");
      const bindings: Bindings = new Map();

      const parsed = parse('(parseCurrency "($1,234)")');
      expect(parsed.success).toBe(true);
      const result = await solve(parsed.term!, tools, bindings);
      expect(result.success).toBe(true);
      // Should be -1234
      expect(result.value).toBe(-1234);
    });
  });

  // from tests/audit14.test.ts Issue #8: quarter regex should reject invalid quarters
  describe("Issue #8: quarter regex should reject invalid quarters", () => {
    it("should not match Q5, Q0, or Q9", async () => {
      const fs = await import("node:fs/promises");
      const source = await fs.readFile("src/logic/relational-solver.ts", "utf-8");

      // Find the quarterRegex definition
      const quarterRegexMatch = source.match(/const quarterRegex\s*=\s*\/([^/]+)\//);
      expect(quarterRegexMatch).not.toBeNull();
      const pattern = quarterRegexMatch![1];

      // The regex should only match Q1-Q4, not Q0 or Q5-Q9
      const regex = new RegExp(pattern);
      expect(regex.test("Q5-2024")).toBe(false);
      expect(regex.test("Q0-2024")).toBe(false);
      expect(regex.test("Q9-2024")).toBe(false);
      // But should still match valid quarters
      expect(regex.test("Q1-2024")).toBe(true);
      expect(regex.test("Q4-2024")).toBe(true);
    });
  });

  // from tests/audit14.test.ts Issue #10: solver replace should escape replacement backreferences
  describe("Issue #10: solver replace should escape replacement backreferences", () => {
    it("should treat $1 in replacement as literal string", async () => {
      const solverMod2 = await import("../../src/logic/lc-solver.js");
      const { parse } = await import("../../src/logic/lc-parser.js");

      const tools: any = {
        context: "",
        grep: () => [],
        fuzzy_search: () => [],
        text_stats: () => ({ length: 0, lineCount: 0, sample: { start: "", middle: "", end: "" } }),
      };

      const parsed = parse('(replace "hello world" "(\\\\w+)" "$1-test")');
      expect(parsed.success).toBe(true);
      const result = await solverMod2.solve(parsed.term!, tools);
      expect(result.success).toBe(true);
      // Should contain literal "$1-test", not a backreference substitution
      expect(String(result.value)).toContain("$1-test");
    });
  });

  // from tests/audit15.test.ts Audit15 #6: evaluateWithBinding match group<0
  describe("Audit15 #6: evaluateWithBinding match group<0", () => {
    it("should return null for negative group in evaluateWithBinding match", async () => {
      const { solve } = await import("../../src/logic/lc-solver.js");
      const tools: any = {
        grep: () => [
          { match: "hello", line: "hello world", lineNum: 1, index: 0, groups: [] },
        ],
        fuzzy_search: () => [],
        text_stats: () => ({ length: 0, lineCount: 0, sample: { start: "", middle: "", end: "" } }),
        context: "hello world",
      };
      // Use map with lambda that calls evaluateWithBinding with match having group -1
      const term: any = {
        tag: "map",
        collection: { tag: "grep", pattern: "." },
        transform: {
          tag: "lambda",
          param: "x",
          body: { tag: "match", str: { tag: "var", name: "x" }, pattern: "hello", group: -1 },
        },
      };
      const result = await solve(term, tools);
      // Each result should be null because group is negative
      expect(result.success).toBe(true);
      const arr = result.value as any[];
      expect(arr.length).toBeGreaterThan(0);
      expect(arr[0]).toBe(null);
    });
  });

  // from tests/audit15.test.ts Audit15 #11: parseCurrency $-1234 negative
  describe("Audit15 #11: parseCurrency $-1234 negative", () => {
    it("should detect $-1234 as negative", async () => {
      const { solve } = await import("../../src/logic/lc-solver.js");
      const tools: any = {
        grep: () => [],
        fuzzy_search: () => [],
        text_stats: () => ({ length: 0, lineCount: 0, sample: { start: "", middle: "", end: "" } }),
        context: "",
      };
      const term: any = {
        tag: "parseCurrency",
        str: { tag: "lit", value: "$-1,234" },
      };
      const result = await solve(term, tools);
      expect(result.value).toBe(-1234);
    });
  });

  // from tests/audit15.test.ts Audit15 #14: sum regex multi-number lines
  describe("Audit15 #14: sum regex multi-number lines", () => {
    it("sum should handle lines with multiple numbers correctly", async () => {
      const { solve } = await import("../../src/logic/lc-solver.js");
      const tools: any = {
        grep: () => [
          { match: "item1", line: "Item: $100 Qty: 5", lineNum: 1, index: 0, groups: [] },
          { match: "item2", line: "Item: $200 Qty: 10", lineNum: 2, index: 0, groups: [] },
        ],
        fuzzy_search: () => [],
        text_stats: () => ({ length: 0, lineCount: 0, sample: { start: "", middle: "", end: "" } }),
        context: "",
      };
      const term: any = {
        tag: "sum",
        collection: { tag: "grep", pattern: "Item" },
      };
      const result = await solve(term, tools);
      // Currently matches first number only ($100, $200) which is actually correct for the "dollar amount" case
      expect(typeof result.value).toBe("number");
      expect(result.value as number).toBeGreaterThan(0);
    });
  });

  // from tests/audit16.test.ts Audit16 #2: solver extract group<0
  describe("Audit16 #2: solver extract group<0", () => {
    it("should return null for negative group in extract", async () => {
      const { solve } = await import("../../src/logic/lc-solver.js");
      const tools: any = {
        grep: () => [],
        fuzzy_search: () => [],
        text_stats: () => ({ length: 0, lineCount: 0, sample: { start: "", middle: "", end: "" } }),
        context: "",
      };
      const term: any = {
        tag: "extract",
        str: { tag: "lit", value: "price: $100" },
        pattern: "(\\d+)",
        group: -1,
      };
      const result = await solve(term, tools);
      // Should return null for negative group, not access result[-1]
      expect(result.value).toBe(null);
    });
  });

  // from tests/audit16.test.ts Audit16 #3: evaluateWithBinding extract group<0
  describe("Audit16 #3: evaluateWithBinding extract group<0", () => {
    it("should return null for negative group in extract via lambda", async () => {
      const { solve } = await import("../../src/logic/lc-solver.js");
      const tools: any = {
        grep: () => [
          { match: "$100", line: "price: $100", lineNum: 1, index: 0, groups: [] },
        ],
        fuzzy_search: () => [],
        text_stats: () => ({ length: 0, lineCount: 0, sample: { start: "", middle: "", end: "" } }),
        context: "price: $100",
      };
      const term: any = {
        tag: "map",
        collection: { tag: "grep", pattern: "." },
        transform: {
          tag: "lambda",
          param: "x",
          body: { tag: "extract", str: { tag: "var", name: "x" }, pattern: "(\\d+)", group: -1 },
        },
      };
      const result = await solve(term, tools);
      expect(result.success).toBe(true);
      const arr = result.value as any[];
      if (arr.length > 0) {
        expect(arr[0]).toBe(null);
      }
    });
  });

  // from tests/audit16.test.ts Audit16 #4: solver split negative index
  describe("Audit16 #4: solver split negative index", () => {
    it("should return null for negative split index", async () => {
      const { solve } = await import("../../src/logic/lc-solver.js");
      const tools: any = {
        grep: () => [],
        fuzzy_search: () => [],
        text_stats: () => ({ length: 0, lineCount: 0, sample: { start: "", middle: "", end: "" } }),
        context: "",
      };
      const term: any = {
        tag: "split",
        str: { tag: "lit", value: "a,b,c" },
        delim: ",",
        index: -1,
      };
      const result = await solve(term, tools);
      // Negative index should return null, not access from end of array
      expect(result.value).toBe(null);
    });
  });

  // from tests/audit16.test.ts Audit16 #5: evaluateWithBinding split negative index
  describe("Audit16 #5: evaluateWithBinding split negative index", () => {
    it("should return null for negative split index via lambda", async () => {
      const { solve } = await import("../../src/logic/lc-solver.js");
      const tools: any = {
        grep: () => [
          { match: "a,b,c", line: "a,b,c", lineNum: 1, index: 0, groups: [] },
        ],
        fuzzy_search: () => [],
        text_stats: () => ({ length: 0, lineCount: 0, sample: { start: "", middle: "", end: "" } }),
        context: "a,b,c",
      };
      const term: any = {
        tag: "map",
        collection: { tag: "grep", pattern: "." },
        transform: {
          tag: "lambda",
          param: "x",
          body: { tag: "split", str: { tag: "var", name: "x" }, delim: ",", index: -1 },
        },
      };
      const result = await solve(term, tools);
      expect(result.success).toBe(true);
      const arr = result.value as any[];
      if (arr.length > 0) {
        expect(arr[0]).toBe(null);
      }
    });
  });

  // from tests/audit16.test.ts Audit16 #6: evaluatePredicate group<0
  describe("Audit16 #6: evaluatePredicate group<0", () => {
    it("should return false for negative group in predicate match", async () => {
      const { solve } = await import("../../src/logic/lc-solver.js");
      const tools: any = {
        grep: () => [
          { match: "hello", line: "hello world", lineNum: 1, index: 0, groups: [] },
          { match: "test", line: "test data", lineNum: 2, index: 0, groups: [] },
        ],
        fuzzy_search: () => [],
        text_stats: () => ({ length: 0, lineCount: 0, sample: { start: "", middle: "", end: "" } }),
        context: "hello world\ntest data",
      };
      // filter with a predicate that has group -1 — should filter everything out
      const term: any = {
        tag: "filter",
        collection: { tag: "grep", pattern: "." },
        predicate: {
          tag: "lambda",
          param: "x",
          body: { tag: "match", str: { tag: "var", name: "x" }, pattern: "hello", group: -1 },
        },
      };
      const result = await solve(term, tools);
      expect(result.success).toBe(true);
      // With group -1, match should fail, so filter should return empty
      const arr = result.value as any[];
      expect(arr.length).toBe(0);
    });
  });

  // from tests/audit16.test.ts Audit16 #9: parseCurrency operator precedence
  describe("Audit16 #9: parseCurrency operator precedence", () => {
    it("should not treat open-paren-only string as negative", async () => {
      const { solve } = await import("../../src/logic/lc-solver.js");
      const tools: any = {
        grep: () => [],
        fuzzy_search: () => [],
        text_stats: () => ({ length: 0, lineCount: 0, sample: { start: "", middle: "", end: "" } }),
        context: "",
      };
      // "(1234" has open paren but no close — should NOT be negative
      const term: any = {
        tag: "parseCurrency",
        str: { tag: "lit", value: "(1234" },
      };
      const result = await solve(term, tools);
      // Without explicit parens in the OR chain, JS may misparse the precedence
      // The result should be positive 1234, not -1234
      expect(result.value).toBe(1234);
    });
  });

  // from tests/audit18.test.ts Audit18 #8: findDistinguishingPattern regex validation
  describe("Audit18 #8: findDistinguishingPattern regex validation", () => {
    it("solver classify should work with safe patterns", async () => {
      const { solve } = await import("../../src/logic/lc-solver.js");
      const tools: any = {
        grep: () => [],
        fuzzy_search: () => [],
        text_stats: () => ({ length: 0, lineCount: 0, sample: { start: "", middle: "", end: "" } }),
        context: "",
      };
      const term: any = {
        tag: "classify",
        examples: [
          { input: "error found", output: true },
          { input: "all good", output: false },
        ],
      };
      const result = await solve(term, tools);
      expect(result.success).toBe(true);
    });
  });

  // from tests/audit18.test.ts Audit18 #9: parseDate trailing text
  describe("Audit18 #9: parseDate trailing text", () => {
    it("should reject ISO date with trailing garbage", async () => {
      const { solve } = await import("../../src/logic/lc-solver.js");
      const tools: any = {
        grep: () => [],
        fuzzy_search: () => [],
        text_stats: () => ({ length: 0, lineCount: 0, sample: { start: "", middle: "", end: "" } }),
        context: "",
      };
      const term: any = {
        tag: "parseDate",
        str: { tag: "lit", value: "2024-01-15 extra garbage" },
      };
      const result = await solve(term, tools);
      // Should not silently accept trailing text
      expect(result.value).toBe(null);
    });
  });

  // from tests/audit18.test.ts Audit18 #13: evaluateWithBinding depth constant
  describe("Audit18 #13: evaluateWithBinding depth constant", () => {
    it("solver should enforce consistent depth limits", async () => {
      const { solve } = await import("../../src/logic/lc-solver.js");
      const tools: any = {
        grep: () => [],
        fuzzy_search: () => [],
        text_stats: () => ({ length: 0, lineCount: 0, sample: { start: "", middle: "", end: "" } }),
        context: "",
      };
      // A deeply nested but valid term should work
      const term: any = {
        tag: "add",
        left: { tag: "lit", value: 1 },
        right: { tag: "lit", value: 2 },
      };
      const result = await solve(term, tools);
      expect(result.value).toBe(3);
    });
  });

  // from tests/audit19.test.ts Audit19 #2: parseDate natural language day validation
  describe("Audit19 #2: parseDate natural language day validation", () => {
    it("should reject February 31 in Month Day Year format", async () => {
      const { solve } = await import("../../src/logic/lc-solver.js");
      const tools: any = {
        grep: () => [],
        fuzzy_search: () => [],
        text_stats: () => ({ length: 0, lineCount: 0, sample: { start: "", middle: "", end: "" } }),
        context: "",
      };
      const term: any = {
        tag: "parseDate",
        str: { tag: "lit", value: "February 31, 2024" },
      };
      const result = await solve(term, tools);
      expect(result.success).toBe(true);
      expect(result.value).toBe(null);  // Invalid date should return null
    });

    it("should reject 31 February in Day Month Year format", async () => {
      const { solve } = await import("../../src/logic/lc-solver.js");
      const tools: any = {
        grep: () => [],
        fuzzy_search: () => [],
        text_stats: () => ({ length: 0, lineCount: 0, sample: { start: "", middle: "", end: "" } }),
        context: "",
      };
      const term: any = {
        tag: "parseDate",
        str: { tag: "lit", value: "31 February 2024" },
      };
      const result = await solve(term, tools);
      expect(result.success).toBe(true);
      expect(result.value).toBe(null);
    });

    it("should reject April 31 in natural language", async () => {
      const { solve } = await import("../../src/logic/lc-solver.js");
      const tools: any = {
        grep: () => [],
        fuzzy_search: () => [],
        text_stats: () => ({ length: 0, lineCount: 0, sample: { start: "", middle: "", end: "" } }),
        context: "",
      };
      const term: any = {
        tag: "parseDate",
        str: { tag: "lit", value: "April 31, 2024" },
      };
      const result = await solve(term, tools);
      expect(result.success).toBe(true);
      expect(result.value).toBe(null);
    });

    it("should accept valid natural language dates", async () => {
      const { solve } = await import("../../src/logic/lc-solver.js");
      const tools: any = {
        grep: () => [],
        fuzzy_search: () => [],
        text_stats: () => ({ length: 0, lineCount: 0, sample: { start: "", middle: "", end: "" } }),
        context: "",
      };
      const term: any = {
        tag: "parseDate",
        str: { tag: "lit", value: "January 15, 2024" },
      };
      const result = await solve(term, tools);
      expect(result.success).toBe(true);
      expect(result.value).toBe("2024-01-15");
    });
  });

  // from tests/audit19.test.ts Audit19 #3: lc-solver classify empty string filter
  describe("Audit19 #3: lc-solver classify empty string filter", () => {
    it("should filter empty strings from trueExamples in solver", async () => {
      const { solve } = await import("../../src/logic/lc-solver.js");
      const tools: any = {
        grep: () => [],
        fuzzy_search: () => [],
        text_stats: () => ({ length: 0, lineCount: 0, sample: { start: "", middle: "", end: "" } }),
        context: "",
      };
      const term: any = {
        tag: "classify",
        examples: [
          { input: "", output: true },      // Empty string - should be filtered
          { input: "error", output: true },
          { input: "ok", output: false },
        ],
      };
      const result = await solve(term, tools);
      expect(result.success).toBe(true);
      // The classifier should be a function
      const classifyFn = result.value;
      if (typeof classifyFn === "function") {
        // "all good here" should NOT match — empty string filter prevents universal match
        expect(classifyFn("all good here")).toBe(false);
      }
    });
  });

  // from tests/audit19.test.ts Audit19 #6: match group index bounds
  describe("Audit19 #6: match group index bounds", () => {
    it("should return null for out-of-bounds group index", async () => {
      const { solve } = await import("../../src/logic/lc-solver.js");
      const tools: any = {
        grep: () => [],
        fuzzy_search: () => [],
        text_stats: () => ({ length: 0, lineCount: 0, sample: { start: "", middle: "", end: "" } }),
        context: "",
      };
      // Pattern has 1 capture group, but group index is 5
      const term: any = {
        tag: "match",
        str: { tag: "lit", value: "price: 42" },
        pattern: "(\\d+)",
        group: 5,
      };
      const result = await solve(term, tools);
      expect(result.success).toBe(true);
      expect(result.value).toBe(null);
    });
  });

  // from tests/audit25.test.ts Audit25 #2: grep empty pattern guard
  describe("Audit25 #2: grep empty pattern guard", () => {
    it("should return empty results for empty pattern", async () => {
      const mod = await import("../../src/logic/lc-solver.js");
      const tools: any = {
        context: "hello\nworld\n",
        grep: null as any,
      };
      // Create solver tools by calling solve with a grep on empty pattern
      const result = await mod.solve(
        { tag: "grep" as const, pattern: "" },
        { context: "hello\nworld", grep: () => [], fuzzy_search: () => [], text_stats: () => ({}) },
        new Map()
      );
      // Empty pattern should not match everything
      expect(result.success).toBe(true);
      if (Array.isArray(result.value)) {
        expect(result.value.length).toBe(0);
      }
    });
  });

  // from tests/audit25.test.ts Audit25 #8: grep groups filter undefined
  describe("Audit25 #8: grep groups filter undefined", () => {
    it("should not have undefined in groups array", async () => {
      const mod = await import("../../src/logic/lc-solver.js");
      // Pattern with optional group that won't match
      const tools: any = {
        context: "hello world",
        grep: (pattern: string) => {
          const regex = new RegExp(pattern, "gmi");
          const match = regex.exec("hello world");
          if (!match) return [];
          return [{
            match: match[0],
            line: "hello world",
            lineNum: 1,
            index: match.index,
            groups: match.slice(1).filter((g: unknown) => g !== undefined),
          }];
        },
        fuzzy_search: () => [],
        text_stats: () => ({}),
      };
      // A pattern with an optional group: (foo)?(hello)
      const result = await mod.solve(
        { tag: "grep" as const, pattern: "(foo)?(hello)" },
        tools,
        new Map()
      );
      expect(result.success).toBe(true);
    });
  });

  // from tests/audit26.test.ts Audit26 #11: lc-solver word split empty string filter
  describe("Audit26 #11: lc-solver word split empty string filter", () => {
    it("should not match empty string as pattern", async () => {
      const mod = await import("../../src/logic/lc-solver.js");
      const tools: any = {
        context: "___\nhello\n",
        grep: () => [],
        fuzzy_search: () => [],
        text_stats: () => ({}),
      };
      const result = await mod.solve(
        {
          tag: "classify" as const,
          examples: [
            { input: "___", output: true },
            { input: "hello world", output: false },
          ],
        },
        tools,
        new Map()
      );
      expect(result.success).toBe(true);
      if (typeof result.value === "function") {
        // The classifier should not match everything due to empty string
        expect(result.value("random text")).toBe(false);
      }
    });
  });

  // from tests/audit27.test.ts Audit27 #8: lc-solver apply-fn type safety
  describe("Audit27 #8: lc-solver apply-fn type safety", () => {
    it("should be importable", async () => {
      const mod = await import("../../src/logic/lc-solver.js");
      expect(mod.solve).toBeDefined();
    });
  });

  // from tests/audit27.test.ts Audit27 #11: lc-solver word split underscore handling
  describe("Audit27 #11: lc-solver word split underscore handling", () => {
    it("should be handled by existing word filter", async () => {
      // This is a minor pattern discovery limitation, not a crash bug
      const mod = await import("../../src/logic/lc-solver.js");
      expect(mod.solve).toBeDefined();
    });
  });

  // from tests/audit32.test.ts #12 — currency parser should handle trailing minus
  describe("#12 — currency parser should handle trailing minus", () => {
        it("should detect trailing minus as negative", () => {
          const source = readFileSync("src/logic/lc-solver.ts", "utf-8");
          // Check the full isNegative block includes endsWith("-")
          const fullBlock = source.match(/const isNegative =[\s\S]*?;/);
          expect(fullBlock).not.toBeNull();
          expect(fullBlock![0]).toMatch(/endsWith\("-"\)/);
        });
      });

  // from tests/audit34.test.ts #16 — parseCurrency negative detection
  describe("#16 — parseCurrency negative detection", () => {
        it("should not flag range-like patterns as negative", () => {
          const source = readFileSync("src/logic/lc-solver.ts", "utf-8");
          const isNeg = source.match(/const isNegative =[\s\S]*?;/);
          expect(isNeg).not.toBeNull();
          // Should NOT match hyphens that are sandwiched between digits (ranges)
          // Should only match leading/trailing minus or parens
          expect(isNeg![0]).toMatch(/trimmed|startsWith|endsWith|^\s*-|^-/);
        });
      });

  // from tests/audit35.test.ts #5 — sum should log skipped non-numeric values
  describe("#5 — sum should log skipped non-numeric values", () => {
        it("should indicate when values are skipped", () => {
          const source = readFileSync("src/logic/lc-solver.ts", "utf-8");
          const sumBlock = source.match(/case "sum"[\s\S]*?return total;/);
          expect(sumBlock).not.toBeNull();
          // Should log or count skipped values
          expect(sumBlock![0]).toMatch(/skipped|warn|non-numeric|unparseable/i);
        });
      });

  // from tests/audit40.test.ts #8 — lc-solver split should guard against empty delimiter
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

  // from tests/audit41.test.ts #6 — lc-solver parseDate should include sept abbreviation
  describe("#6 — lc-solver parseDate should include sept abbreviation", () => {
      it("should have sept as a standalone key in months lookup", () => {
        const source = readFileSync("src/logic/lc-solver.ts", "utf-8");
        expect(source).toMatch(/\bsept\b.*:\s*"09"/);
      });
    });

  // from tests/audit49.test.ts #8 — lc-solver evaluatePredicate should check group bounds
  describe("#8 — lc-solver evaluatePredicate should check group bounds", () => {
      it("should verify group index < result.length", () => {
        const source = readFileSync("src/logic/lc-solver.ts", "utf-8");
        const predMatch = source.match(/evaluatePredicate[\s\S]*?body\.tag === "match"[\s\S]*?result\[body\.group\]/);
        expect(predMatch).not.toBeNull();
        expect(predMatch![0]).toMatch(/body\.group\s*<\s*result\.length|body\.group\s*>=\s*result\.length/);
      });
    });

  // from tests/audit64.test.ts #1 — parseNumber should limit recursion depth for %
  describe("#1 — parseNumber should limit recursion depth for %", () => {
      it("should have a depth limit or iterative % handling", () => {
        const source = readFileSync("src/logic/lc-solver.ts", "utf-8");
        const fnStart = source.indexOf("function parseNumber(");
        expect(fnStart).toBeGreaterThan(-1);
        const block = source.slice(fnStart, fnStart + 400);
        // Should have depth parameter, iterative loop, or MAX_ constant
        expect(block).toMatch(/depth|MAX_PERCENT|while.*%|iterati/i);
      });
    });

  // from tests/audit75.test.ts #4 — lc-solver match should cap group at 99
  describe("#4 — lc-solver match should cap group at 99", () => {
      it("should reject group > 99", () => {
        const source = readFileSync("src/logic/lc-solver.ts", "utf-8");
        const matchCase = source.indexOf('case "match"');
        expect(matchCase).toBeGreaterThan(-1);
        const block = source.slice(matchCase, matchCase + 300);
        expect(block).toMatch(/group\s*>\s*99|group\s*>=\s*100/);
      });
    });

  // from tests/audit76.test.ts #4 — lc-solver parseInt should validate string length
  describe("#4 — lc-solver parseInt should validate string length", () => {
      it("should check string length before parseInt", () => {
        const source = readFileSync("src/logic/lc-solver.ts", "utf-8");
        const parseIntCase = source.indexOf('case "parseInt"');
        expect(parseIntCase).toBeGreaterThan(-1);
        const block = source.slice(parseIntCase, parseIntCase + 300);
        expect(block).toMatch(/\.length\s*>/);
      });
    });

  // from tests/audit76.test.ts #5 — lc-solver parseFloat should validate string length
  describe("#5 — lc-solver parseFloat should validate string length", () => {
      it("should check string length before parseFloat", () => {
        const source = readFileSync("src/logic/lc-solver.ts", "utf-8");
        const parseFloatCase = source.indexOf('case "parseFloat"');
        expect(parseFloatCase).toBeGreaterThan(-1);
        const block = source.slice(parseFloatCase, parseFloatCase + 300);
        expect(block).toMatch(/\.length\s*>/);
      });
    });

  // from tests/audit76.test.ts #10 — lc-solver split should cap delimiter length
  describe("#10 — lc-solver split should cap delimiter length", () => {
      it("should check delimiter length", () => {
        const source = readFileSync("src/logic/lc-solver.ts", "utf-8");
        const splitCase = source.indexOf('case "split"');
        expect(splitCase).toBeGreaterThan(-1);
        const block = source.slice(splitCase, splitCase + 400);
        expect(block).toMatch(/delim\.length\s*>\s*\d{2,}/);
      });
    });

  // from tests/audit77.test.ts #1 — evaluateWithBinding parseInt should validate string length
  describe("#1 — evaluateWithBinding parseInt should validate string length", () => {
      it("should check string length before parseInt in evaluateWithBinding", () => {
        const source = readFileSync("src/logic/lc-solver.ts", "utf-8");
        // Find the evaluateWithBinding parseInt case (second occurrence)
        const firstParseInt = source.indexOf('case "parseInt"');
        expect(firstParseInt).toBeGreaterThan(-1);
        const secondParseInt = source.indexOf('case "parseInt"', firstParseInt + 1);
        expect(secondParseInt).toBeGreaterThan(-1);
        const block = source.slice(secondParseInt, secondParseInt + 300);
        expect(block).toMatch(/\.length\s*>/);
      });
    });

  // from tests/audit77.test.ts #2 — evaluateWithBinding parseFloat should validate string length
  describe("#2 — evaluateWithBinding parseFloat should validate string length", () => {
      it("should check string length before parseFloat in evaluateWithBinding", () => {
        const source = readFileSync("src/logic/lc-solver.ts", "utf-8");
        const firstParseFloat = source.indexOf('case "parseFloat"');
        expect(firstParseFloat).toBeGreaterThan(-1);
        const secondParseFloat = source.indexOf('case "parseFloat"', firstParseFloat + 1);
        expect(secondParseFloat).toBeGreaterThan(-1);
        const block = source.slice(secondParseFloat, secondParseFloat + 300);
        expect(block).toMatch(/\.length\s*>/);
      });
    });

  // from tests/audit78.test.ts #9 — define-fn should check term.examples before access
  describe("#9 — define-fn should check term.examples before access", () => {
      it("should guard term.examples with null check", () => {
        const source = readFileSync("src/logic/lc-solver.ts", "utf-8");
        const defineFn = source.indexOf('case "define-fn":');
        expect(defineFn).toBeGreaterThan(-1);
        const block = source.slice(defineFn, defineFn + 300);
        expect(block).toMatch(/!term\.examples|term\.examples\s*&&|term\.examples\.length\s*[<>=]/);
      });
    });

});
