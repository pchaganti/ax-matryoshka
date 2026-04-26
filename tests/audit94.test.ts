/**
 * Audit #94 — 10 security issues
 *
 * 1. HIGH base.ts — DANGEROUS_VAR_NAMES missing hasOwnProperty/toString/valueOf etc.
 * 2. MEDIUM lc-interpreter.ts — reduce has no iteration cap (map has MAX_MAP_RESULTS)
 * 3. MEDIUM lc-interpreter.ts — formatValue JSON.stringify unbounded for strings
 * 4. MEDIUM sandbox-tools.ts — count_tokens split unbounded before slicing
 * 5. MEDIUM synthesis-integrator.ts — safeRules array not length-capped
 * 6. MEDIUM fts5-search.ts — searchByRelevance lower.split(term) unbounded O(n*m)
 * 7. MEDIUM pipe.ts — MAX_LINE_LENGTH 10MB too permissive
 * 8. MEDIUM session-db.ts — split("\n") on 100MB creates huge intermediate array
 * 9. MEDIUM lattice-tool.ts — JSON.stringify(value) unbounded before slice
 * 10. MEDIUM lc-interpreter.ts — classify trueExamples/falseExamples input strings not length-capped
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";

describe("Audit #94", () => {
  // #1 removed: DANGEROUS_VAR_NAMES deleted with FINAL_VAR marker.

  // =========================================================================
  // #5 MEDIUM — safeRules array not length-capped
  // =========================================================================
  describe("#5 — synthesizeClassifier safeRules should be capped", () => {
    it("should limit number of rules", () => {
      const source = readFileSync("src/logic/synthesis-integrator.ts", "utf-8");
      const safeRulesLine = source.indexOf("const safeRules = rules.filter");
      expect(safeRulesLine).toBeGreaterThan(-1);
      const block = source.slice(safeRulesLine, safeRulesLine + 600);
      // Should cap safeRules length after filtering
      expect(block).toMatch(/\.slice\(0,\s*MAX|safeRules\.length\s*>/);
    });
  });
});
