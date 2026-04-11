/**
 * Tests for the chunking primitives:
 *
 *   (chunk_by_size N)   — split the document into chunks of N characters
 *   (chunk_by_lines N)  — split the document into chunks of N lines
 *   (chunk_by_regex "pat") — split the document wherever `pat` matches
 *
 * These are the "slice a huge binding before mapping over it" primitives
 * from the paper-vs-project GAP P2. The canonical use-case is:
 *
 *   (map (chunk_by_lines 100)
 *        (lambda c (llm_query "summarize: {chunk}" (chunk c))))
 *
 * which chunks a large document into 100-line slices and fires a sub-LLM
 * at each slice — the classic OOLONG-Pairs pattern for multi-document
 * summarization applied to a single document that's too big for the
 * context window.
 *
 * Coverage:
 *   1. Parser accepts each form and rejects malformed shapes.
 *   2. Type inference returns `array<string>` for each.
 *   3. Solver produces the expected chunks on a known input.
 *   4. Edge cases: N=0, N>length, empty regex, overlap, trailing remainder.
 *   5. End-to-end composition: chunk → map → lambda.
 */

import { describe, it, expect } from "vitest";
import { parse } from "../../src/logic/lc-parser.js";
import { inferType, typeToString } from "../../src/logic/type-inference.js";
import { solve, type SolverTools, type Bindings } from "../../src/logic/lc-solver.js";

function makeTools(content: string): SolverTools {
  const lines = content.split("\n");
  return {
    context: content,
    lines,
    grep: () => [],
    fuzzy_search: () => [],
    bm25: () => [],
    semantic: () => [],
    text_stats: () => ({
      length: content.length,
      lineCount: lines.length,
      sample: { start: "", middle: "", end: "" },
    }),
  };
}

describe("chunk_by_size parser", () => {
  it("parses (chunk_by_size N)", () => {
    const r = parse("(chunk_by_size 100)");
    expect(r.success).toBe(true);
    expect(r.term?.tag).toBe("chunk_by_size");
    if (r.term?.tag === "chunk_by_size") {
      expect(r.term.size).toBe(100);
    }
  });

  it("rejects (chunk_by_size) with no argument", () => {
    const r = parse("(chunk_by_size)");
    expect(r.success).toBe(false);
  });

  it("rejects (chunk_by_size \"foo\") with non-numeric size", () => {
    const r = parse('(chunk_by_size "foo")');
    expect(r.success).toBe(false);
  });
});

describe("chunk_by_lines parser", () => {
  it("parses (chunk_by_lines N)", () => {
    const r = parse("(chunk_by_lines 50)");
    expect(r.success).toBe(true);
    expect(r.term?.tag).toBe("chunk_by_lines");
    if (r.term?.tag === "chunk_by_lines") {
      expect(r.term.lineCount).toBe(50);
    }
  });

  it("rejects (chunk_by_lines) with no argument", () => {
    const r = parse("(chunk_by_lines)");
    expect(r.success).toBe(false);
  });
});

describe("chunk_by_regex parser", () => {
  it('parses (chunk_by_regex "pattern")', () => {
    const r = parse('(chunk_by_regex "\\n\\n")');
    expect(r.success).toBe(true);
    expect(r.term?.tag).toBe("chunk_by_regex");
    if (r.term?.tag === "chunk_by_regex") {
      expect(r.term.pattern).toBe("\n\n");
    }
  });

  it("rejects (chunk_by_regex 42) with non-string argument", () => {
    const r = parse("(chunk_by_regex 42)");
    expect(r.success).toBe(false);
  });

  it("rejects (chunk_by_regex) with no argument", () => {
    const r = parse("(chunk_by_regex)");
    expect(r.success).toBe(false);
  });
});

describe("chunking type inference", () => {
  it("chunk_by_size infers array<string>", () => {
    const r = parse("(chunk_by_size 100)");
    const t = inferType(r.term!);
    expect(t.valid).toBe(true);
    expect(t.type && typeToString(t.type)).toBe("string[]");
  });

  it("chunk_by_lines infers array<string>", () => {
    const r = parse("(chunk_by_lines 10)");
    const t = inferType(r.term!);
    expect(t.valid).toBe(true);
    expect(t.type && typeToString(t.type)).toBe("string[]");
  });

  it("chunk_by_regex infers array<string>", () => {
    const r = parse('(chunk_by_regex "\\n")');
    const t = inferType(r.term!);
    expect(t.valid).toBe(true);
    expect(t.type && typeToString(t.type)).toBe("string[]");
  });
});

