/**
 * Phase 4 — `(show_vars)` term + FINAL_VAR surface polish.
 *
 * `(show_vars)` returns a string summary of every binding currently
 * in scope (name + type/shape, similar to `lattice_bindings`'s output
 * but reachable from inside a query). It's the equivalent of the
 * Python RLM's `SHOW_VARS()` helper.
 *
 * Coverage:
 *   1. Parser accepts `(show_vars)` with no args; rejects extra args.
 *   2. Type inference: `(show_vars)` returns string.
 *   3. Solver: returns a string mentioning each binding's name and
 *      a shape descriptor (Array(N), String(N), Number(N), etc.).
 *   4. Solver: returns a clear "no bindings" message when the
 *      bindings map is empty.
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

describe("(show_vars) parser", () => {
  it("parses with no args", () => {
    const result = parse("(show_vars)");
    expect(result.success).toBe(true);
    expect(result.term?.tag).toBe("show_vars");
  });

  it("rejects extra args", () => {
    const result = parse("(show_vars 1)");
    expect(result.success).toBe(false);
  });
});

describe("(show_vars) type inference", () => {
  it("returns string", () => {
    const result = parse("(show_vars)");
    if (result.term) {
      const typed = inferType(result.term);
      expect(typed.valid).toBe(true);
      expect(typed.type ? typeToString(typed.type) : null).toBe("string");
    }
  });
});

describe("(show_vars) solver", () => {
  it("returns a description of every binding's name + shape", async () => {
    const parsed = parse("(show_vars)");
    const tools = makeTools();
    const bindings = new Map<string, unknown>([
      ["RESULTS", [{ line: "a" }, { line: "b" }, { line: "c" }]],
      ["_1", "some string"],
      ["_2", 42],
      ["_3", true],
    ]);
    const result = await solve(parsed.term!, tools, bindings);
    expect(result.success).toBe(true);
    const out = result.value as string;
    expect(typeof out).toBe("string");
    // Each binding's name appears.
    expect(out).toContain("RESULTS");
    expect(out).toContain("_1");
    expect(out).toContain("_2");
    expect(out).toContain("_3");
    // Each shape descriptor appears.
    expect(out).toMatch(/Array\(3\)/);
    expect(out).toMatch(/String\(11\)/);
    expect(out).toMatch(/Number/);
    expect(out).toMatch(/Boolean/);
  });

  it("returns a friendly message when there are no bindings", async () => {
    const parsed = parse("(show_vars)");
    const tools = makeTools();
    const result = await solve(parsed.term!, tools, new Map());
    expect(result.success).toBe(true);
    const out = result.value as string;
    expect(out).toMatch(/no bindings|no variables|empty/i);
  });

  it("filters out internal bindings (_sessionDB, _compaction_trace, etc.)", async () => {
    // Internal plumbing names start with `_` and a non-digit char.
    // They MUST NOT surface via show_vars — leaking session DB
    // refs or pre-compaction traces to the LLM exposes private
    // state and clutters the user-visible binding list.
    const parsed = parse("(show_vars)");
    const tools = makeTools();
    const bindings = new Map<string, unknown>([
      ["_sessionDB", { internal: true }],
      ["_compaction_trace", "long history dump"],
      ["RESULTS", [1, 2, 3]],
      ["_1", "turn-1 result"],
      ["_2", 42],
    ]);
    const result = await solve(parsed.term!, tools, bindings);
    expect(result.success).toBe(true);
    const out = result.value as string;
    // User-visible bindings are present.
    expect(out).toContain("RESULTS");
    expect(out).toContain("_1");
    expect(out).toContain("_2");
    // Internal bindings are NOT.
    expect(out).not.toContain("_sessionDB");
    expect(out).not.toContain("_compaction_trace");
    // Count reflects user-visible only.
    expect(out).toMatch(/Bindings \(3\):/);
  });

  it("returns the friendly empty-state message when only internal bindings exist", async () => {
    const parsed = parse("(show_vars)");
    const tools = makeTools();
    const bindings = new Map<string, unknown>([
      ["_sessionDB", { internal: true }],
    ]);
    const result = await solve(parsed.term!, tools, bindings);
    expect(result.success).toBe(true);
    const out = result.value as string;
    expect(out).toMatch(/no bindings/i);
  });
});
