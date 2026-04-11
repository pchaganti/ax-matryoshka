/**
 * Tests for (rerank ...) Nucleus integration
 */

import { describe, it, expect } from "vitest";
import { parse, prettyPrint } from "../../src/logic/lc-parser.js";
import { solve, type SolverTools, type Bindings } from "../../src/logic/lc-solver.js";
import { inferType } from "../../src/logic/type-inference.js";
import { QValueStore } from "../../src/logic/qvalue.js";

function createMockTools(context: string): SolverTools {
  const lines = context.split("\n");
  return {
    context,
    lines,
    grep: (pattern: string) => {
      const regex = new RegExp(pattern, "gi");
      const results: Array<{ match: string; line: string; lineNum: number; index: number; groups: string[] }> = [];
      let match;
      while ((match = regex.exec(context)) !== null) {
        const beforeMatch = context.slice(0, match.index);
        const lineNum = (beforeMatch.match(/\n/g) || []).length + 1;
        results.push({ match: match[0], line: lines[lineNum - 1] || "", lineNum, index: match.index, groups: match.slice(1) });
      }
      return results;
    },
    fuzzy_search: (query: string, limit = 10) =>
      lines.map((line, idx) => ({ line, lineNum: idx + 1, score: line.toLowerCase().includes(query.toLowerCase()) ? 100 : 0 })).filter(r => r.score > 0).slice(0, limit),
    bm25: (query: string, limit = 10) => {
      const terms = query.toLowerCase().split(/\s+/);
      return lines.map((line, idx) => ({ line, lineNum: idx + 1, score: terms.reduce((s, t) => s + (line.toLowerCase().includes(t) ? 10 : 0), 0) })).filter(r => r.score > 0).sort((a, b) => b.score - a.score).slice(0, limit);
    },
    semantic: (_query: string, _limit = 10) => [] as Array<{ line: string; lineNum: number; score: number }>,
    text_stats: () => ({ length: context.length, lineCount: lines.length, sample: { start: "", middle: "", end: "" } }),
  };
}

const testContext = `[10:00] INFO: System started
[10:01] ERROR: Failed to connect to database
[10:02] INFO: Retry scheduled
[10:03] ERROR: Connection timeout
[10:04] INFO: Connection established`;

describe("rerank Parser", () => {
  it("should parse rerank with collection", () => {
    const result = parse('(rerank (bm25 "error"))');
    expect(result.success).toBe(true);
    expect(result.term?.tag).toBe("rerank");
    if (result.term?.tag === "rerank") {
      expect(result.term.collection.tag).toBe("bm25");
    }
  });

  it("should parse rerank with variable", () => {
    const result = parse("(rerank RESULTS)");
    expect(result.success).toBe(true);
    if (result.term?.tag === "rerank") {
      expect(result.term.collection.tag).toBe("var");
    }
  });

  it("should fail on empty rerank", () => {
    expect(parse("(rerank)").success).toBe(false);
  });
});

describe("rerank prettyPrint", () => {
  it("should round-trip", () => {
    const result = parse('(rerank (bm25 "error"))');
    expect(result.success).toBe(true);
    expect(prettyPrint(result.term!)).toBe('(rerank (bm25 "error"))');
  });
});

describe("rerank Type Inference", () => {
  it("should infer array type", () => {
    const result = parse('(rerank (bm25 "error"))');
    expect(result.success).toBe(true);
    const typeResult = inferType(result.term!);
    expect(typeResult.valid).toBe(true);
    expect(typeResult.type?.tag).toBe("array");
  });
});

describe("rerank Solver", () => {
  it("should rerank bm25 results", () => {
    const tools = createMockTools(testContext);
    const bindings: Bindings = new Map();
    bindings.set("_qstore", new QValueStore());

    const result = parse('(rerank (bm25 "error connection"))');
    expect(result.success).toBe(true);
    const solveResult = solve(result.term!, tools, bindings);
    expect(solveResult.success).toBe(true);
    expect(Array.isArray(solveResult.value)).toBe(true);
    const results = solveResult.value as Array<{ line: string; score: number }>;
    expect(results.length).toBeGreaterThan(0);
    // Should be sorted by score
    for (let i = 1; i < results.length; i++) {
      expect(results[i - 1].score).toBeGreaterThanOrEqual(results[i].score);
    }
  });

  it("should work without explicit QValueStore (creates one)", () => {
    const tools = createMockTools(testContext);
    const result = parse('(rerank (bm25 "error"))');
    expect(result.success).toBe(true);
    const solveResult = solve(result.term!, tools);
    expect(solveResult.success).toBe(true);
    expect(Array.isArray(solveResult.value)).toBe(true);
  });

  it("should compose with filter", () => {
    const tools = createMockTools(testContext);
    const bindings: Bindings = new Map();

    const rerankParse = parse('(rerank (bm25 "error"))');
    const rerankResult = solve(rerankParse.term!, tools);
    expect(rerankResult.success).toBe(true);
    bindings.set("RESULTS", rerankResult.value);

    const filterParse = parse('(filter RESULTS (lambda x (match x "timeout" 0)))');
    const filterResult = solve(filterParse.term!, tools, bindings);
    expect(filterResult.success).toBe(true);
  });

  it("should auto-reward previous RESULTS lines", () => {
    const tools = createMockTools(testContext);
    const bindings: Bindings = new Map();

    const bm25Parse = parse('(bm25 "error")');
    const bm25Result = solve(bm25Parse.term!, tools, bindings);
    bindings.set("RESULTS", bm25Result.value);

    const rerankParse = parse('(rerank (bm25 "error connection"))');
    expect(rerankParse.success).toBe(true);
    const rerankResult = solve(rerankParse.term!, tools, bindings);
    expect(rerankResult.success).toBe(true);

    const reranked = rerankResult.value as Array<{ lineNum: number }>;
    expect(reranked.length).toBeGreaterThan(0);
  });

  it("should compose with fuse then rerank", () => {
    const tools = createMockTools(testContext);
    const result = parse('(rerank (fuse (grep "ERROR") (bm25 "error")))');
    expect(result.success).toBe(true);
    const solveResult = solve(result.term!, tools);
    expect(solveResult.success).toBe(true);
    expect(Array.isArray(solveResult.value)).toBe(true);
  });
});
