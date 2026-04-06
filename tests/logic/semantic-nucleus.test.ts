/**
 * Tests for (semantic ...) Nucleus integration
 */

import { describe, it, expect } from "vitest";
import { parse, prettyPrint } from "../../src/logic/lc-parser.js";
import { solve, type SolverTools, type Bindings } from "../../src/logic/lc-solver.js";
import { inferType } from "../../src/logic/type-inference.js";

function createMockTools(context: string): SolverTools {
  const lines = context.split("\n");
  return {
    context,
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
    semantic: (query: string, limit = 10) => {
      // Mock: simple word overlap scoring
      const qWords = new Set(query.toLowerCase().split(/\s+/));
      return lines.map((line, idx) => {
        const lWords = line.toLowerCase().split(/\s+/);
        const overlap = lWords.filter(w => qWords.has(w)).length;
        return { line, lineNum: idx + 1, score: overlap / Math.max(qWords.size, 1) };
      }).filter(r => r.score > 0).sort((a, b) => b.score - a.score).slice(0, limit);
    },
    text_stats: () => ({ length: context.length, lineCount: lines.length, sample: { start: "", middle: "", end: "" } }),
  };
}

const testContext = `[10:00] INFO: System started
[10:01] ERROR: Failed to connect to database
[10:02] INFO: Retry scheduled
[10:03] ERROR: Connection timeout
[10:04] INFO: Connection established`;

describe("semantic Parser", () => {
  it("should parse semantic with query", () => {
    const result = parse('(semantic "database error")');
    expect(result.success).toBe(true);
    expect(result.term?.tag).toBe("semantic");
    if (result.term?.tag === "semantic") {
      expect(result.term.query).toBe("database error");
      expect(result.term.limit).toBeUndefined();
    }
  });

  it("should parse semantic with query and limit", () => {
    const result = parse('(semantic "database error" 5)');
    expect(result.success).toBe(true);
    if (result.term?.tag === "semantic") {
      expect(result.term.query).toBe("database error");
      expect(result.term.limit).toBe(5);
    }
  });

  it("should fail on empty semantic", () => {
    expect(parse("(semantic)").success).toBe(false);
  });

  it("should fail on non-string query", () => {
    expect(parse("(semantic 42)").success).toBe(false);
  });
});

describe("semantic prettyPrint", () => {
  it("should round-trip without limit", () => {
    const result = parse('(semantic "database error")');
    expect(result.success).toBe(true);
    expect(prettyPrint(result.term!)).toBe('(semantic "database error")');
  });

  it("should round-trip with limit", () => {
    const result = parse('(semantic "database error" 5)');
    expect(result.success).toBe(true);
    expect(prettyPrint(result.term!)).toBe('(semantic "database error" 5)');
  });
});

describe("semantic Type Inference", () => {
  it("should infer array type", () => {
    const result = parse('(semantic "database")');
    expect(result.success).toBe(true);
    const typeResult = inferType(result.term!);
    expect(typeResult.valid).toBe(true);
    expect(typeResult.type?.tag).toBe("array");
  });
});

describe("semantic Solver", () => {
  it("should return ranked results", () => {
    const tools = createMockTools(testContext);
    const result = parse('(semantic "database error")');
    expect(result.success).toBe(true);
    const solveResult = solve(result.term!, tools);
    expect(solveResult.success).toBe(true);
    expect(Array.isArray(solveResult.value)).toBe(true);
    const results = solveResult.value as Array<{ line: string; score: number }>;
    expect(results.length).toBeGreaterThan(0);
  });

  it("should compose with fuse", () => {
    const tools = createMockTools(testContext);
    const result = parse('(fuse (semantic "database error") (bm25 "database"))');
    expect(result.success).toBe(true);
    const solveResult = solve(result.term!, tools);
    expect(solveResult.success).toBe(true);
  });

  it("should compose with filter", () => {
    const tools = createMockTools(testContext);
    const bindings: Bindings = new Map();
    const semParse = parse('(semantic "error")');
    const semResult = solve(semParse.term!, tools);
    bindings.set("RESULTS", semResult.value);

    const filterParse = parse('(filter RESULTS (lambda x (match x "timeout" 0)))');
    const filterResult = solve(filterParse.term!, tools, bindings);
    expect(filterResult.success).toBe(true);
  });
});
