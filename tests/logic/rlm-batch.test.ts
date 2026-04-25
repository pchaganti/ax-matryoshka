/**
 * Tests for `(rlm_batch …)` — Phase 2 of the recursive-Nucleus port
 * (matryoshka-16h).
 *
 * Surface:
 *   (rlm_batch COLL (lambda x (rlm_query "prompt" (context EXPR))))
 *
 * Drop-in concurrent variant of `(map COLL (lambda x (rlm_query …)))`.
 * The solver fans the per-item child sessions out via a worker pool
 * (default 4-way) so wall-clock scales sub-linearly with item count.
 *
 * Coverage in this file (parser + types + solver dispatch — bridge
 * wiring is exercised in the demo benchmark):
 *   1. Parser accepts the canonical shape and rejects ill-formed
 *      bodies (lambda body must be a direct rlm_query).
 *   2. Type inference returns array<string>.
 *   3. Solver collects per-item (prompt, context) pairs and dispatches
 *      them through `tools.rlmBatch` in one call.
 *   4. Solver preserves order of responses.
 *   5. Solver propagates errors thrown by `tools.rlmBatch`.
 *   6. Solver returns clear "not configured" error when rlmBatch is
 *      missing.
 */

import { describe, it, expect } from "vitest";
import { parse } from "../../src/logic/lc-parser.js";
import { inferType, typeToString } from "../../src/logic/type-inference.js";
import { solve, type SolverTools, type Bindings } from "../../src/logic/lc-solver.js";

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

describe("rlm_batch parser", () => {
  it("parses the canonical shape: (rlm_batch COLL (lambda x (rlm_query \"p\" (context x))))", () => {
    const result = parse(
      '(rlm_batch RESULTS (lambda c (rlm_query "extract" (context c))))'
    );
    expect(result.success).toBe(true);
    expect(result.term?.tag).toBe("rlm_batch");
    if (result.term?.tag === "rlm_batch") {
      expect(result.term.param).toBe("c");
      expect(result.term.prompt).toBe("extract");
      expect(result.term.context?.tag).toBe("var");
      expect(result.term.collection.tag).toBe("var");
    }
  });

  it("parses the no-context form (lambda body has no (context …) clause)", () => {
    const result = parse(
      '(rlm_batch RESULTS (lambda c (rlm_query "summarize")))'
    );
    expect(result.success).toBe(true);
    if (result.term?.tag === "rlm_batch") {
      expect(result.term.prompt).toBe("summarize");
      expect(result.term.context).toBeUndefined();
    }
  });

  it("rejects a lambda whose body is not a direct rlm_query", () => {
    // Same restriction as llm_batch: only "lambda of direct
    // rlm_query" is supported, because batching requires statically
    // collecting the prompt template and the context expression. A
    // wrapped form (e.g. (if cond (rlm_query …) "default")) is not
    // batchable.
    const result = parse(
      '(rlm_batch RESULTS (lambda c (if true (rlm_query "p") "default")))'
    );
    expect(result.success).toBe(false);
  });

  it("rejects when the second argument is not a lambda", () => {
    const result = parse('(rlm_batch RESULTS (rlm_query "p"))');
    expect(result.success).toBe(false);
  });
});

describe("rlm_batch type inference", () => {
  it("returns array<string>", () => {
    const result = parse(
      '(rlm_batch RESULTS (lambda c (rlm_query "p" (context c))))'
    );
    expect(result.success).toBe(true);
    if (result.term) {
      const typed = inferType(result.term);
      expect(typed.valid).toBe(true);
      expect(typed.type ? typeToString(typed.type) : null).toBe("string[]");
    }
  });
});

