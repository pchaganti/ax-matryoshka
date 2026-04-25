/**
 * Phase 3 — multi-context bindings.
 *
 * Surface:
 *   (context N)             → returns the Nth loaded context's content
 *   (grep "pat" HAYSTACK)   → grep optional second arg (any string term)
 *
 * Loading API: `runRLMFromContent` accepts an array of strings; each
 * becomes a context. Index 0 is the default for primitives that don't
 * specify a haystack — back-compat for single-doc workflows.
 *
 * Coverage:
 *   1. Parser accepts `(context 0)`, `(context 1)`, etc. and rejects
 *      malformed shapes.
 *   2. Type inference: `(context N)` is `string`.
 *   3. Parser accepts `(grep "pat")` and `(grep "pat" HAYSTACK)`.
 *   4. Solver: `(context 1)` returns contexts[1] from SolverTools.
 *   5. Solver: out-of-range `(context N)` errors clearly.
 *   6. Solver: `(grep "pat" haystack)` greps over haystack, NOT
 *      `tools.context`.
 *   7. Solver: `(grep "pat" (context 1))` greps doc #1.
 */

import { describe, it, expect } from "vitest";
import { parse } from "../../src/logic/lc-parser.js";
import { inferType, typeToString } from "../../src/logic/type-inference.js";
import { solve, type SolverTools } from "../../src/logic/lc-solver.js";

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

describe("(context N) parser", () => {
  it("parses with a numeric index", () => {
    const result = parse("(context 0)");
    expect(result.success).toBe(true);
    expect(result.term?.tag).toBe("context");
    if (result.term?.tag === "context") {
      expect(result.term.index).toBe(0);
    }
  });

  it("parses larger indices", () => {
    const result = parse("(context 5)");
    expect(result.success).toBe(true);
    if (result.term?.tag === "context") {
      expect(result.term.index).toBe(5);
    }
  });

  it("rejects a non-numeric index", () => {
    const result = parse('(context "alpha")');
    expect(result.success).toBe(false);
  });

  it("rejects negative indices", () => {
    const result = parse("(context -1)");
    expect(result.success).toBe(false);
  });

  it("rejects no argument", () => {
    const result = parse("(context)");
    expect(result.success).toBe(false);
  });
});

describe("(context N) type inference", () => {
  it("returns string", () => {
    const result = parse("(context 0)");
    expect(result.success).toBe(true);
    if (result.term) {
      const typed = inferType(result.term);
      expect(typed.valid).toBe(true);
      expect(typed.type ? typeToString(typed.type) : null).toBe("string");
    }
  });
});

describe("(context N) solver", () => {
  it("returns the indexed context's content", async () => {
    const parsed = parse("(context 1)");
    const tools = makeTools({
      context: "doc-zero",
      contexts: ["doc-zero", "doc-one", "doc-two"],
    });
    const result = await solve(parsed.term!, tools);
    expect(result.success).toBe(true);
    expect(result.value).toBe("doc-one");
  });

  it("falls back to tools.context when (context 0) is requested and contexts is undefined", async () => {
    // Back-compat: callers that haven't been updated to set
    // `contexts` should still get the legacy single-doc behavior at
    // index 0.
    const parsed = parse("(context 0)");
    const tools = makeTools({ context: "legacy-doc" });
    const result = await solve(parsed.term!, tools);
    expect(result.success).toBe(true);
    expect(result.value).toBe("legacy-doc");
  });

  it("errors clearly when the index is out of range", async () => {
    const parsed = parse("(context 5)");
    const tools = makeTools({
      context: "a",
      contexts: ["a", "b"],
    });
    const result = await solve(parsed.term!, tools);
    expect(result.success).toBe(false);
    expect(result.error ?? "").toMatch(/out of range|context 5|2 contexts? loaded/i);
  });
});

