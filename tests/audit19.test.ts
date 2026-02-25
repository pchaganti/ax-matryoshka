/**
 * Audit #19 Tests — TDD: Write failing tests, then fix
 */
import { describe, it, expect } from "vitest";

// === Issue #1: exprToCode regex literal injection ===
describe("Audit19 #1: exprToCode regex literal escaping", () => {
  it("should handle pattern with trailing backslash safely", async () => {
    const { exprToCode } = await import("../src/synthesis/relational/interpreter.js");
    const expr: any = {
      type: "match",
      str: { type: "var", name: "input" },
      pattern: "test\\",  // Trailing backslash could escape the closing /
      group: 0,
    };
    const code = exprToCode(expr);
    // Should produce valid JS — no syntax error
    expect(() => new Function("input", `return ${code}`)).not.toThrow();
  });

  it("should handle replace pattern with trailing backslash safely", async () => {
    const { exprToCode } = await import("../src/synthesis/relational/interpreter.js");
    const expr: any = {
      type: "replace",
      str: { type: "var", name: "input" },
      pattern: "test\\",
      replacement: "x",
    };
    const code = exprToCode(expr);
    expect(() => new Function("input", `return ${code}`)).not.toThrow();
  });

  it("should handle pattern with backslash before forward slash", async () => {
    const { exprToCode } = await import("../src/synthesis/relational/interpreter.js");
    const expr: any = {
      type: "match",
      str: { type: "var", name: "input" },
      pattern: "a\\/b",  // Backslash + forward slash
      group: 0,
    };
    const code = exprToCode(expr);
    expect(() => new Function("input", `return ${code}`)).not.toThrow();
  });
});

// === Issue #2: parseDate natural language missing day validation ===
describe("Audit19 #2: parseDate natural language day validation", () => {
  it("should reject February 31 in Month Day Year format", async () => {
    const { solve } = await import("../src/logic/lc-solver.js");
    const tools: any = {
      grep: () => [],
      fuzzy_search: () => [],
      text_stats: () => ({ length: 0, lineCount: 0, sample: { start: "", middle: "", end: "" } }),
      context: "",
    };
    const term: any = {
      tag: "parseDate",
      str: { tag: "lit", value: "February 31, 2024" },
    };
    const result = solve(term, tools);
    expect(result.success).toBe(true);
    expect(result.value).toBe(null);  // Invalid date should return null
  });

  it("should reject 31 February in Day Month Year format", async () => {
    const { solve } = await import("../src/logic/lc-solver.js");
    const tools: any = {
      grep: () => [],
      fuzzy_search: () => [],
      text_stats: () => ({ length: 0, lineCount: 0, sample: { start: "", middle: "", end: "" } }),
      context: "",
    };
    const term: any = {
      tag: "parseDate",
      str: { tag: "lit", value: "31 February 2024" },
    };
    const result = solve(term, tools);
    expect(result.success).toBe(true);
    expect(result.value).toBe(null);
  });

  it("should reject April 31 in natural language", async () => {
    const { solve } = await import("../src/logic/lc-solver.js");
    const tools: any = {
      grep: () => [],
      fuzzy_search: () => [],
      text_stats: () => ({ length: 0, lineCount: 0, sample: { start: "", middle: "", end: "" } }),
      context: "",
    };
    const term: any = {
      tag: "parseDate",
      str: { tag: "lit", value: "April 31, 2024" },
    };
    const result = solve(term, tools);
    expect(result.success).toBe(true);
    expect(result.value).toBe(null);
  });

  it("should accept valid natural language dates", async () => {
    const { solve } = await import("../src/logic/lc-solver.js");
    const tools: any = {
      grep: () => [],
      fuzzy_search: () => [],
      text_stats: () => ({ length: 0, lineCount: 0, sample: { start: "", middle: "", end: "" } }),
      context: "",
    };
    const term: any = {
      tag: "parseDate",
      str: { tag: "lit", value: "January 15, 2024" },
    };
    const result = solve(term, tools);
    expect(result.success).toBe(true);
    expect(result.value).toBe("2024-01-15");
  });
});

// === Issue #3: classify empty string filter divergence ===
describe("Audit19 #3: lc-solver classify empty string filter", () => {
  it("should filter empty strings from trueExamples in solver", async () => {
    const { solve } = await import("../src/logic/lc-solver.js");
    const tools: any = {
      grep: () => [],
      fuzzy_search: () => [],
      text_stats: () => ({ length: 0, lineCount: 0, sample: { start: "", middle: "", end: "" } }),
      context: "",
    };
    const term: any = {
      tag: "classify",
      examples: [
        { input: "", output: true },      // Empty string - should be filtered
        { input: "error", output: true },
        { input: "ok", output: false },
      ],
    };
    const result = solve(term, tools);
    expect(result.success).toBe(true);
    // The classifier should be a function
    const classifyFn = result.value;
    if (typeof classifyFn === "function") {
      // "all good here" should NOT match — empty string filter prevents universal match
      expect(classifyFn("all good here")).toBe(false);
    }
  });
});

