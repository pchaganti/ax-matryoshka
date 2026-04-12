/**
 * Tests for schema-validated responses on `(llm_query …)` and
 * `(llm_batch …)` — the second OOLONG optimization.
 *
 * The first iteration scopes schemas to ENUM-ONLY validation via a new
 * `(one_of …)` constraint. Rationale: the v1 pain point is that free-
 * form LLM responses are unreliable to filter/count on downstream
 * (`(filter $res1 …)` matches substrings, not exact tokens), which
 * means the "LLM as a composable query primitive" claim of the OOLONG
 * pattern doesn't cash in at N > ~5. Enum validation solves that
 * concretely for classification tasks (rate complexity as
 * low/medium/high, tag bugs as security/perf/ux, etc.) without
 * introducing a new `field` primitive or JSON-schema parser.
 *
 * Wire contract:
 *   (llm_query "Rate: {item}" (item x) (one_of "low" "medium" "high"))
 *   (llm_batch COLL (lambda x (llm_query "..." (x x) (one_of "a" "b"))))
 *
 * Semantics:
 *   1. The prompt is augmented with a directive naming the allowed
 *      values so the model knows the contract.
 *   2. After the bridge returns, each response is validated:
 *      case-insensitive trim-compare against the allowed list. Match
 *      → return the CANONICAL (original-case) value. No match → the
 *      solver fails the query with a clear error naming the bad
 *      response and the allowed set.
 *   3. For llm_batch, validation is per-item; any invalid item fails
 *      the whole batch (no partial results leaked into the handle).
 *
 * Coverage:
 *   1. Parser — (one_of ...) in any position, empty/malformed rejected.
 *   2. Solver — prompt augmentation, canonicalization, bad-response error.
 *   3. llm_batch propagates the constraint per-item.
 */

import { describe, it, expect } from "vitest";
import { parse } from "../../src/logic/lc-parser.js";
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

describe("one_of parser", () => {
  it("parses llm_query with a trailing (one_of ...) constraint", () => {
    const result = parse(
      '(llm_query "Rate: {item}" (item x) (one_of "low" "medium" "high"))'
    );
    expect(result.success).toBe(true);
    if (result.term?.tag === "llm_query") {
      expect(result.term.oneOf).toEqual(["low", "medium", "high"]);
      // Bindings should still parse — one_of is not a binding.
      expect(result.term.bindings).toHaveLength(1);
      expect(result.term.bindings[0].name).toBe("item");
    }
  });

  it("parses (one_of ...) even without any bindings", () => {
    const result = parse(
      '(llm_query "pick a color" (one_of "red" "blue"))'
    );
    expect(result.success).toBe(true);
    if (result.term?.tag === "llm_query") {
      expect(result.term.oneOf).toEqual(["red", "blue"]);
      expect(result.term.bindings).toEqual([]);
    }
  });

  it("parses (one_of ...) before bindings", () => {
    const result = parse(
      '(llm_query "Rate: {item}" (one_of "a" "b") (item _1))'
    );
    expect(result.success).toBe(true);
    if (result.term?.tag === "llm_query") {
      expect(result.term.oneOf).toEqual(["a", "b"]);
      expect(result.term.bindings).toHaveLength(1);
    }
  });

  it("rejects an empty (one_of)", () => {
    const result = parse('(llm_query "prompt" (one_of))');
    expect(result.success).toBe(false);
  });

  it("rejects non-string enum values", () => {
    const result = parse('(llm_query "prompt" (one_of "a" 42))');
    expect(result.success).toBe(false);
  });

  it("rejects duplicate (one_of ...) constraints", () => {
    const result = parse(
      '(llm_query "prompt" (one_of "a" "b") (one_of "c" "d"))'
    );
    expect(result.success).toBe(false);
  });

  it("propagates (one_of ...) through llm_batch", () => {
    const result = parse(
      '(llm_batch RESULTS (lambda x (llm_query "Rate: {item}" (item x) (one_of "low" "high"))))'
    );
    expect(result.success).toBe(true);
    if (result.term?.tag === "llm_batch") {
      expect(result.term.oneOf).toEqual(["low", "high"]);
    }
  });
});

