/**
 * Tests for the `(calibrate)` marker on `(llm_batch …)` — the third
 * OOLONG improvement.
 *
 * The gap: even though `llm_batch` sends all N prompts in a single
 * suspension (the model CAN scan the distribution before committing
 * to any rating), nothing in the contract tells it to. Without an
 * explicit calibration directive, models treat each prompt as an
 * independent judgment and drift toward the first item's scale. The
 * `(calibrate)` marker flips that: the solver forwards a flag to the
 * batch bridge, which prepends a short directive to the suspension
 * request instructing the model to scan all prompts first and
 * establish a consistent scale before writing any answer.
 *
 * Scope of v1: PLUMBING ONLY. The real behavioral payoff is a
 * prompting effect that only a live LLM can demonstrate. What we
 * verify here is that
 *   1. the parser recognizes `(calibrate)` on both llm_query and
 *      llm_batch,
 *   2. the solver passes the flag to `tools.llmBatch` via an options
 *      argument, and
 *   3. the flag is false / undefined by default (additive change —
 *      existing call sites are unaffected).
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

describe("calibrate parser", () => {
  it("recognizes (calibrate) on llm_query", () => {
    const result = parse('(llm_query "prompt" (calibrate))');
    expect(result.success).toBe(true);
    if (result.term?.tag === "llm_query") {
      expect(result.term.calibrate).toBe(true);
    }
  });

  it("recognizes (calibrate) on llm_batch, lifted from the inner llm_query", () => {
    const result = parse(
      '(llm_batch RESULTS (lambda x (llm_query "Rate: {item}" (item x) (calibrate))))'
    );
    expect(result.success).toBe(true);
    if (result.term?.tag === "llm_batch") {
      expect(result.term.calibrate).toBe(true);
    }
  });

  it("parses (calibrate) alongside bindings and (one_of ...)", () => {
    const result = parse(
      '(llm_batch RESULTS ' +
        '(lambda x (llm_query "Rate: {item}" (item x) (one_of "low" "high") (calibrate))))'
    );
    expect(result.success).toBe(true);
    if (result.term?.tag === "llm_batch") {
      expect(result.term.calibrate).toBe(true);
      expect(result.term.oneOf).toEqual(["low", "high"]);
      expect(result.term.bindings).toHaveLength(1);
    }
  });

  it("rejects (calibrate) with any arguments", () => {
    // `(calibrate)` is a bare marker — `(calibrate true)` is not
    // supported because the explicit off-state (no marker) is
    // already the default, so there's no need to spell it out.
    const result = parse('(llm_query "prompt" (calibrate true))');
    expect(result.success).toBe(false);
  });

  it("defaults to no calibration when the marker is absent", () => {
    const result = parse(
      '(llm_batch RESULTS (lambda x (llm_query "Rate: {item}" (item x))))'
    );
    expect(result.success).toBe(true);
    if (result.term?.tag === "llm_batch") {
      expect(result.term.calibrate).toBeFalsy();
    }
  });
});

describe("calibrate solver — llm_batch", () => {
  it("passes { calibrate: true } to tools.llmBatch as the options arg", async () => {
    let seenOptions: unknown = "unset";
    const tools = makeTools({
      llmBatch: async (prompts, options) => {
        seenOptions = options;
        return prompts.map(() => "ok");
      },
    });

    const parsed = parse(
      '(llm_batch RESULTS (lambda x (llm_query "Rate: {item}" (item x) (calibrate))))'
    );
    const bindings: Bindings = new Map();
    bindings.set("RESULTS", [{ line: "a" }, { line: "b" }]);

    const result = await solve(parsed.term!, tools, bindings);
    expect(result.success).toBe(true);
    expect(seenOptions).toEqual({ calibrate: true });
  });

  it("passes no calibrate flag (or false) when the marker is absent", async () => {
    let seenOptions: unknown = "unset";
    const tools = makeTools({
      llmBatch: async (prompts, options) => {
        seenOptions = options;
        return prompts.map(() => "ok");
      },
    });

    const parsed = parse(
      '(llm_batch RESULTS (lambda x (llm_query "Rate: {item}" (item x))))'
    );
    const bindings: Bindings = new Map();
    bindings.set("RESULTS", [{ line: "a" }, { line: "b" }]);

    await solve(parsed.term!, tools, bindings);
    // Either undefined or { calibrate: false } is acceptable — but
    // NOT { calibrate: true } when the marker is absent.
    expect(
      seenOptions === undefined ||
        (typeof seenOptions === "object" &&
          seenOptions !== null &&
          (seenOptions as { calibrate?: boolean }).calibrate !== true)
    ).toBe(true);
  });

  it("still canonicalizes responses against (one_of …) when calibrating", async () => {
    // Calibration is orthogonal to validation — the combination
    // must work without either feature stepping on the other.
    const tools = makeTools({
      llmBatch: async (prompts) => prompts.map(() => "LOW"),
    });
    const parsed = parse(
      '(llm_batch RESULTS (lambda x ' +
        '(llm_query "Rate: {item}" (item x) (one_of "low" "high") (calibrate))))'
    );
    const bindings: Bindings = new Map();
    bindings.set("RESULTS", [{ line: "a" }, { line: "b" }]);
    const result = await solve(parsed.term!, tools, bindings);
    expect(result.success).toBe(true);
    expect(result.value).toEqual(["low", "low"]);
  });
});

describe("calibrate MCP suspension preamble content", () => {
  it("produces a directive that names the N count and instructs scale-setting", async () => {
    // End-to-end: when calibrate is set, a bridge that mimics what
    // the MCP server does (prepending a preamble to the batch
    // request text) should see the options flag and can render a
    // directive that includes the item count and explicit
    // calibration language.
    let renderedPreamble = "";
    const tools = makeTools({
      llmBatch: async (prompts, options) => {
        if (options?.calibrate) {
          renderedPreamble =
            `CALIBRATION: Before answering, scan all ${prompts.length} ` +
            `prompts below and establish a consistent scale. Then answer each in order.\n`;
        }
        return prompts.map(() => "low");
      },
    });

    const parsed = parse(
      '(llm_batch RESULTS (lambda x ' +
        '(llm_query "Rate: {item}" (item x) (one_of "low" "high") (calibrate))))'
    );
    const bindings: Bindings = new Map();
    bindings.set("RESULTS", Array.from({ length: 7 }, (_, i) => ({ line: `i${i}` })));
    await solve(parsed.term!, tools, bindings);

    // The bridge saw `calibrate: true` and could generate a
    // preamble that mentions the batch size and the scale-setting
    // instruction — exactly what the MCP server's batch suspension
    // request needs to contain.
    expect(renderedPreamble).toContain("CALIBRATION");
    expect(renderedPreamble).toContain("7");
    expect(renderedPreamble.toLowerCase()).toContain("scale");
  });
});
