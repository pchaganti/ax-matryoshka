/**
 * Audit #96 — Chiasmus review round 2
 *
 * Issues found by chiasmus_review of matryoshka codebase.
 *
 * 1. HIGH lc-solver.ts — regex flag inconsistency in match/extract/evaluatePredicate
 *    (filter match case-sensitive, but grep+extract case-insensitive)
 * 2. MEDIUM lc-solver.ts — (sum RESULTS) silently sums ALL numbers per grep line
 *    (should take the first numeric token only)
 * 3. MEDIUM lc-solver.ts — module-level lastContext/lastContextLines cache leaks
 *    across SolverTools instances; move lines onto SolverTools itself
 * 4. MEDIUM handle-session.ts — execute() re-serializes the whole array just to
 *    compute a token-savings estimate, defeating the point of handle storage
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import { NucleusEngine } from "../src/engine/nucleus-engine.js";
import type { LCTerm } from "../src/logic/types.js";
import { solve, type SolverTools } from "../src/logic/lc-solver.js";
import { HandleSession } from "../src/engine/handle-session.js";
import { SessionDB } from "../src/persistence/session-db.js";

describe("Audit #96 — Chiasmus review round 2", () => {
  // =========================================================================
  // #1 HIGH — regex flag consistency in match/predicate
  // =========================================================================
  describe("#1 — match should be case-insensitive like grep", () => {
    let engine: NucleusEngine;

    beforeEach(() => {
      engine = new NucleusEngine();
      engine.loadContent([
        "Error 500: Internal Server Error",
        "WARNING: disk space low",
        "info: all systems nominal",
        "FATAL: database connection lost",
      ].join("\n"));
    });

    it("top-level (match \"Error\" \"error\" 0) returns match (case-insensitive)", () => {
      // This hits evaluate() match case at lc-solver.ts:547
      const result = engine.execute('(match "Error 500" "error" 0)');
      expect(result.success).toBe(true);
      // Case-insensitive regex matches "Error"
      expect(result.value).not.toBeNull();
      expect(typeof result.value).toBe("string");
      expect((result.value as string).toLowerCase()).toBe("error");
    });

    it("(filter RESULTS (lambda x (match x \"error\" 0))) keeps upper-case matches", () => {
      // This hits evaluatePredicate match case at lc-solver.ts:1078
      const grepResult = engine.execute('(grep "error")');
      expect(grepResult.success).toBe(true);
      // Grep is case-insensitive — finds "Error 500" and "Error" in "Internal Server Error"
      expect(Array.isArray(grepResult.value)).toBe(true);

      const filterResult = engine.execute(
        '(filter RESULTS (lambda x (match x "error" 0)))'
      );
      expect(filterResult.success).toBe(true);
      expect(Array.isArray(filterResult.value)).toBe(true);
      const kept = filterResult.value as Array<{ line: string }>;
      // The "Error 500: Internal Server Error" line should survive —
      // its source line contains uppercase "Error", and filter match must
      // match case-insensitively.
      const hasError500 = kept.some((r) => r.line.includes("Error 500"));
      expect(hasError500).toBe(true);
    });

    it("(map RESULTS (lambda x (match x \"fatal\" 0))) matches upper-case FATAL", () => {
      // This hits evaluateWithBinding match case at lc-solver.ts:1184
      const grepResult = engine.execute('(grep "fatal")');
      expect(grepResult.success).toBe(true);

      const mapResult = engine.execute(
        '(map RESULTS (lambda x (match x "fatal" 0)))'
      );
      expect(mapResult.success).toBe(true);
      expect(Array.isArray(mapResult.value)).toBe(true);
      const mapped = mapResult.value as Array<string | null>;
      // At least one non-null entry — the FATAL line should produce a match
      const nonNull = mapped.filter((v) => v !== null);
      expect(nonNull.length).toBeGreaterThan(0);
    });
  });

  // =========================================================================
  // #2 MEDIUM — (sum RESULTS) should take first numeric token per line
  // =========================================================================
  describe("#2 — sum over grep results takes first numeric token only", () => {
    function makeTools(lines: string[]): SolverTools {
      return {
        grep: () =>
          lines.map((line, i) => ({
            match: line,
            line,
            lineNum: i + 1,
            index: 0,
            groups: [],
          })),
        fuzzy_search: () => [],
        bm25: () => [],
        semantic: () => [],
        text_stats: () => ({
          length: 0,
          lineCount: lines.length,
          sample: { start: "", middle: "", end: "" },
        }),
        context: lines.join("\n"),
        lines,
      };
    }

    it("sums $100 + $200, NOT $100+5 + $200+10 (multi-number line)", () => {
      // Before the fix: regex accumulates ALL numbers per line:
      //   Line 1: 100 + 5 = 105
      //   Line 2: 200 + 10 = 210
      //   Total = 315
      // After the fix: take first number per line only:
      //   Line 1: 100
      //   Line 2: 200
      //   Total = 300
      const tools = makeTools(["Item: $100 Qty: 5", "Item: $200 Qty: 10"]);
      const term: LCTerm = {
        tag: "sum",
        collection: { tag: "grep", pattern: "Item" },
      };
      const result = solve(term, tools);
      expect(result.success).toBe(true);
      expect(result.value).toBe(300);
    });

    it("sums error code 500 + error code 404 = 904 (no currency case)", () => {
      // Before the fix: "Error 500: timeout 30s" would sum 500+30 = 530
      //                 "Error 404: attempt 2 of 3" would sum 404+2+3 = 409
      //                 Total = 939 (garbage)
      // After the fix: takes first number per line:
      //                 500 + 404 = 904
      const tools = makeTools([
        "Error 500: timeout 30s",
        "Error 404: attempt 2 of 3",
      ]);
      const term: LCTerm = {
        tag: "sum",
        collection: { tag: "grep", pattern: "Error" },
      };
      const result = solve(term, tools);
      expect(result.success).toBe(true);
      expect(result.value).toBe(904);
    });

    it("plain numeric-string entries still parse correctly (no regression)", () => {
      // Plain strings go through the `typeof val === "string"` branch, not
      // the grep-object branch. Verify that branch is unaffected by the fix.
      const stringEngine = new NucleusEngine();
      stringEngine.loadContent("$1,000\n$2,500.50");
      const result = stringEngine.execute("(sum (lines 1 2))");
      expect(result.success).toBe(true);
      expect(result.value).toBe(3500.5);
    });
  });

  // =========================================================================
  // #3 MEDIUM — (lines N M) reads from SolverTools, not a module-level cache
  // =========================================================================
  describe("#3 — (lines) uses SolverTools.lines, no cross-session leak", () => {
    function makeTools(context: string, lines: string[]): SolverTools {
      return {
        grep: () => [],
        fuzzy_search: () => [],
        bm25: () => [],
        semantic: () => [],
        text_stats: () => ({
          length: context.length,
          lineCount: lines.length,
          sample: { start: "", middle: "", end: "" },
        }),
        context,
        lines,
      };
    }

    it("(lines 1 2) respects tools.lines even when it diverges from context", () => {
      // Intentionally construct a tools object where `context` would, if
      // re-split, produce a DIFFERENT array than `lines`. The solver must
      // trust `tools.lines` rather than falling back to a cached reparse of
      // `tools.context` (which is exactly what the old module-level cache did).
      const tools = makeTools("aaa\nbbb\nccc", ["XXX", "YYY", "ZZZ"]);
      const term: LCTerm = { tag: "lines", start: 1, end: 2 };
      const result = solve(term, tools);
      expect(result.success).toBe(true);
      expect(result.value).toEqual(["XXX", "YYY"]);
    });

    it("two tools instances do not leak state between each other", () => {
      // Call A with one tools, then B with another. If A's call cached data
      // at module scope, B's call could accidentally see it.
      const toolsA = makeTools("line 1\nline 2", ["alpha", "beta"]);
      const toolsB = makeTools("line 3\nline 4", ["gamma", "delta"]);
      const term: LCTerm = { tag: "lines", start: 1, end: 2 };

      const resultA1 = solve(term, toolsA);
      const resultB = solve(term, toolsB);
      const resultA2 = solve(term, toolsA);

      expect(resultA1.value).toEqual(["alpha", "beta"]);
      expect(resultB.value).toEqual(["gamma", "delta"]);
      expect(resultA2.value).toEqual(["alpha", "beta"]);
    });
  });

  // =========================================================================
  // #4 MEDIUM — execute() should not re-serialize full array for token metadata
  // =========================================================================
  describe("#4 — execute() uses DB-side byte size, not full JSON.stringify", () => {
    it("SessionDB.getHandleDataByteSize returns the sum of stored data sizes", () => {
      const db = new SessionDB();
      // createHandle stores each item as JSON via JSON.stringify
      const handle = db.createHandle(["hello", "world", 42]);
      // JSON-stringified rows: "\"hello\"" (7) + "\"world\"" (7) + "42" (2) = 16
      const size = db.getHandleDataByteSize(handle);
      expect(size).toBe(16);
      db.close();
    });

    it("getHandleDataByteSize returns 0 for unknown handle", () => {
      const db = new SessionDB();
      expect(db.getHandleDataByteSize("$res999")).toBe(0);
      db.close();
    });

    it("execute() routes token-metadata sizing through SessionDB, not JSON.stringify", () => {
      const session = new HandleSession();
      session.loadContent(
        Array.from({ length: 500 }, (_, i) => `line ${i} some content`).join("\n"),
      );

      // Spy on the DB method we just added. If execute() still reaches for
      // JSON.stringify(result.value), this spy will never fire. That pins
      // the refactor: future edits that drop the DB path would fail here.
      const dbSpy = vi.spyOn(SessionDB.prototype, "getHandleDataByteSize");

      const result = session.execute('(grep "line")');

      expect(result.success).toBe(true);
      expect(result.handle).toBeDefined();
      expect(result.tokenMetadata).toBeDefined();
      expect(result.tokenMetadata!.estimatedFullTokens).toBeGreaterThan(0);
      expect(result.tokenMetadata!.stubTokens).toBeGreaterThan(0);
      expect(result.tokenMetadata!.savingsPercent).toBeGreaterThanOrEqual(0);

      // The fix must route through the DB — at least one call, with the
      // freshly-created handle as the argument.
      expect(dbSpy).toHaveBeenCalled();
      const calledWithHandle = dbSpy.mock.calls.some(
        (args) => args[0] === result.handle,
      );
      expect(calledWithHandle).toBe(true);

      dbSpy.mockRestore();
      session.close();
    });

    it("token metadata remains directionally correct (large result → high savings)", () => {
      const session = new HandleSession();
      session.loadContent(
        Array.from({ length: 200 }, (_, i) => `match ${i} some text`).join("\n"),
      );
      const result = session.execute('(grep "match")');

      expect(result.success).toBe(true);
      expect(result.tokenMetadata).toBeDefined();
      // Stub is small, full data is large → savings should be substantial
      expect(result.tokenMetadata!.estimatedFullTokens).toBeGreaterThan(
        result.tokenMetadata!.stubTokens,
      );
      expect(result.tokenMetadata!.savingsPercent).toBeGreaterThan(50);

      session.close();
    });
  });
});
