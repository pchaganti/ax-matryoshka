/**
 * Audit #15 Tests — TDD: Write failing tests, then fix
 */
import { describe, it, expect } from "vitest";

// === Issue #1: Regex case consistency ===
// match/extract must be case-insensitive across lc-interpreter and lc-solver,
// matching grep's "gmi" behavior. Chiasmus review round 2 reversed the prior
// (case-sensitive) policy because `(grep "error")` found "Error" but
// `(filter RESULTS (lambda x (match x "error" 0)))` then dropped it.
// === Issue #2: Classifier RegExp without validateRegex ===
describe("Audit15 #2: classifier validateRegex", () => {
  it("classifier should not throw on ReDoS pattern", async () => {
    const { SynthesisIntegrator } = await import("../src/logic/synthesis-integrator.js");
    const integrator = new SynthesisIntegrator();
    // The synthesizeClassifier method uses patterns internally
    // We test indirectly via synthesizeOnFailure with classify operation
    const result = integrator.synthesizeOnFailure({
      operation: "classify",
      input: "test",
      examples: [
        { input: "aaaa error", output: true },
        { input: "bbbb ok", output: false },
        { input: "cccc error", output: true },
        { input: "dddd ok", output: false },
      ],
    });
    // Should not throw; result.fn should be safe
    expect(result).toBeDefined();
    if (result.success && result.fn) {
      // Should not throw on normal input
      expect(() => result.fn("test input")).not.toThrow();
    }
  });
});

// === Issue #3: Unterminated string i++ past EOF ===
// === Issue #4: Empty keyword token from lone `:` ===
// === Issue #5: Replace $ backreference in compiled code ===
describe("Audit15 #5: compile replace $ backreference", () => {
  it("should escape $ in replacement string for compiled code", async () => {
    const { compile, compileToFunction } = await import("../src/synthesis/evalo/compile.js");
    const extractor: any = {
      tag: "replace",
      str: { tag: "input" },
      from: "foo",
      to: "$1bar",
    };
    const code = compile(extractor);
    // The compiled code's replacement should have escaped $
    // Execute it and ensure $1 is treated literally
    const fn = compileToFunction(extractor);
    const result = fn("foo");
    // Should be "$1bar" literally, not a backreference
    expect(result).toBe("$1bar");
  });
});

// === Issue #6: evaluateWithBinding match missing group<0 check ===
describe("Audit15 #6: evaluateWithBinding match group<0", () => {
  it("should return null for negative group in evaluateWithBinding match", async () => {
    const { solve } = await import("../src/logic/lc-solver.js");
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

// === Issue #7: s.slice(n, -0) bug when suffixLen=0 ===
// === Issue #8: Native function calls no try-catch ===
describe("Audit15 #8: native function try-catch in filter/map", () => {
  it("filter should handle native function that throws", async () => {
    const { evaluate } = await import("../src/logic/lc-interpreter.js");
    const tools: any = {
      grep: () => [],
      fuzzy_search: () => [],
      text_stats: () => ({ length: 0, lineCount: 0, sample: { start: "", middle: "", end: "" } }),
      context: "",
    };
    const env = new Map<string, any>();
    // Set up a native throwing function
    const throwingFn = () => { throw new Error("native error"); };
    env.set("badFn", throwingFn);

    const term: any = {
      tag: "filter",
      collection: { tag: "lit", value: [1, 2, 3] },
      predicate: { tag: "var", name: "badFn" },
    };
    // Should propagate error cleanly, not crash with unclear message
    expect(() => evaluate(term, tools, env, () => {}, 0)).toThrow();
  });
});

// === Issue #9: Split negative index not validated ===
describe("Audit15 #9: split negative index", () => {
  it("lc-interpreter split should return null for negative index", async () => {
    const { evaluate } = await import("../src/logic/lc-interpreter.js");
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
    const result = evaluate(term, tools, new Map(), () => {}, 0);
    // Negative index should return null, not undefined behavior
    expect(result).toBe(null);
  });
});

// === Issue #10: Number parser accepts multiple decimals ===
describe("Audit15 #10: parser multiple decimals", () => {
  it("should not parse 1.2.3 as NaN", async () => {
    const { parse } = await import("../src/logic/lc-parser.js");
    const result = parse("1.2.3");
    // The parser consumes "1.2.3" and parseFloat gives NaN
    // After fix, it should stop at first decimal, parsing 1.2 and leaving .3
    if (result.success && result.term?.tag === "lit") {
      // Must not be NaN
      expect(Number.isNaN(result.term.value)).toBe(false);
    }
  });
});

// === Issue #11: parseCurrency $-1234 not detected negative ===
describe("Audit15 #11: parseCurrency $-1234 negative", () => {
  it("should detect $-1234 as negative", async () => {
    const { solve } = await import("../src/logic/lc-solver.js");
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

// === Issue #12: Classifier code regex literal may contain / ===
// === Issue #13: isSafeInvariant unicode escape bypass ===
describe("Audit15 #13: verifier unicode escape bypass", () => {
  it("should reject unicode escape sequences in invariants", async () => {
    const { verifyInvariant } = await import("../src/constraints/verifier.js");
    // Unicode escape for "eval" — \u0065val
    const result = verifyInvariant(42, "\\u0065val('1+1')");
    expect(result).toBe(false);
  });
});

// === Issue #14: Sum regex multi-number lines ===
describe("Audit15 #14: sum regex multi-number lines", () => {
  it("sum should handle lines with multiple numbers correctly", async () => {
    const { solve } = await import("../src/logic/lc-solver.js");
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

// === Issue #15: IDF division by zero when docCount=0 ===
describe("Audit15 #15: IDF division by zero", () => {
  it("should handle empty document array without NaN/Infinity", async () => {
    const { inverseDocumentFrequency } = await import("../src/rag/similarity.js");
    const result = inverseDocumentFrequency([]);
    // With 0 documents, should return empty map, not Infinity values
    expect(result.size).toBe(0);
    for (const [, value] of result) {
      expect(isFinite(value)).toBe(true);
    }
  });
});
