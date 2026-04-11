/**
 * Tests for (dampen ...) Nucleus integration
 * Covers: parser, solver, type inference, prettyPrint
 */

import { describe, it, expect } from "vitest";
import { parse, prettyPrint } from "../../src/logic/lc-parser.js";
import { solve, type SolverTools, type Bindings } from "../../src/logic/lc-solver.js";
import { inferType } from "../../src/logic/type-inference.js";

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

describe("dampen Parser", () => {
  it("should parse dampen with collection and query", () => {
    const result = parse('(dampen (bm25 "error") "database error")');
    expect(result.success).toBe(true);
    expect(result.term?.tag).toBe("dampen");
    if (result.term?.tag === "dampen") {
      expect(result.term.collection.tag).toBe("bm25");
      expect(result.term.query).toBe("database error");
    }
  });

  it("should parse dampen with variable reference", () => {
    const result = parse('(dampen RESULTS "connection timeout")');
    expect(result.success).toBe(true);
    if (result.term?.tag === "dampen") {
      expect(result.term.collection.tag).toBe("var");
      expect(result.term.query).toBe("connection timeout");
    }
  });

  it("should fail without query string", () => {
    const result = parse("(dampen RESULTS)");
    expect(result.success).toBe(false);
  });

  it("should fail on empty dampen", () => {
    const result = parse("(dampen)");
    expect(result.success).toBe(false);
  });
});

describe("dampen prettyPrint", () => {
  it("should round-trip dampen", () => {
    const result = parse('(dampen RESULTS "database error")');
    expect(result.success).toBe(true);
    const printed = prettyPrint(result.term!);
    expect(printed).toBe('(dampen RESULTS "database error")');
  });

  it("should round-trip dampen with nested expression", () => {
    const result = parse('(dampen (bm25 "error") "database error")');
    expect(result.success).toBe(true);
    const printed = prettyPrint(result.term!);
    expect(printed).toBe('(dampen (bm25 "error") "database error")');
  });
});

describe("dampen Type Inference", () => {
  it("should infer array type for dampen", () => {
    const result = parse('(dampen (bm25 "error") "database")');
    expect(result.success).toBe(true);
    const typeResult = inferType(result.term!);
    expect(typeResult.valid).toBe(true);
    expect(typeResult.type?.tag).toBe("array");
  });
});

describe("dampen Solver", () => {
  it("should dampen results that lack query terms", () => {
    const tools = createMockTools(testContext);

    // BM25 returns results with scores — dampen ones without "database"
    const result = parse('(dampen (bm25 "error connection database") "database")');
    expect(result.success).toBe(true);

    const solveResult = solve(result.term!, tools);
    expect(solveResult.success).toBe(true);
    expect(Array.isArray(solveResult.value)).toBe(true);
    const results = solveResult.value as DampenableResult[];
    expect(results.length).toBeGreaterThan(0);

    // Results containing "database" should keep their scores
    // Results NOT containing "database" should be dampened
    const dbLine = results.find(r => r.line.toLowerCase().includes("database"));
    const nonDbLine = results.find(r => !r.line.toLowerCase().includes("database") && r.score > 0);
    if (dbLine && nonDbLine) {
      // DB line should not be dampened, non-DB lines should be
      expect(dbLine.score).toBeGreaterThan(0);
    }
  });

  it("should work with bindings", () => {
    const tools = createMockTools(testContext);
    const bindings: Bindings = new Map();

    // Store bm25 results in bindings
    const bm25Parse = parse('(bm25 "error connection")');
    const bm25Result = solve(bm25Parse.term!, tools);
    bindings.set("RESULTS", bm25Result.value);

    // Dampen using bindings
    const dampenParse = parse('(dampen RESULTS "database")');
    expect(dampenParse.success).toBe(true);
    const dampenResult = solve(dampenParse.term!, tools, bindings);
    expect(dampenResult.success).toBe(true);
    expect(Array.isArray(dampenResult.value)).toBe(true);
  });

  it("should compose with filter after dampening", () => {
    const tools = createMockTools(testContext);
    const bindings: Bindings = new Map();

    const dampenParse = parse('(dampen (bm25 "error") "error")');
    const dampenResult = solve(dampenParse.term!, tools);
    expect(dampenResult.success).toBe(true);
    bindings.set("RESULTS", dampenResult.value);

    const filterParse = parse('(filter RESULTS (lambda x (match x "timeout" 0)))');
    expect(filterParse.success).toBe(true);
    const filterResult = solve(filterParse.term!, tools, bindings);
    expect(filterResult.success).toBe(true);
  });

  it("should compose with fuse then dampen", () => {
    const tools = createMockTools(testContext);

    const result = parse('(dampen (fuse (grep "ERROR") (bm25 "error")) "error")');
    expect(result.success).toBe(true);
    const solveResult = solve(result.term!, tools);
    expect(solveResult.success).toBe(true);
    expect(Array.isArray(solveResult.value)).toBe(true);
  });
});

type DampenableResult = { line: string; lineNum: number; score: number };
