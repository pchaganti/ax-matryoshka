/**
 * Tests for the `(rlm_query …)` LC primitive — Phase 1 of the
 * recursive-Nucleus port (matryoshka-178).
 *
 * Surface:
 *   (rlm_query "prompt")
 *   (rlm_query "prompt" (context EXPR))
 *
 * Semantics:
 *   - The LLM emits this term to spawn a CHILD Nucleus FSM session.
 *   - The child's working document is derived from `(context EXPR)`:
 *     EXPR is evaluated against current bindings; if it's an array,
 *     each element is stringified and joined by newlines (clean
 *     line-oriented input); if it's a string, used as-is.
 *   - The child runs to completion, returns its FINAL string. That
 *     string becomes the bound value of this term in the parent.
 *
 * Coverage (this file — parser + types only; solver tests in a
 * follow-up):
 *   1. Parser accepts `(rlm_query "p")` (no context).
 *   2. Parser accepts `(rlm_query "p" (context EXPR))`.
 *   3. Parser rejects malformed shapes (non-string prompt, unknown
 *      trailing form, multiple `(context …)`).
 *   4. Type inference returns `string`.
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

describe("rlm_query parser", () => {
  it("parses the no-context form", () => {
    const result = parse('(rlm_query "summarize this section")');
    expect(result.success).toBe(true);
    expect(result.term?.tag).toBe("rlm_query");
    if (result.term?.tag === "rlm_query") {
      expect(result.term.prompt).toBe("summarize this section");
      expect(result.term.context).toBeUndefined();
    }
  });

  it("parses (context EXPR) where EXPR is a variable", () => {
    const result = parse('(rlm_query "find errors" (context RESULTS))');
    expect(result.success).toBe(true);
    if (result.term?.tag === "rlm_query") {
      expect(result.term.prompt).toBe("find errors");
      expect(result.term.context).toBeDefined();
      expect(result.term.context?.tag).toBe("var");
    }
  });

  it("parses (context EXPR) where EXPR is itself a Nucleus term", () => {
    // A real-world use: pass a freshly-greppped result handle as the
    // child's working document without first binding it.
    const result = parse(
      '(rlm_query "extract" (context (grep "^FACT-")))'
    );
    expect(result.success).toBe(true);
    if (result.term?.tag === "rlm_query") {
      expect(result.term.context?.tag).toBe("grep");
    }
  });

  it("rejects a non-string prompt", () => {
    const result = parse("(rlm_query 42)");
    expect(result.success).toBe(false);
  });

  it("rejects an unknown trailing form", () => {
    const result = parse('(rlm_query "p" (whatever 1))');
    expect(result.success).toBe(false);
  });

  it("rejects duplicate (context …) forms", () => {
    const result = parse(
      '(rlm_query "p" (context RESULTS) (context _1))'
    );
    expect(result.success).toBe(false);
  });

  it("rejects (context …) with no argument", () => {
    const result = parse('(rlm_query "p" (context))');
    expect(result.success).toBe(false);
  });
});

describe("rlm_query type inference", () => {
  it("returns string for the no-context form", () => {
    const result = parse('(rlm_query "p")');
    expect(result.success).toBe(true);
    if (result.term) {
      const typed = inferType(result.term);
      expect(typed.valid).toBe(true);
      expect(typed.type ? typeToString(typed.type) : null).toBe("string");
    }
  });

  it("returns string for the with-context form", () => {
    const result = parse('(rlm_query "p" (context RESULTS))');
    expect(result.success).toBe(true);
    if (result.term) {
      const typed = inferType(result.term);
      expect(typed.valid).toBe(true);
      expect(typed.type ? typeToString(typed.type) : null).toBe("string");
    }
  });
});

describe("rlm_query solver dispatch", () => {
  it("returns a clear error when tools.rlmQuery is not configured", async () => {
    const parsed = parse('(rlm_query "summarize")');
    expect(parsed.success).toBe(true);
    const tools = makeTools(); // no rlmQuery
    const result = await solve(parsed.term!, tools, new Map());
    expect(result.success).toBe(false);
    expect(result.error ?? "").toMatch(/rlm_query/i);
  });

  it("dispatches the no-context form with prompt and null context", async () => {
    const parsed = parse('(rlm_query "summarize")');
    let receivedPrompt: string | null = null;
    let receivedContext: string | null = "<unset>";
    const tools = makeTools({
      rlmQuery: async (prompt: string, contextDoc: string | null) => {
        receivedPrompt = prompt;
        receivedContext = contextDoc;
        return "child returned this";
      },
    });
    const result = await solve(parsed.term!, tools, new Map());
    expect(result.success).toBe(true);
    expect(receivedPrompt).toBe("summarize");
    expect(receivedContext).toBeNull();
    expect(result.value).toBe("child returned this");
  });

  it("materializes a string-binding context as-is", async () => {
    const parsed = parse('(rlm_query "find errors" (context RESULTS))');
    let receivedContext: string | null = null;
    const tools = makeTools({
      rlmQuery: async (_p, c) => {
        receivedContext = c;
        return "ok";
      },
    });
    const bindings: Bindings = new Map([
      ["RESULTS", "line one\nline two\nline three"],
    ]);
    const result = await solve(parsed.term!, tools, bindings);
    expect(result.success).toBe(true);
    expect(receivedContext).toBe("line one\nline two\nline three");
  });

  it("materializes an array-binding context as one stringified item per line", async () => {
    // Per Phase 1's core design: a structured handle (e.g. an array
    // of grep result objects) becomes a clean line-oriented document
    // for the child, NOT a JSON-stringified blob. This is the
    // failure mode scenario B locks in.
    const parsed = parse('(rlm_query "count" (context RESULTS))');
    let receivedContext: string | null = null;
    const tools = makeTools({
      rlmQuery: async (_p, c) => {
        receivedContext = c;
        return "ok";
      },
    });
    const bindings: Bindings = new Map([
      [
        "RESULTS",
        [
          { line: "AUTH: alpha", lineNum: 1 },
          { line: "DB: beta", lineNum: 2 },
          { line: "AUTH: gamma", lineNum: 3 },
        ],
      ],
    ]);
    const result = await solve(parsed.term!, tools, bindings);
    expect(result.success).toBe(true);

    // The materialized context must be split across newlines and each
    // line must be reachable by a `^anchor` regex — the failure mode
    // we're fixing.
    expect(typeof receivedContext).toBe("string");
    const lines = (receivedContext as unknown as string).split("\n");
    expect(lines).toHaveLength(3);
    const authLines = lines.filter((l) => /^AUTH:/.test(l));
    expect(authLines).toHaveLength(2);
  });

  it("evaluates a non-variable context expression and materializes the result", async () => {
    const parsed = parse('(rlm_query "extract" (context (grep "FACT-")))');
    let receivedContext: string | null = null;
    const tools = makeTools({
      grep: () => [
        { match: "FACT-1", line: "FACT-1: one", lineNum: 1, index: 0, groups: [] },
        { match: "FACT-2", line: "FACT-2: two", lineNum: 2, index: 12, groups: [] },
      ],
      rlmQuery: async (_p, c) => {
        receivedContext = c;
        return "ok";
      },
    });
    const result = await solve(parsed.term!, tools, new Map());
    expect(result.success).toBe(true);
    expect(typeof receivedContext).toBe("string");
    const lines = (receivedContext as unknown as string).split("\n");
    expect(lines).toHaveLength(2);
  });

  it("propagates errors thrown by tools.rlmQuery as a solver error", async () => {
    const parsed = parse('(rlm_query "summarize")');
    const tools = makeTools({
      rlmQuery: async () => {
        throw new Error("child session failed");
      },
    });
    const result = await solve(parsed.term!, tools, new Map());
    expect(result.success).toBe(false);
    expect(result.error ?? "").toMatch(/child session failed/);
  });

  it("preserves an explicit empty array context (passes empty doc, not the prompt)", async () => {
    // Bug fix: an explicit `(context EMPTY)` MUST reach the child as
    // an empty document. Conflating it with the no-context shape (no
    // `(context …)` form at all) silently masks "I expected results
    // but got none" bugs. The contract: solver hands `""` to the
    // rlmQuery callback when the user passed an empty binding;
    // hands `null` only when the user omitted `(context …)`.
    const parsed = parse('(rlm_query "count" (context RESULTS))');
    let receivedContext: string | null | undefined = "<unset>";
    const tools = makeTools({
      rlmQuery: async (_p, c) => {
        receivedContext = c;
        return "0";
      },
    });
    const bindings: Bindings = new Map([["RESULTS", []]]);
    const result = await solve(parsed.term!, tools, bindings);
    expect(result.success).toBe(true);
    // Empty array → materialized to "", NOT null. The spawner can
    // then decide to honor the user's explicit empty context vs.
    // falling back to prompt-as-doc.
    expect(receivedContext).toBe("");
  });

  it("surfaces an undefined-variable context as a solver error", async () => {
    // Referencing a binding that hasn't been set should fail with a
    // clear error, not silently produce a null/empty context that
    // the child operates on as if everything were fine.
    const parsed = parse('(rlm_query "p" (context UNDEFINED))');
    const tools = makeTools({
      rlmQuery: async () => "should not reach",
    });
    const result = await solve(parsed.term!, tools, new Map());
    expect(result.success).toBe(false);
    expect(result.error ?? "").toMatch(/UNDEFINED|unbound|undefined/i);
  });
});
