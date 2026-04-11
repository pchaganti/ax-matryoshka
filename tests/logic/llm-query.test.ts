/**
 * Tests for the `(llm_query …)` LC primitive — the symbolic-recursion
 * paper-review GAP 1 fix.
 *
 * Coverage (top-level shapes — nested cases are in llm-query-nested.test.ts):
 *   1. Parser accepts the zero-binding and n-binding forms and rejects
 *      malformed shapes.
 *   2. Type inference returns `string`.
 *   3. `solve()` dispatches `(llm_query …)` through `tools.llmQuery`
 *      and interpolates named bindings into the prompt.
 *   4. `solve()` surfaces a clean error when `tools.llmQuery` is
 *      missing.
 *   5. `solve()` propagates errors thrown by the underlying
 *      `tools.llmQuery` callback.
 *   6. Bindings inside a `(llm_query …)` are evaluated via the solver
 *      and respect cross-turn variables (`RESULTS`, `_N`).
 */

import { describe, it, expect } from "vitest";
import { parse } from "../../src/logic/lc-parser.js";
import { inferType, typeToString } from "../../src/logic/type-inference.js";
import {
  solve,
  type SolverTools,
  type Bindings,
} from "../../src/logic/lc-solver.js";

// Minimal SolverTools stub — the `(llm_query …)` path doesn't touch
// grep/fuzzy/bm25/semantic/text_stats, so all the search callbacks can
// return empty results. `lines` is required since the 3912e88 refactor.
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

describe("llm_query parser", () => {
  it("parses the zero-binding form", async () => {
    const result = parse('(llm_query "summarize the document")');
    expect(result.success).toBe(true);
    expect(result.term?.tag).toBe("llm_query");
    if (result.term?.tag === "llm_query") {
      expect(result.term.prompt).toBe("summarize the document");
      expect(result.term.bindings).toEqual([]);
    }
  });

  it("parses a single-binding form", async () => {
    const result = parse(
      '(llm_query "Classify these errors: {errors}" (errors RESULTS))'
    );
    expect(result.success).toBe(true);
    if (result.term?.tag === "llm_query") {
      expect(result.term.prompt).toContain("{errors}");
      expect(result.term.bindings).toHaveLength(1);
      expect(result.term.bindings[0].name).toBe("errors");
      expect(result.term.bindings[0].value.tag).toBe("var");
    }
  });

  it("parses a multi-binding form", async () => {
    const result = parse(
      '(llm_query "Apply {rules} to {data}" (rules _1) (data _2))'
    );
    expect(result.success).toBe(true);
    if (result.term?.tag === "llm_query") {
      expect(result.term.bindings).toHaveLength(2);
      expect(result.term.bindings.map((b) => b.name)).toEqual(["rules", "data"]);
    }
  });

  it("rejects a malformed binding that lacks parens", async () => {
    // `(llm_query "prompt" data _1)` is ambiguous — not a (name value)
    // pair. The parser should fail cleanly rather than partially consume.
    const result = parse('(llm_query "prompt" data _1)');
    expect(result.success).toBe(false);
  });

  it("rejects a binding with an unsafe placeholder name", async () => {
    const result = parse('(llm_query "prompt" ("bad name" _1))');
    expect(result.success).toBe(false);
  });
});

describe("llm_query type inference", () => {
  it("infers string", async () => {
    const result = parse('(llm_query "summarize")');
    expect(result.success).toBe(true);
    const type = inferType(result.term!);
    expect(type.valid).toBe(true);
    expect(type.type && typeToString(type.type)).toBe("string");
  });
});

describe("llm_query solver — top-level execution", () => {
  it("delegates to tools.llmQuery and returns its response", async () => {
    const received: string[] = [];
    const tools = makeTools({
      llmQuery: async (prompt: string) => {
        received.push(prompt);
        return "MOCKED SUB-LLM RESPONSE";
      },
    });

    const parsed = parse('(llm_query "What is this document about?")');
    expect(parsed.success).toBe(true);

    const result = await solve(parsed.term!, tools, new Map());
    expect(result.success).toBe(true);
    expect(result.value).toBe("MOCKED SUB-LLM RESPONSE");
    expect(received).toHaveLength(1);
    expect(received[0]).toBe("What is this document about?");
  });

  it("interpolates a single {name} placeholder from a binding", async () => {
    const received: string[] = [];
    const tools = makeTools({
      llmQuery: async (prompt: string) => {
        received.push(prompt);
        return "ok";
      },
    });

    const bindings: Bindings = new Map();
    bindings.set("RESULTS", [
      { line: "ERROR: disk full" },
      { line: "ERROR: timeout" },
    ]);

    const parsed = parse(
      '(llm_query "Classify these errors: {errors}" (errors RESULTS))'
    );
    expect(parsed.success).toBe(true);

    const result = await solve(parsed.term!, tools, bindings);
    expect(result.success).toBe(true);
    expect(received[0]).toContain("Classify these errors:");
    expect(received[0]).toContain("ERROR: disk full");
    expect(received[0]).toContain("ERROR: timeout");
    // `{errors}` placeholder must be fully replaced — no stray braces.
    expect(received[0]).not.toContain("{errors}");
  });

  it("interpolates multiple named bindings", async () => {
    let seenPrompt = "";
    const tools = makeTools({
      llmQuery: async (prompt: string) => {
        seenPrompt = prompt;
        return "done";
      },
    });

    const bindings: Bindings = new Map();
    bindings.set("_1", "rule-set-A");
    bindings.set("_2", "data-set-B");

    const parsed = parse(
      '(llm_query "Apply {rules} to {data}" (rules _1) (data _2))'
    );
    expect(parsed.success).toBe(true);
    const result = await solve(parsed.term!, tools, bindings);

    expect(result.success).toBe(true);
    expect(seenPrompt).toBe("Apply rule-set-A to data-set-B");
  });

  it("delegates non-llm_query terms to the sync solver", async () => {
    // `(lit 42)` should round-trip through the sync path unchanged.
    const parsed = parse("42");
    expect(parsed.success).toBe(true);
    const result = await solve(parsed.term!, makeTools(), new Map());
    expect(result.success).toBe(true);
    expect(result.value).toBe(42);
  });
});

describe("llm_query solver — error paths", () => {
  it("errors cleanly when tools.llmQuery is missing", async () => {
    const parsed = parse('(llm_query "summarize")');
    expect(parsed.success).toBe(true);
    const result = await solve(parsed.term!, makeTools(), new Map());
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/llm_query is not available/i);
  });

  it("propagates errors thrown by tools.llmQuery", async () => {
    const tools = makeTools({
      llmQuery: async () => {
        throw new Error("upstream LLM quota exceeded");
      },
    });
    const parsed = parse('(llm_query "summarize")');
    const result = await solve(parsed.term!, tools, new Map());
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/quota exceeded/);
  });

  // Nested-case coverage lives in tests/logic/llm-query-nested.test.ts.
});
