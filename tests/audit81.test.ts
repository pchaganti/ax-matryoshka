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
  // #2 MEDIUM — rlm.ts document line escaping missing backslash handling
  // =========================================================================
  // #3 MEDIUM — nucleus.ts paren balancing lacks MAX_DEPTH in tensor path
  // =========================================================================
  describe("#3 — extractCode tensor path should have depth limit", () => {
    it("should check depth limit in tensor paren balancing", () => {
      const source = readFileSync("src/adapters/nucleus.ts", "utf-8");
      const tensorIdx = source.indexOf("tensorIdx");
      expect(tensorIdx).toBeGreaterThan(-1);
      // Find the paren balancing loop after tensor detection
      const parenLoop = source.indexOf('response[i] === "("', tensorIdx);
      expect(parenLoop).toBeGreaterThan(-1);
      const block = source.slice(parenLoop, parenLoop + 200);
      expect(block).toMatch(/MAX_DEPTH|depth\s*>\s*\d|MAX_PAREN_DEPTH/);
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
  // #5 MEDIUM — relational/interpreter.ts no code length check before new Function()
  // =========================================================================
  describe("#5 — executeExpr should cap code length before new Function()", () => {
    it("should check code length before Function construction", () => {
      const source = readFileSync("src/synthesis/relational/interpreter.ts", "utf-8");
      const fnStart = source.indexOf("function executeExpr");
      expect(fnStart).toBeGreaterThan(-1);
      const block = source.slice(fnStart, fnStart + 300);
      expect(block).toMatch(/code\.length\s*>|MAX_CODE_LENGTH|MAX_GENERATED/);
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

  // =========================================================================
  // #8 MEDIUM — lc-interpreter.ts formatValue key strings not length-capped
  // =========================================================================
  describe("#8 — formatValue should cap key string lengths", () => {
    it("should truncate long property keys", () => {
      const source = readFileSync("src/logic/lc-interpreter.ts", "utf-8");
      const fnStart = source.indexOf("function formatValue");
      expect(fnStart).toBeGreaterThan(-1);
      const objectBlock = source.indexOf("Object.keys(value)", fnStart);
      expect(objectBlock).toBeGreaterThan(-1);
      const block = source.slice(objectBlock, objectBlock + 400);
      expect(block).toMatch(/k\.slice\(0,|MAX_KEY_LENGTH|safeKey|k\.length\s*>/);
    });
  });

  // =========================================================================
  // #9 MEDIUM — nucleus.ts paren balancing lacks MAX_DEPTH in S-expression path
  // =========================================================================
  describe("#9 — extractCode S-expression path should have depth limit", () => {
    it("should check depth limit in S-expression paren balancing", () => {
      const source = readFileSync("src/adapters/nucleus.ts", "utf-8");
      const sexpPath = source.indexOf("KNOWN_COMMANDS");
      expect(sexpPath).toBeGreaterThan(-1);
      // Find the paren balancing loop in the S-expression extraction path
      const depthVar = source.indexOf('if (response[i] === "(") depth++', sexpPath);
      expect(depthVar).toBeGreaterThan(-1);
      const block = source.slice(depthVar, depthVar + 200);
      expect(block).toMatch(/MAX_DEPTH|depth\s*>\s*\d|MAX_PAREN_DEPTH/);
    });
  });

});
