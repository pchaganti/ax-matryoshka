/**
 * Tests for the `(llm_batch …)` LC primitive — batched suspension
 * variant of `(llm_query …)`.
 *
 * The pattern `(map COLL (lambda x (llm_query …)))` is the most common
 * OOLONG shape, but it fires N serial suspensions — one per item. This
 * is wasted work for independent items: the caller pays N round-trips
 * of protocol overhead when ONE trip carrying all N prompts would do.
 *
 * `llm_batch` is a drop-in replacement with identical syntax whose
 * solver collects every interpolated prompt up-front and dispatches
 * them through `tools.llmBatch` in a single call. The suspend/resume
 * wire protocol is extended in a parallel test file.
 *
 * Coverage:
 *   1. Parser — lambda-of-llm_query shape; rejects malformed bodies.
 *   2. Type inference — returns array<string>.
 *   3. Solver — single dispatch through `tools.llmBatch`, per-item
 *      interpolation, empty collections, and error paths.
 */

import { describe, it, expect } from "vitest";
import { parse } from "../../src/logic/lc-parser.js";
import { inferType, typeToString } from "../../src/logic/type-inference.js";
import {
  solve,
  type SolverTools,
  type Bindings,
} from "../../src/logic/lc-solver.js";

function makeTools(overrides: Partial<SolverTools> = {}): SolverTools {
  return {
    context: "",
    lines: [],
    grep: () => [],
    fuzzy_search: () => [],
    bm25: () => [],
    semantic: () => [],
    text_stats: () => ({
      length: 0,
      lineCount: 0,
      sample: { start: "", middle: "", end: "" },
    }),
    ...overrides,
  };
}

describe("llm_batch parser", () => {
  it("parses the zero-binding form", () => {
    const result = parse(
      '(llm_batch RESULTS (lambda x (llm_query "classify this item")))'
    );
    expect(result.success).toBe(true);
    expect(result.term?.tag).toBe("llm_batch");
    if (result.term?.tag === "llm_batch") {
      expect(result.term.param).toBe("x");
      expect(result.term.prompt).toBe("classify this item");
      expect(result.term.bindings).toEqual([]);
      // Collection term must round-trip untouched.
      expect(result.term.collection.tag).toBe("var");
    }
  });

  it("parses a single-binding form referencing the lambda parameter", () => {
    const result = parse(
      '(llm_batch RESULTS (lambda x (llm_query "tag: {item}" (item x))))'
    );
    expect(result.success).toBe(true);
    if (result.term?.tag === "llm_batch") {
      expect(result.term.prompt).toContain("{item}");
      expect(result.term.bindings).toHaveLength(1);
      expect(result.term.bindings[0].name).toBe("item");
      expect(result.term.bindings[0].value.tag).toBe("var");
      if (result.term.bindings[0].value.tag === "var") {
        expect(result.term.bindings[0].value.name).toBe("x");
      }
    }
  });

  it("parses a multi-binding form with nested terms", () => {
    const result = parse(
      '(llm_batch RESULTS (lambda x (llm_query "Rate {name}: {body}" (name x) (body (get_symbol_body x)))))'
    );
    expect(result.success).toBe(true);
    if (result.term?.tag === "llm_batch") {
      expect(result.term.bindings).toHaveLength(2);
      expect(result.term.bindings.map((b) => b.name)).toEqual(["name", "body"]);
      // Second binding is the get_symbol_body application, not a plain var.
      expect(result.term.bindings[1].value.tag).toBe("get_symbol_body");
    }
  });

  it("rejects when the second argument is not a lambda", () => {
    const result = parse('(llm_batch RESULTS 42)');
    expect(result.success).toBe(false);
  });

  it("rejects when the lambda body is not an llm_query", () => {
    const result = parse('(llm_batch RESULTS (lambda x x))');
    expect(result.success).toBe(false);
  });

  it("rejects when the lambda body is an llm_query wrapped in something else", () => {
    // Only a directly-nested llm_query is supported — wrapping it in
    // a function application means the solver cannot statically
    // collect the prompt template, so batching is impossible.
    const result = parse(
      '(llm_batch RESULTS (lambda x (match (llm_query "p" (x x)) "kw" 0)))'
    );
    expect(result.success).toBe(false);
  });
});

describe("llm_batch type inference", () => {
  it("infers array<string>", () => {
    const result = parse(
      '(llm_batch RESULTS (lambda x (llm_query "t: {item}" (item x))))'
    );
    expect(result.success).toBe(true);
    const type = inferType(result.term!);
    expect(type.valid).toBe(true);
    expect(type.type && typeToString(type.type)).toBe("string[]");
  });
});

