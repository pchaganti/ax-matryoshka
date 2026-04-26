/**
 * Audit #86 — 10 security issues
 *
 * 1. HIGH   session-db.ts — getCheckpointTurns missing LIMIT
 * 2. MEDIUM synthesis-integrator.ts — Yen code string missing isSafeInteger
 * 3. MEDIUM predicate-compiler.ts — extracted value not length-checked in eq match
 * 4. MEDIUM http.ts — totalBytes missing isSafeInteger guard
 * 5. MEDIUM http.ts — CORS port regex \d+ unbounded (should be \d{1,5})
 * 6. MEDIUM http.ts — port parseInt uses global isNaN instead of strict check
 * 7. MEDIUM synthesis-integrator.ts — findCommonPattern O(n²) no iteration limit
 * 8. MEDIUM similarity.ts — keywordMatchScore no cap on queryTokens
 * 9. MEDIUM extractor/synthesis.ts — Math.max spread on unbounded array
 * 10. MEDIUM http.ts — timeout multiplication without overflow check
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";

describe("Audit #86", () => {
  // =========================================================================
  // #1 HIGH — session-db.ts getCheckpointTurns missing LIMIT
  // =========================================================================
  describe("#1 — getCheckpointTurns should have LIMIT", () => {
    it("should include LIMIT in query", () => {
      const source = readFileSync("src/persistence/session-db.ts", "utf-8");
      const fnStart = source.indexOf("getCheckpointTurns");
      expect(fnStart).toBeGreaterThan(-1);
      const block = source.slice(fnStart, fnStart + 300);
      expect(block).toMatch(/LIMIT\s+\?|MAX_CHECKPOINTS/i);
    });
  });

  // =========================================================================
  // #9 MEDIUM — extractor/synthesis.ts Math.max spread on unbounded array
  // =========================================================================
  describe("#9 — tryDelimiterFieldExtraction should avoid spread on large array", () => {
    it("should not use spread operator on unbounded examples.map", () => {
      const source = readFileSync("src/synthesis/extractor/synthesis.ts", "utf-8");
      const maxFieldsLine = source.indexOf("maxFields");
      expect(maxFieldsLine).toBeGreaterThan(-1);
      const block = source.slice(maxFieldsLine, maxFieldsLine + 300);
      // Should NOT use Math.max(...examples.map(...)) spread pattern
      // Instead should use a loop or reduce
      expect(block).not.toMatch(/Math\.max\(0,\s*\.\.\.examples\.map/);
    });
  });

  // =========================================================================
  // #10 MEDIUM — http.ts timeout multiplication without overflow check
});