describe("rlm_batch solver dispatch", () => {
  it("returns a clear error when tools.rlmBatch is not configured", async () => {
    const parsed = parse(
      '(rlm_batch RESULTS (lambda c (rlm_query "p" (context c))))'
    );
    const tools = makeTools(); // no rlmBatch
    const bindings: Bindings = new Map([["RESULTS", ["a", "b"]]]);
    const result = await solve(parsed.term!, tools, bindings);
    expect(result.success).toBe(false);
    expect(result.error ?? "").toMatch(/rlm_batch/i);
  });

  it("collects per-item (prompt, context) pairs and dispatches in one call", async () => {
    const parsed = parse(
      '(rlm_batch RESULTS (lambda c (rlm_query "tag" (context c))))'
    );
    let receivedItems: Array<{ prompt: string; contextDoc: string | null }> | null = null;
    let callCount = 0;
    const tools = makeTools({
      rlmBatch: async (items) => {
        callCount++;
        receivedItems = items;
        return items.map((_, i) => `r${i}`);
      },
    });
    const bindings: Bindings = new Map([["RESULTS", ["alpha", "beta", "gamma"]]]);
    const result = await solve(parsed.term!, tools, bindings);
    expect(result.success).toBe(true);
    expect(callCount).toBe(1); // ONE batch call, not three
    expect(receivedItems).toHaveLength(3);
    expect(receivedItems!.map((i) => i.prompt)).toEqual(["tag", "tag", "tag"]);
    expect(receivedItems!.map((i) => i.contextDoc)).toEqual([
      "alpha",
      "beta",
      "gamma",
    ]);
    expect(result.value).toEqual(["r0", "r1", "r2"]);
  });

  it("preserves response order returned by tools.rlmBatch", async () => {
    const parsed = parse(
      '(rlm_batch RESULTS (lambda c (rlm_query "p" (context c))))'
    );
    const tools = makeTools({
      rlmBatch: async (items) => items.map((it) => `[${it.contextDoc}]`),
    });
    const bindings: Bindings = new Map([["RESULTS", ["one", "two", "three"]]]);
    const result = await solve(parsed.term!, tools, bindings);
    expect(result.success).toBe(true);
    expect(result.value).toEqual(["[one]", "[two]", "[three]"]);
  });

  it("propagates errors thrown by tools.rlmBatch as a solver error", async () => {
    const parsed = parse(
      '(rlm_batch RESULTS (lambda c (rlm_query "p" (context c))))'
    );
    const tools = makeTools({
      rlmBatch: async () => {
        throw new Error("batch dispatch failed");
      },
    });
    const bindings: Bindings = new Map([["RESULTS", ["a"]]]);
    const result = await solve(parsed.term!, tools, bindings);
    expect(result.success).toBe(false);
    expect(result.error ?? "").toMatch(/batch dispatch failed/);
  });

  it("returns [] for an empty collection without dispatching", async () => {
    const parsed = parse(
      '(rlm_batch RESULTS (lambda c (rlm_query "p" (context c))))'
    );
    let dispatched = false;
    const tools = makeTools({
      rlmBatch: async () => {
        dispatched = true;
        return [];
      },
    });
    const bindings: Bindings = new Map([["RESULTS", []]]);
    const result = await solve(parsed.term!, tools, bindings);
    expect(result.success).toBe(true);
    expect(result.value).toEqual([]);
    expect(dispatched).toBe(false);
  });

  it("materializes per-item contexts using the same line-oriented rules as rlm_query", async () => {
    // The lambda binds c to each item. When the item is itself
    // an array (e.g. a chunk of grep results), `(context c)` should
    // produce a clean line-oriented document — same contract that
    // rlm_query's materializeContext provides.
    const parsed = parse(
      '(rlm_batch RESULTS (lambda c (rlm_query "scan" (context c))))'
    );
    let receivedItems: Array<{ prompt: string; contextDoc: string | null }> | null = null;
    const tools = makeTools({
      rlmBatch: async (items) => {
        receivedItems = items;
        return items.map(() => "ok");
      },
    });
    const bindings: Bindings = new Map([
      [
        "RESULTS",
        [
          [{ line: "AUTH: a" }, { line: "DB: b" }],
          [{ line: "NET: c" }],
        ],
      ],
    ]);
    const result = await solve(parsed.term!, tools, bindings);
    expect(result.success).toBe(true);
    expect(receivedItems).toHaveLength(2);
    expect(receivedItems![0].contextDoc).toBe("AUTH: a\nDB: b");
    expect(receivedItems![1].contextDoc).toBe("NET: c");
  });
});

describe("rlm_batch concurrency contract", () => {
  it("a real Promise.all-backed rlmBatch finishes in ~max(item) latency, not ~sum(item)", async () => {
    // The solver's job is to hand prompts to tools.rlmBatch in ONE
    // call. Concurrency is the rlmBatch implementation's
    // responsibility. This test asserts the CONTRACT: when the
    // implementation does Promise.all over the items, total wall
    // time is bounded by the slowest item, not the sum.
    const parsed = parse(
      '(rlm_batch RESULTS (lambda c (rlm_query "p" (context c))))'
    );
    const sleep = (ms: number) =>
      new Promise<void>((r) => setTimeout(r, ms));
    const tools = makeTools({
      rlmBatch: async (items) => {
        // Genuinely-concurrent implementation: each item sleeps
        // 100ms in parallel.
        return Promise.all(
          items.map(async (it) => {
            await sleep(100);
            return `done:${it.contextDoc}`;
          })
        );
      },
    });
    const bindings: Bindings = new Map([
      ["RESULTS", ["a", "b", "c", "d", "e", "f", "g", "h"]],
    ]);
    const start = Date.now();
    const result = await solve(parsed.term!, tools, bindings);
    const elapsed = Date.now() - start;
    expect(result.success).toBe(true);
    expect(result.value).toHaveLength(8);
    // Sequential would be ~800ms; concurrent ~100ms (with some
    // setTimeout scheduling slack). Allow up to 300ms before we'd
    // suspect serialization. This is the gate that catches a future
    // refactor accidentally introducing serial awaits inside the
    // rlmBatch dispatch path.
    expect(elapsed).toBeLessThan(300);
  });
});