describe("llm_batch solver — dispatch", () => {
  it("delegates to tools.llmBatch with ALL prompts in a single call", async () => {
    const calls: string[][] = [];
    const tools = makeTools({
      llmBatch: async (prompts: string[]) => {
        calls.push([...prompts]);
        return prompts.map((_, i) => `response-${i + 1}`);
      },
    });

    const parsed = parse(
      '(llm_batch RESULTS (lambda x (llm_query "tag: {item}" (item x))))'
    );
    expect(parsed.success).toBe(true);

    const bindings: Bindings = new Map();
    bindings.set("RESULTS", [
      { line: "first" },
      { line: "second" },
      { line: "third" },
    ]);

    const result = await solve(parsed.term!, tools, bindings);
    expect(result.success).toBe(true);

    // Key assertion: ONE call to llmBatch, not three serial llmQuery calls.
    expect(calls).toHaveLength(1);
    expect(calls[0]).toHaveLength(3);
    expect(calls[0][0]).toContain("first");
    expect(calls[0][1]).toContain("second");
    expect(calls[0][2]).toContain("third");

    expect(result.value).toEqual(["response-1", "response-2", "response-3"]);
  });

  it("interpolates per-item bindings independently", async () => {
    let observedPrompts: string[] = [];
    const tools = makeTools({
      llmBatch: async (prompts: string[]) => {
        observedPrompts = [...prompts];
        return prompts.map(() => "ok");
      },
    });

    const parsed = parse(
      '(llm_batch RESULTS (lambda x (llm_query "Rate: {item}" (item x))))'
    );
    expect(parsed.success).toBe(true);

    const bindings: Bindings = new Map();
    bindings.set("RESULTS", [
      { line: "alpha" },
      { line: "beta" },
      { line: "gamma" },
    ]);

    await solve(parsed.term!, tools, bindings);

    expect(observedPrompts).toEqual([
      "Rate: alpha",
      "Rate: beta",
      "Rate: gamma",
    ]);
  });

  it("returns the response array in collection order", async () => {
    const tools = makeTools({
      llmBatch: async (prompts: string[]) =>
        prompts.map((p) => p.toUpperCase()),
    });
    const parsed = parse(
      '(llm_batch RESULTS (lambda x (llm_query "{item}" (item x))))'
    );
    const bindings: Bindings = new Map();
    bindings.set("RESULTS", [
      { line: "a" },
      { line: "b" },
      { line: "c" },
    ]);
    const result = await solve(parsed.term!, tools, bindings);
    expect(result.success).toBe(true);
    expect(result.value).toEqual(["A", "B", "C"]);
  });

  it("handles an empty collection without calling llmBatch at all", async () => {
    let called = false;
    const tools = makeTools({
      llmBatch: async () => {
        called = true;
        return [];
      },
    });
    const parsed = parse(
      '(llm_batch RESULTS (lambda x (llm_query "t" (item x))))'
    );
    const bindings: Bindings = new Map();
    bindings.set("RESULTS", []);
    const result = await solve(parsed.term!, tools, bindings);
    expect(result.success).toBe(true);
    expect(result.value).toEqual([]);
    expect(called).toBe(false);
  });

  it("errors cleanly when tools.llmBatch is missing", async () => {
    const parsed = parse(
      '(llm_batch RESULTS (lambda x (llm_query "t")))'
    );
    const bindings: Bindings = new Map();
    bindings.set("RESULTS", [{ line: "a" }]);
    const result = await solve(parsed.term!, makeTools(), bindings);
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/llm_batch is not available/i);
  });

  it("propagates errors thrown by tools.llmBatch", async () => {
    const tools = makeTools({
      llmBatch: async () => {
        throw new Error("batch upstream exploded");
      },
    });
    const parsed = parse(
      '(llm_batch RESULTS (lambda x (llm_query "t" (item x))))'
    );
    const bindings: Bindings = new Map();
    bindings.set("RESULTS", [{ line: "a" }, { line: "b" }]);
    const result = await solve(parsed.term!, tools, bindings);
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/batch upstream exploded/);
  });

  it("rejects when tools.llmBatch returns the wrong number of responses", async () => {
    const tools = makeTools({
      llmBatch: async () => ["only-one"],
    });
    const parsed = parse(
      '(llm_batch RESULTS (lambda x (llm_query "t" (item x))))'
    );
    const bindings: Bindings = new Map();
    bindings.set("RESULTS", [{ line: "a" }, { line: "b" }, { line: "c" }]);
    const result = await solve(parsed.term!, tools, bindings);
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/expected 3 responses.*got 1/i);
  });
});
