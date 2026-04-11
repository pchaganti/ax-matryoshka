/**
 * Audit #96 — Chiasmus review round 2
 *
 * Issues found by chiasmus_review of matryoshka codebase.
 *
 * 1. HIGH lc-solver.ts — regex flag inconsistency in match/extract/evaluatePredicate
 *    (filter match case-sensitive, but grep+extract case-insensitive)
 */

import { describe, it, expect, beforeEach } from "vitest";
import { NucleusEngine } from "../src/engine/nucleus-engine.js";

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
});