describe("chunk_by_size solver", () => {
  it("splits document into fixed-size chunks", async () => {
    const tools = makeTools("abcdefghij"); // 10 chars
    const parsed = parse("(chunk_by_size 3)");
    const result = await solve(parsed.term!, tools, new Map());
    expect(result.success).toBe(true);
    expect(result.value).toEqual(["abc", "def", "ghi", "j"]);
  });

  it("handles size larger than document length", async () => {
    const tools = makeTools("short");
    const parsed = parse("(chunk_by_size 1000)");
    const result = await solve(parsed.term!, tools, new Map());
    expect(result.success).toBe(true);
    expect(result.value).toEqual(["short"]);
  });

  it("rejects zero or negative size", async () => {
    const tools = makeTools("abc");
    const parsed = parse("(chunk_by_size 0)");
    const result = await solve(parsed.term!, tools, new Map());
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/size/i);
  });

  it("returns empty array for empty document", async () => {
    const tools = makeTools("");
    const parsed = parse("(chunk_by_size 10)");
    const result = await solve(parsed.term!, tools, new Map());
    expect(result.success).toBe(true);
    expect(result.value).toEqual([]);
  });
});

describe("chunk_by_lines solver", () => {
  it("splits document into line-based chunks", async () => {
    const tools = makeTools("line1\nline2\nline3\nline4\nline5");
    const parsed = parse("(chunk_by_lines 2)");
    const result = await solve(parsed.term!, tools, new Map());
    expect(result.success).toBe(true);
    expect(result.value).toEqual(["line1\nline2", "line3\nline4", "line5"]);
  });

  it("handles lineCount larger than document", async () => {
    const tools = makeTools("just\ntwo");
    const parsed = parse("(chunk_by_lines 100)");
    const result = await solve(parsed.term!, tools, new Map());
    expect(result.success).toBe(true);
    expect(result.value).toEqual(["just\ntwo"]);
  });

  it("rejects zero lineCount", async () => {
    const tools = makeTools("a\nb");
    const parsed = parse("(chunk_by_lines 0)");
    const result = await solve(parsed.term!, tools, new Map());
    expect(result.success).toBe(false);
  });
});

describe("chunk_by_regex solver", () => {
  it("splits on blank lines", async () => {
    const tools = makeTools("para one\nline two\n\npara two\nline\n\npara three");
    const parsed = parse('(chunk_by_regex "\\n\\n")');
    const result = await solve(parsed.term!, tools, new Map());
    expect(result.success).toBe(true);
    expect(result.value).toEqual(["para one\nline two", "para two\nline", "para three"]);
  });

  it("returns the whole document as one chunk if pattern does not match", async () => {
    const tools = makeTools("one\ntwo\nthree");
    const parsed = parse('(chunk_by_regex "XXXX")');
    const result = await solve(parsed.term!, tools, new Map());
    expect(result.success).toBe(true);
    expect(result.value).toEqual(["one\ntwo\nthree"]);
  });

  it("filters empty chunks produced by adjacent delimiters", async () => {
    const tools = makeTools("a\n\n\n\nb");
    const parsed = parse('(chunk_by_regex "\\n\\n")');
    const result = await solve(parsed.term!, tools, new Map());
    expect(result.success).toBe(true);
    // Adjacent \n\n pairs produce an empty middle chunk — we drop empties.
    expect(result.value).toEqual(["a", "b"]);
  });

  it("rejects a pattern that fails regex validation", async () => {
    const tools = makeTools("abc");
    // Unbalanced group — should be caught by validateRegex
    const parsed = parse('(chunk_by_regex "(unbalanced")');
    const result = await solve(parsed.term!, tools, new Map());
    expect(result.success).toBe(false);
  });
});

describe("chunking composition — map over chunks", () => {
  it("(map (chunk_by_lines N) (lambda c ...)) works with nested llm_query", async () => {
    // The canonical OOLONG pattern at document-chunk granularity:
    // chunk document into 2-line slices, fire sub-LLM per chunk.
    const calls: string[] = [];
    const tools: SolverTools = {
      ...makeTools("A1\nA2\nB1\nB2\nC1"),
      llmQuery: async (prompt: string) => {
        calls.push(prompt);
        return `summary-${calls.length}`;
      },
    };
    const parsed = parse(
      '(map (chunk_by_lines 2) (lambda c (llm_query "summarize: {chunk}" (chunk c))))'
    );
    expect(parsed.success).toBe(true);
    const result = await solve(parsed.term!, tools, new Map());
    expect(result.success).toBe(true);
    expect(result.value).toEqual(["summary-1", "summary-2", "summary-3"]);
    expect(calls).toHaveLength(3);
    expect(calls[0]).toContain("A1\nA2");
    expect(calls[1]).toContain("B1\nB2");
    expect(calls[2]).toContain("C1");
  });

  it("(count (chunk_by_size 10)) counts the produced chunks", async () => {
    const tools = makeTools("a".repeat(95));
    const parsed = parse("(count (chunk_by_size 10))");
    const result = await solve(parsed.term!, tools, new Map());
    expect(result.success).toBe(true);
    // 95 chars / 10 = 9 full + 1 short = 10 chunks
    expect(result.value).toBe(10);
  });
});
