/**
 * Tests for BM25 Nucleus integration
 * Covers: parser, solver, type inference, prettyPrint
 */

import { describe, it, expect } from "vitest";
import { parse, prettyPrint } from "../../src/logic/lc-parser.js";
import { solve, type SolverTools, type Bindings } from "../../src/logic/lc-solver.js";
import { inferType } from "../../src/logic/type-inference.js";

// Mock tools that include bm25
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
        results.push({
          match: match[0],
          line: lines[lineNum - 1] || "",
          lineNum,
          index: match.index,
          groups: match.slice(1),
        });
      }
      return results;
    },
    fuzzy_search: (query: string, limit = 10) => {
      return lines
        .map((line, idx) => ({
          line,
          lineNum: idx + 1,
          score: line.toLowerCase().includes(query.toLowerCase()) ? 100 : 0,
        }))
        .filter(r => r.score > 0)
        .slice(0, limit);
    },
    bm25: (query: string, limit = 10) => {
      // Simple mock: lines containing query terms get scored
      const queryTerms = query.toLowerCase().split(/\s+/);
      return lines
        .map((line, idx) => {
          const lower = line.toLowerCase();
          const score = queryTerms.reduce((s, t) => s + (lower.includes(t) ? 10 : 0), 0);
          return { line, lineNum: idx + 1, score };
        })
        .filter(r => r.score > 0)
        .sort((a, b) => b.score - a.score)
        .slice(0, limit);
    },
    semantic: (_query: string, _limit = 10) => [],
    text_stats: () => ({
      length: context.length,
      lineCount: lines.length,
      sample: { start: "", middle: "", end: "" },
    }),
  };
}

const testContext = `[10:00] INFO: System started
[10:01] ERROR: Failed to connect to database
[10:02] INFO: Retry scheduled
[10:03] ERROR: Connection timeout
[10:04] INFO: Connection established`;

describe("BM25 Parser", () => {
  it("should parse bm25 with query", () => {
    const result = parse('(bm25 "database error")');
    expect(result.success).toBe(true);
    expect(result.term?.tag).toBe("bm25");
    if (result.term?.tag === "bm25") {
      expect(result.term.query).toBe("database error");
      expect(result.term.limit).toBeUndefined();
    }
  });

  it("should parse bm25 with query and limit", () => {
    const result = parse('(bm25 "database error" 20)');
    expect(result.success).toBe(true);
    expect(result.term?.tag).toBe("bm25");
    if (result.term?.tag === "bm25") {
      expect(result.term.query).toBe("database error");
      expect(result.term.limit).toBe(20);
    }
  });

  it("should fail on non-string query", () => {
    const result = parse("(bm25 42)");
    expect(result.success).toBe(false);
  });

  it("should fail on empty bm25", () => {
    const result = parse("(bm25)");
    expect(result.success).toBe(false);
  });
});

describe("BM25 prettyPrint", () => {
  it("should round-trip bm25 without limit", () => {
    const result = parse('(bm25 "database error")');
    expect(result.success).toBe(true);
    const printed = prettyPrint(result.term!);
    expect(printed).toBe('(bm25 "database error")');
  });

  it("should round-trip bm25 with limit", () => {
    const result = parse('(bm25 "database error" 20)');
    expect(result.success).toBe(true);
    const printed = prettyPrint(result.term!);
    expect(printed).toBe('(bm25 "database error" 20)');
  });
});

describe("BM25 Type Inference", () => {
  it("should infer array type for bm25", () => {
    const result = parse('(bm25 "query")');
    expect(result.success).toBe(true);
    const typeResult = inferType(result.term!);
    expect(typeResult.valid).toBe(true);
    expect(typeResult.type?.tag).toBe("array");
  });
});

describe("BM25 Solver", () => {
  it("should execute bm25 search and return results", () => {
    const tools = createMockTools(testContext);
    const result = parse('(bm25 "error database")');
    expect(result.success).toBe(true);

    const solveResult = solve(result.term!, tools);
    expect(solveResult.success).toBe(true);
    expect(Array.isArray(solveResult.value)).toBe(true);
    const results = solveResult.value as Array<{ line: string; lineNum: number; score: number }>;
    expect(results.length).toBeGreaterThan(0);
  });

  it("should respect limit in bm25 search", () => {
    const tools = createMockTools(testContext);
    const result = parse('(bm25 "error" 1)');
    expect(result.success).toBe(true);

    const solveResult = solve(result.term!, tools);
    expect(solveResult.success).toBe(true);
    const results = solveResult.value as Array<{ line: string }>;
    expect(results.length).toBeLessThanOrEqual(1);
  });

  it("should work with filter on bm25 results", () => {
    const tools = createMockTools(testContext);
    const bindings: Bindings = new Map();

    // First: run bm25
    const bm25Result = parse('(bm25 "error connection")');
    expect(bm25Result.success).toBe(true);
    const bm25SolveResult = solve(bm25Result.term!, tools);
    expect(bm25SolveResult.success).toBe(true);
    bindings.set("RESULTS", bm25SolveResult.value);

    // Then: filter RESULTS
    const filterResult = parse('(filter RESULTS (lambda line (match line "timeout" 0)))');
    expect(filterResult.success).toBe(true);
    const filterSolveResult = solve(filterResult.term!, tools, bindings);
    expect(filterSolveResult.success).toBe(true);
  });

  it("should use default limit when none provided", () => {
    const tools = createMockTools(testContext);
    const result = parse('(bm25 "error")');
    expect(result.success).toBe(true);
    const solveResult = solve(result.term!, tools);
    expect(solveResult.success).toBe(true);
    // Default limit is 10, so all matching lines should appear
    const results = solveResult.value as Array<{ line: string }>;
    expect(results.length).toBeGreaterThan(0);
  });
});