// === Issue #4: KnowledgeBase index corruption on re-add ===
describe("Audit19 #4: KnowledgeBase re-add index cleanup", () => {
  it("should clean old type index when re-adding with different type", async () => {
    const { KnowledgeBase } = await import("../src/synthesis/knowledge-base.js");
    const kb = new KnowledgeBase();

    const component: any = {
      id: "comp1",
      type: "regex",
      name: "test",
      description: "test component",
      pattern: "\\d+",
      positiveExamples: ["123"],
      negativeExamples: [],
      usageCount: 0,
      successCount: 0,
      lastUsed: new Date(),
      composableWith: [],
    };

    kb.add(component);
    expect(kb.getByType("regex").length).toBe(1);

    // Re-add with different type
    const updated = { ...component, type: "extractor" as const };
    kb.add(updated);

    // Old type index should be cleaned
    expect(kb.getByType("regex").length).toBe(0);
    expect(kb.getByType("extractor").length).toBe(1);
  });

  it("should clean old pattern index when re-adding with different examples", async () => {
    const { KnowledgeBase } = await import("../src/synthesis/knowledge-base.js");
    const kb = new KnowledgeBase();

    const component: any = {
      id: "comp2",
      type: "regex",
      name: "test",
      description: "test",
      pattern: "\\d+",
      positiveExamples: ["123"],
      negativeExamples: [],
      usageCount: 0,
      successCount: 0,
      lastUsed: new Date(),
      composableWith: [],
    };

    kb.add(component);

    // Re-add with different examples (changes signature)
    const updated = { ...component, positiveExamples: ["abc", "def", "ghijklmnop"] };
    kb.add(updated);

    // Should not have stale entries — total components should still be 1
    expect(kb.size()).toBe(1);
  });
});

// === Issue #5: getValueType misleading for functions/bigints ===
describe("Audit19 #5: getValueType for non-standard types", () => {
  it("should report 'function' type instead of 'undefined'", async () => {
    const { verifyResult } = await import("../src/constraints/verifier.js");
    const result = verifyResult(() => {}, {
      output: { type: "string" },
    });
    expect(result.valid).toBe(false);
    // Error message should say "function", not "undefined"
    expect(result.errors[0]).toContain("function");
    expect(result.errors[0]).not.toContain("undefined");
  });

  it("should report 'bigint' type instead of 'undefined'", async () => {
    const { verifyResult } = await import("../src/constraints/verifier.js");
    const result = verifyResult(BigInt(42), {
      output: { type: "number" },
    });
    expect(result.valid).toBe(false);
    expect(result.errors[0]).toContain("bigint");
    expect(result.errors[0]).not.toContain("undefined");
  });
});

// === Issue #6: match() group index validation ===
describe("Audit19 #6: match group index bounds", () => {
  it("should return null for out-of-bounds group index", async () => {
    const { solve } = await import("../src/logic/lc-solver.js");
    const tools: any = {
      grep: () => [],
      fuzzy_search: () => [],
      text_stats: () => ({ length: 0, lineCount: 0, sample: { start: "", middle: "", end: "" } }),
      context: "",
    };
    // Pattern has 1 capture group, but group index is 5
    const term: any = {
      tag: "match",
      str: { tag: "lit", value: "price: 42" },
      pattern: "(\\d+)",
      group: 5,
    };
    const result = solve(term, tools);
    expect(result.success).toBe(true);
    expect(result.value).toBe(null);
  });
});

// === Issue #7: tokenize drops single-char preserved tokens ===
describe("Audit19 #7: tokenize preserves currency symbols", () => {
  it("should not drop $ token despite being single-char", async () => {
    const { tokenize } = await import("../src/rag/similarity.js");
    const tokens = tokenize("$ price");
    // $ is explicitly preserved by the regex but filtered by length > 1
    expect(tokens).toContain("$");
  });

  it("should still filter other single-char tokens", async () => {
    const { tokenize } = await import("../src/rag/similarity.js");
    const tokens = tokenize("a b c word");
    expect(tokens).not.toContain("a");
    expect(tokens).not.toContain("b");
    expect(tokens).toContain("word");
  });
});