describe("one_of solver — llm_query", () => {
  it("appends a constraint directive to the prompt", async () => {
    let seenPrompt = "";
    const tools = makeTools({
      llmQuery: async (p: string) => {
        seenPrompt = p;
        return "low";
      },
    });
    const parsed = parse(
      '(llm_query "Rate this" (one_of "low" "medium" "high"))'
    );
    const result = await solve(parsed.term!, tools, new Map());
    expect(result.success).toBe(true);
    // The prompt the bridge received MUST include the allowed set.
    expect(seenPrompt).toContain("low");
    expect(seenPrompt).toContain("medium");
    expect(seenPrompt).toContain("high");
    expect(seenPrompt).not.toBe("Rate this"); // augmented, not raw
  });

  it("returns the canonical value on an exact match", async () => {
    const tools = makeTools({
      llmQuery: async () => "medium",
    });
    const parsed = parse(
      '(llm_query "Rate" (one_of "low" "medium" "high"))'
    );
    const result = await solve(parsed.term!, tools, new Map());
    expect(result.success).toBe(true);
    expect(result.value).toBe("medium");
  });

  it("canonicalizes case-mismatched responses", async () => {
    const tools = makeTools({
      llmQuery: async () => "  HIGH  ",
    });
    const parsed = parse(
      '(llm_query "Rate" (one_of "low" "medium" "high"))'
    );
    const result = await solve(parsed.term!, tools, new Map());
    expect(result.success).toBe(true);
    // The canonical value is the one from the enum declaration.
    expect(result.value).toBe("high");
  });

  it("errors with a clear message when the response isn't in the enum", async () => {
    const tools = makeTools({
      llmQuery: async () => "not-sure",
    });
    const parsed = parse(
      '(llm_query "Rate" (one_of "low" "medium" "high"))'
    );
    const result = await solve(parsed.term!, tools, new Map());
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/one_of/i);
    expect(result.error).toMatch(/not-sure/);
    expect(result.error).toMatch(/low.*medium.*high/);
  });
});

describe("one_of solver — llm_batch", () => {
  it("validates each response in the batch", async () => {
    const tools = makeTools({
      llmBatch: async () => ["low", "medium", "high"],
    });
    const parsed = parse(
      '(llm_batch RESULTS (lambda x (llm_query "Rate: {item}" (item x) (one_of "low" "medium" "high"))))'
    );
    const bindings: Bindings = new Map();
    bindings.set("RESULTS", [
      { line: "a" },
      { line: "b" },
      { line: "c" },
    ]);
    const result = await solve(parsed.term!, tools, bindings);
    expect(result.success).toBe(true);
    expect(result.value).toEqual(["low", "medium", "high"]);
  });

  it("fails the batch when any one response is out-of-enum", async () => {
    const tools = makeTools({
      llmBatch: async () => ["low", "??? dunno ???", "high"],
    });
    const parsed = parse(
      '(llm_batch RESULTS (lambda x (llm_query "Rate: {item}" (item x) (one_of "low" "medium" "high"))))'
    );
    const bindings: Bindings = new Map();
    bindings.set("RESULTS", [{ line: "a" }, { line: "b" }, { line: "c" }]);
    const result = await solve(parsed.term!, tools, bindings);
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/one_of/i);
    expect(result.error).toMatch(/dunno/);
    // The error should name WHICH item failed so the caller can debug.
    expect(result.error).toMatch(/(item 2|index 1)/i);
  });

  it("canonicalizes each batch response independently", async () => {
    const tools = makeTools({
      llmBatch: async () => ["  LOW  ", "High\n", "medium"],
    });
    const parsed = parse(
      '(llm_batch RESULTS (lambda x (llm_query "Rate: {item}" (item x) (one_of "low" "medium" "high"))))'
    );
    const bindings: Bindings = new Map();
    bindings.set("RESULTS", [{ line: "a" }, { line: "b" }, { line: "c" }]);
    const result = await solve(parsed.term!, tools, bindings);
    expect(result.success).toBe(true);
    expect(result.value).toEqual(["low", "high", "medium"]);
  });

  it("augments every per-item prompt with the constraint directive", async () => {
    let seenPrompts: string[] = [];
    const tools = makeTools({
      llmBatch: async (prompts: string[]) => {
        seenPrompts = [...prompts];
        return prompts.map(() => "low");
      },
    });
    const parsed = parse(
      '(llm_batch RESULTS (lambda x (llm_query "Rate: {item}" (item x) (one_of "low" "high"))))'
    );
    const bindings: Bindings = new Map();
    bindings.set("RESULTS", [{ line: "a" }, { line: "b" }]);
    await solve(parsed.term!, tools, bindings);
    expect(seenPrompts).toHaveLength(2);
    for (const p of seenPrompts) {
      expect(p).toContain("low");
      expect(p).toContain("high");
    }
  });
});

describe("downstream filter composability", () => {
  it("allows (filter ...) to pick validated values exactly", async () => {
    // The whole point of enum validation: you can reliably filter
    // on exact matches without worrying about free-text noise.
    const tools = makeTools({
      llmBatch: async () => ["high", "low", "high", "medium"],
    });
    const parsed = parse(
      '(llm_batch RESULTS (lambda x (llm_query "Rate: {item}" (item x) (one_of "low" "medium" "high"))))'
    );
    const bindings: Bindings = new Map();
    bindings.set("RESULTS", [
      { line: "a" },
      { line: "b" },
      { line: "c" },
      { line: "d" },
    ]);
    const result = await solve(parsed.term!, tools, bindings);
    expect(result.success).toBe(true);
    // After the batch, bind the result and filter the array on the
    // validated "high" token. With validation, this is reliable.
    const ratings = result.value as string[];
    const highs = ratings.filter((r) => r === "high");
    expect(highs).toHaveLength(2);
  });
});
