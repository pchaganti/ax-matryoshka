/**
 * Audit #93 — 10 security issues
 *
 * 1. MEDIUM regex/synthesis.ts — analyzeCharacters minLen not capped (CPU exhaustion)
 * 2. MEDIUM regex/synthesis.ts — nodeToRegex unbounded recursion (stack overflow)
 * 3. MEDIUM relational/interpreter.ts — exprToCode unbounded recursion (stack overflow)
 * 4. MEDIUM session.ts — sessions Map grows unbounded (memory exhaustion)
 * 5. MEDIUM session.ts — filePath not length-validated
 * 6. MEDIUM knowledge-base.ts — coversAll creates RegExp without validateRegex
 * 7. MEDIUM error-analyzer.ts — findSimilar maxDistance/maxResults not validated
 * 8. MEDIUM lc-interpreter.ts — classify examples not length-capped
 * 9. MEDIUM regex/synthesis.ts — synthesizeRegex example strings not length-capped
 * 10. MEDIUM relational/interpreter.ts — exprToCode replace $ not escaped
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";

describe("Audit #93", () => {

  // #4 removed: exclusively tested src/session.ts (deleted with the orphaned
  // SessionManager — no production code imported it).

  // =========================================================================
  // #5 MEDIUM — filePath not length-validated
  // =========================================================================
  describe("#5 — session getOrCreate should validate filePath length", () => {
    it("should check filePath length", () => {
      const source = readFileSync("node_modules/repl-sandbox/dist/session.js", "utf-8");
      const getOrCreateStart = source.indexOf("async getOrCreate");
      expect(getOrCreateStart).toBeGreaterThan(-1);
      const block = source.slice(getOrCreateStart, getOrCreateStart + 400);
      // Should validate key (filePath) length
      expect(block).toMatch(/key\.length|maxKeyLength|MAX_PATH/);
    });
  });

  // =========================================================================
  // #6 MEDIUM — coversAll creates RegExp without validateRegex
  // =========================================================================
  describe("#6 — coversAll should validate regex before creating RegExp", () => {
    it("should call validateRegex before new RegExp", () => {
      const source = readFileSync("src/synthesis/knowledge-base.ts", "utf-8");
      const coversAllStart = source.indexOf("private coversAll");
      expect(coversAllStart).toBeGreaterThan(-1);
      const block = source.slice(coversAllStart, coversAllStart + 400);
      // Should call validateRegex before new RegExp(c.pattern)
      expect(block).toMatch(/validateRegex/);
    });
  });

  // =========================================================================
  // #10 MEDIUM — exprToCode replace $ not escaped
});