describe("(grep \"pat\" HAYSTACK?) parser", () => {
  it("parses the existing single-arg form unchanged", () => {
    const result = parse('(grep "ERROR")');
    expect(result.success).toBe(true);
    expect(result.term?.tag).toBe("grep");
  });

  it("parses the two-arg form with a haystack term", () => {
    const result = parse('(grep "ERROR" RESULTS)');
    expect(result.success).toBe(true);
    if (result.term?.tag === "grep") {
      expect(result.term.haystack).toBeDefined();
    }
  });

  it("parses (grep \"pat\" (context N))", () => {
    const result = parse('(grep "ERROR" (context 1))');
    expect(result.success).toBe(true);
    if (result.term?.tag === "grep") {
      expect(result.term.haystack?.tag).toBe("context");
    }
  });
});

describe("(grep \"pat\" HAYSTACK) solver", () => {
  it("greps over the selected context, not the default", async () => {
    // Doc #1 has the only ERROR line. Doc #0 (default) has none. If
    // the haystack is honored, we get exactly 1 match from doc #1.
    // If the solver ignored the haystack and grepped doc #0, we'd
    // get 0 matches.
    const parsed = parse('(grep "ERROR" (context 1))');
    const tools = makeTools({
      context: "default-doc-no-error",
      contexts: ["default-doc-no-error", "info: ok\nERROR: in doc one\nfiller"],
    });
    const result = await solve(parsed.term!, tools);
    expect(result.success).toBe(true);
    expect(Array.isArray(result.value)).toBe(true);
    const matches = result.value as Array<{ line: string; lineNum: number }>;
    expect(matches).toHaveLength(1);
    expect(matches[0].line).toContain("ERROR: in doc one");
    // Line 2 of doc #1, NOT some absolute offset across the
    // synthetic concatenation. Per-doc line semantics.
    expect(matches[0].lineNum).toBe(2);
  });

  it("greps over a string binding when haystack is a variable", async () => {
    const parsed = parse('(grep "X" RESULTS)');
    const tools = makeTools({ context: "default-no-X" });
    const bindings = new Map<string, unknown>([
      ["RESULTS", "filler\nX marks the spot\nfiller2"],
    ]);
    const result = await solve(parsed.term!, tools, bindings);
    expect(result.success).toBe(true);
    const matches = result.value as Array<{ line: string }>;
    expect(matches).toHaveLength(1);
    expect(matches[0].line).toContain("X marks the spot");
  });

  it("errors clearly when haystack is an array (not a string)", async () => {
    // (grep "X" RESULTS) where RESULTS is an array is a common user
    // mistake — they meant `grep over each item` (would be a map)
    // but wrote a haystack expression that evaluates to an array.
    // Silent coercion to "[object Object]" would produce garbage
    // matches; we reject loudly so the user fixes the query.
    const parsed = parse('(grep "X" RESULTS)');
    const tools = makeTools({ context: "ignored" });
    const bindings = new Map<string, unknown>([
      ["RESULTS", [{ line: "X marks one" }, { line: "X marks two" }]],
    ]);
    const result = await solve(parsed.term!, tools, bindings);
    expect(result.success).toBe(false);
    expect(result.error ?? "").toMatch(/haystack.*string|array|materialize/i);
  });

  it("errors clearly when haystack is null", async () => {
    const parsed = parse('(grep "X" UNDEF)');
    const tools = makeTools({ context: "ignored" });
    const bindings = new Map<string, unknown>([["UNDEF", null]]);
    const result = await solve(parsed.term!, tools, bindings);
    expect(result.success).toBe(false);
    expect(result.error ?? "").toMatch(/null|haystack.*string/i);
  });

  it("falls back to tools.context when no haystack is given (back-compat)", async () => {
    // Spy on tools.grep — when no haystack, the solver MUST route
    // through the production grep callback so existing rate limits
    // and result caps remain honored.
    const parsed = parse('(grep "X")');
    let grepCalled = false;
    const tools = makeTools({
      context: "default-content\nfiller",
      grep: () => {
        grepCalled = true;
        return [{ match: "X", line: "X line", lineNum: 1, index: 0, groups: [] }];
      },
    });
    const result = await solve(parsed.term!, tools);
    expect(result.success).toBe(true);
    expect(grepCalled).toBe(true);
    expect(result.value).toEqual([
      { match: "X", line: "X line", lineNum: 1, index: 0, groups: [] },
    ]);
  });
});
