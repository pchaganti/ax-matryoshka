/**
 * Audit #81 — 10 security issues
 *
 * 1. HIGH   rlm.ts — query not truncated/escaped in generateClassifierGuidance
 * 2. MEDIUM rlm.ts — document line escaping missing backslash handling
 * 3. MEDIUM nucleus.ts — paren balancing lacks MAX_DEPTH in tensor path
 * 4. MEDIUM rlm.ts — constraint invariants not truncated
 * 5. MEDIUM relational/interpreter.ts — no code length check before new Function()
 * 6. MEDIUM predicate-compiler.ts — missing .repeat() and fromCodePoint in blocklist
 * 7. MEDIUM sandbox-tools.ts — Object.assign in sandbox enables prototype pollution
 * 8. MEDIUM lc-interpreter.ts — formatValue key strings not length-capped
 * 9. MEDIUM nucleus.ts — paren balancing lacks MAX_DEPTH in S-expression path
 * 10. MEDIUM rlm.ts — constraint output min/max not validated with isFinite
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";

describe("Audit #81", () => {
  // =========================================================================
  // #1 HIGH — rlm.ts query not truncated/escaped in generateClassifierGuidance
  // =========================================================================
  describe("#1 — generateClassifierGuidance should escape/truncate query", () => {
    it("should truncate or escape query before interpolation", () => {
      const source = readFileSync("src/rlm.ts", "utf-8");
      const fnStart = source.indexOf("function generateClassifierGuidance");
      expect(fnStart).toBeGreaterThan(-1);
      // Search for query usage near the template literal
      const queryInTemplate = source.indexOf('Look at the query', fnStart);
      expect(queryInTemplate).toBeGreaterThan(-1);
      const block = source.slice(queryInTemplate - 200, queryInTemplate + 100);
      expect(block).toMatch(/safeQuery|query\.slice\(0,|query\.replace/);
    });
  });

  // =========================================================================
  // #4 MEDIUM — rlm.ts constraint invariants not truncated
  // =========================================================================
  describe("#4 — constraint invariants should be truncated", () => {
    it("should truncate invariant strings before interpolation", () => {
      const source = readFileSync("src/rlm.ts", "utf-8");
      const invLoop = source.indexOf("constraint.invariants");
      expect(invLoop).toBeGreaterThan(-1);
      const block = source.slice(invLoop, invLoop + 200);
      expect(block).toMatch(/\.slice\(0,|safeInv|inv\.slice|truncat/);
    });
  });

  // =========================================================================
  // #6 MEDIUM — predicate-compiler.ts missing .repeat() and fromCodePoint
  // =========================================================================
  // #7 MEDIUM — sandbox-tools.ts Object.assign enables prototype pollution
  // =========================================================================
  describe("#7 — sandbox should not expose Object.assign", () => {
    it("should remove or guard Object.assign in sandbox globals", () => {
      const source = readFileSync("node_modules/repl-sandbox/dist/safe-globals.js", "utf-8");
      const objectBlock = source.indexOf("Object: Object.freeze(Object.create(null");
      expect(objectBlock).toBeGreaterThan(-1);
      const block = source.slice(objectBlock, objectBlock + 500);
      // Object.assign should be removed or guarded
      expect(block).not.toMatch(/assign:\s*\{\s*value:\s*Object\.assign/);
    });
  });

});
