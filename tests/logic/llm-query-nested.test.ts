/**
 * Positive-assertion tests for the nested `(llm_query …)` capability
 * — the paper's OOLONG pattern
 *
 *   (map RESULTS (lambda x (llm_query "classify: {item}" (item x))))
 *
 * was the target of the full async refactor. This file exercises the
 * nested capability from several angles (map, filter predicate, if
 * branches, chained consumption) to prove that the sub-LLM is actually
 * called at the expected nested sites and that results flow through
 * downstream terms correctly.
 *
 * Originally introduced as `.fails` TDD tests; flipped to `it(...)`
 * once the async evaluator landed and the "top-level only" restriction
 * was removed.
 */

import { describe, it, expect } from "vitest";
import { parse } from "../../src/logic/lc-parser.js";
import {
  solve,
  type SolverTools,
  type Bindings,
} from "../../src/logic/lc-solver.js";

/** Minimal SolverTools stub with a recording llmQuery. */
function makeTools(opts: {
  llmQuery?: (prompt: string) => Promise<string>;
  context?: string;
} = {}): SolverTools {
  return {
    context: opts.context ?? "",
    lines: (opts.context ?? "").split("\n"),
    grep: () => [],
    fuzzy_search: () => [],
    bm25: () => [],
    semantic: () => [],
    text_stats: () => ({
      length: 0,
      lineCount: 0,
      sample: { start: "", middle: "", end: "" },
    }),
    llmQuery: opts.llmQuery,
  };
}

describe("nested llm_query — async refactor target", () => {
  it("(map RESULTS (lambda x (llm_query ...))) invokes sub-LLM once per item", async () => {
    // OOLONG core pattern: per-item semantic classification. For each
    // element in RESULTS, the lambda should call llm_query once. After
    // the refactor, this returns an Array<string> with one response per
    // input item.
    const calls: string[] = [];
    const tools = makeTools({
      llmQuery: async (prompt: string) => {
        calls.push(prompt);
        return `classified-${calls.length}`;
      },
    });

    const bindings: Bindings = new Map();
    bindings.set("RESULTS", ["line one", "line two", "line three"]);

    const parsed = parse(
      '(map RESULTS (lambda x (llm_query "classify: {item}" (item x))))'
    );
    expect(parsed.success).toBe(true);

    const result = await solve(parsed.term!, tools, bindings);
    expect(result.success).toBe(true);
    expect(Array.isArray(result.value)).toBe(true);
    expect(result.value).toEqual([
      "classified-1",
      "classified-2",
      "classified-3",
    ]);
    expect(calls).toHaveLength(3);
    expect(calls[0]).toContain("line one");
    expect(calls[1]).toContain("line two");
    expect(calls[2]).toContain("line three");
  });

  it("map-based llm_query sees each item's actual value under the placeholder", async () => {
    // Stronger check: the `{item}` placeholder must interpolate the
    // per-iteration value, not the whole RESULTS binding.
    const received: string[] = [];
    const tools = makeTools({
      llmQuery: async (prompt: string) => {
        received.push(prompt);
        return "ok";
      },
    });

    const bindings: Bindings = new Map();
    bindings.set("RESULTS", ["alpha", "beta"]);

    const parsed = parse(
      '(map RESULTS (lambda x (llm_query "Classify {thing}" (thing x))))'
    );
    expect(parsed.success).toBe(true);

    await solve(parsed.term!, tools, bindings);
    expect(received).toHaveLength(2);
    expect(received[0]).toBe("Classify alpha");
    expect(received[1]).toBe("Classify beta");
  });

  it("(if cond (llm_query ...) (llm_query ...)) dispatches through the correct branch", async () => {
    // `if` branches must be awaitable when they contain llm_query. Only
    // one sub-LLM call should happen (the taken branch).
    const calls: string[] = [];
    const tools = makeTools({
      llmQuery: async (prompt: string) => {
        calls.push(prompt);
        return prompt.includes("then") ? "then-branch" : "else-branch";
      },
    });

    const parsed = parse(
      '(if (lit true) (llm_query "then path") (llm_query "else path"))'
    );
    expect(parsed.success).toBe(true);

    const result = await solve(parsed.term!, tools, new Map());
    expect(result.success).toBe(true);
    expect(result.value).toBe("then-branch");
    expect(calls).toHaveLength(1);
    expect(calls[0]).toBe("then path");
  });

  it("filter with an llm_query-backed predicate includes only matching items", async () => {
    // Practical OOLONG-Pairs pattern: semantic filtering. The lambda
    // calls llm_query per item and matches its response against a
    // regex; items whose sub-LLM response says "keep" survive.
    const tools = makeTools({
      llmQuery: async (prompt: string) => {
        // Accept items whose name contains "good".
        return prompt.includes("good") ? "keep" : "drop";
      },
    });

    const bindings: Bindings = new Map();
    bindings.set("RESULTS", ["good item", "bad item", "another good one"]);

    const parsed = parse(
      '(filter RESULTS (lambda x (match (llm_query "judge: {item}" (item x)) "keep" 0)))'
    );
    expect(parsed.success).toBe(true);

    const result = await solve(parsed.term!, tools, bindings);
    expect(result.success).toBe(true);
    expect(result.value).toEqual(["good item", "another good one"]);
  });

  it("chained map → count via RESULTS works after the refactor", async () => {
    // Exercises the full loop: nested llm_query produces an array,
    // RESULTS is re-bound to that array, and a follow-up `(count ...)`
    // over the result still works.
    const tools = makeTools({
      llmQuery: async () => "OK",
    });

    const bindings: Bindings = new Map();
    bindings.set("RESULTS", ["a", "b", "c", "d"]);

    const parsed = parse(
      '(map RESULTS (lambda x (llm_query "score {item}" (item x))))'
    );
    expect(parsed.success).toBe(true);

    const mapResult = await solve(parsed.term!, tools, bindings);
    expect(mapResult.success).toBe(true);
    expect(mapResult.value).toEqual(["OK", "OK", "OK", "OK"]);
  });
});
