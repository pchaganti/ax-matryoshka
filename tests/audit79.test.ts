/**
 * Audit #79 — 10 security issues
 *
 * 1. HIGH   lc-solver.ts evaluate add — missing isFinite on result
 * 2. MEDIUM synthesis-integrator.ts synthesizeClassifier — unbounded outputGroups
 * 3. MEDIUM nucleus.ts getSuccessFeedback — query not truncated in prompt
 * 4. MEDIUM base.ts getErrorFeedback — error not truncated
 * 5. MEDIUM qwen.ts getErrorFeedback — error not truncated
 * 6. MEDIUM deepseek.ts getErrorFeedback — error not truncated
 * 7. MEDIUM nucleus-engine.ts — _fn_ binding name bypasses validation
 * 8. MEDIUM lc-interpreter.ts formatValue — Object.entries on unbounded object
 * 9. MEDIUM session-db.ts getCheckpoint — no size check before JSON.parse
 * 10. MEDIUM nucleus-engine.ts fuzzy_search — no line count cap
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";

describe("Audit #79", () => {
  // =========================================================================
  // #1 HIGH — lc-solver.ts evaluate add missing isFinite on result
  // =========================================================================
  describe("#1 — evaluate add should check isFinite on result", () => {
    it("should validate result after addition in evaluate function", () => {
      const source = readFileSync("src/logic/lc-solver.ts", "utf-8");
      // Find the add case in the evaluate function (NOT evaluateWithBinding)
      const evalFn = source.indexOf("function evaluate(");
      expect(evalFn).toBeGreaterThan(-1);
      const addCase = source.indexOf('case "add":', evalFn);
      expect(addCase).toBeGreaterThan(-1);
      // Make sure we're in evaluate, not evaluateWithBinding
      const evalWithBinding = source.indexOf("function evaluateWithBinding(");
      expect(addCase).toBeLessThan(evalWithBinding);
      // Bumped from 500 → 700 after the async refactor added `await` prefixes
      // to every evaluate() call, pushing the `Number.isFinite(addResult)`
      // check past the end of the 500-char window.
      const block = source.slice(addCase, addCase + 700);
      expect(block).toMatch(/isFinite\(.*(?:result|addResult|left\s*\+\s*right)/);
    });
  });

  // =========================================================================
  // #2 MEDIUM — synthesis-integrator.ts synthesizeClassifier unbounded outputGroups
  // =========================================================================
  describe("#2 — synthesizeClassifier should cap outputGroups size", () => {
    it("should have MAX_OUTPUT_GROUPS or size check", () => {
      const source = readFileSync("src/logic/synthesis-integrator.ts", "utf-8");
      const fnStart = source.indexOf("private synthesizeClassifier");
      expect(fnStart).toBeGreaterThan(-1);
      const block = source.slice(fnStart, fnStart + 500);
      expect(block).toMatch(/MAX_OUTPUT_GROUPS|outputGroups\.size\s*>|uniqueCount/);
    });
  });

  // =========================================================================
  // #3 MEDIUM — nucleus.ts getSuccessFeedback query not truncated
  // =========================================================================
  describe("#3 — getSuccessFeedback should truncate query", () => {
    it("should truncate or sanitize query parameter", () => {
      const source = readFileSync("src/adapters/nucleus.ts", "utf-8");
      const fnStart = source.indexOf("function getSuccessFeedback");
      expect(fnStart).toBeGreaterThan(-1);
      const block = source.slice(fnStart, fnStart + 600);
      expect(block).toMatch(/\.slice\(0,|\.substring\(0,|truncat|safeQuery/);
    });
  });

  // =========================================================================
  // #4 MEDIUM — base.ts getErrorFeedback error not truncated
  // =========================================================================
  describe("#4 — base.ts getErrorFeedback should truncate error", () => {
    it("should truncate error string", () => {
      const source = readFileSync("src/adapters/base.ts", "utf-8");
      const fnStart = source.indexOf("function getErrorFeedback");
      expect(fnStart).toBeGreaterThan(-1);
      const block = source.slice(fnStart, fnStart + 300);
      // Must truncate the error parameter itself, not just the code
      expect(block).toMatch(/safeError|error\.slice\(0,|error\.substring\(0,/);
    });
  });

  // =========================================================================
  // #5 MEDIUM — qwen.ts getErrorFeedback error not truncated
  // =========================================================================
  describe("#5 — qwen.ts getErrorFeedback should truncate error", () => {
    it("should truncate error string", () => {
      const source = readFileSync("src/adapters/qwen.ts", "utf-8");
      const fnStart = source.indexOf("function getErrorFeedback");
      expect(fnStart).toBeGreaterThan(-1);
      const block = source.slice(fnStart, fnStart + 300);
      expect(block).toMatch(/\.slice\(0,|\.substring\(0,|safeError|truncat/);
    });
  });

  // =========================================================================
  // #6 MEDIUM — deepseek.ts getErrorFeedback error not truncated
  // =========================================================================
  describe("#6 — deepseek.ts getErrorFeedback should truncate error", () => {
    it("should truncate error string", () => {
      const source = readFileSync("src/adapters/deepseek.ts", "utf-8");
      const fnStart = source.indexOf("function getErrorFeedback");
      expect(fnStart).toBeGreaterThan(-1);
      const block = source.slice(fnStart, fnStart + 300);
      expect(block).toMatch(/\.slice\(0,|\.substring\(0,|safeError|truncat/);
    });
  });

  // =========================================================================
  // #7 MEDIUM — nucleus-engine.ts _fn_ binding name bypasses validation
  // =========================================================================
  describe("#7 — _fn_ binding should validate fnObj.name", () => {
    it("should validate fnObj.name before creating binding key", () => {
      const source = readFileSync("src/engine/nucleus-engine.ts", "utf-8");
      const fnBinding = source.indexOf("_fn_${fnObj.name}");
      expect(fnBinding).toBeGreaterThan(-1);
      // Look backwards for validation
      const block = source.slice(Math.max(0, fnBinding - 300), fnBinding + 100);
      expect(block).toMatch(/fnObj\.name.*test|fnObj\.name.*match|typeof fnObj\.name|fnObj\.name\.length/);
    });
  });

  // =========================================================================
  // #8 MEDIUM — lc-interpreter.ts formatValue Object.entries unbounded
  // =========================================================================
  describe("#8 — formatValue should cap Object.entries", () => {
    it("should limit Object.keys/entries before enumeration", () => {
      const source = readFileSync("src/logic/lc-interpreter.ts", "utf-8");
      const fnStart = source.indexOf("function formatValue");
      expect(fnStart).toBeGreaterThan(-1);
      const objectBlock = source.indexOf('typeof value === "object"', fnStart);
      expect(objectBlock).toBeGreaterThan(-1);
      const block = source.slice(objectBlock, objectBlock + 300);
      expect(block).toMatch(/MAX_FORMAT_KEYS|Object\.keys.*length|keys\.length\s*>/);

    });
  });

  // =========================================================================
  // #9 MEDIUM — session-db.ts getCheckpoint no size check before JSON.parse
  // =========================================================================
  describe("#9 — getCheckpoint should check size before JSON.parse", () => {
    it("should validate bindings size before parsing", () => {
      const source = readFileSync("src/persistence/session-db.ts", "utf-8");
      const fnStart = source.indexOf("getCheckpoint(");
      expect(fnStart).toBeGreaterThan(-1);
      const block = source.slice(fnStart, fnStart + 400);
      expect(block).toMatch(/MAX_|\.length\s*>/);
    });
  });

  // =========================================================================
  // #10 MEDIUM — nucleus-engine.ts fuzzy_search no line count cap
  // =========================================================================
  describe("#10 — fuzzy_search should cap lines iterated", () => {
    it("should have MAX_LINES or line count cap", () => {
      const source = readFileSync("src/engine/nucleus-engine.ts", "utf-8");
      const fuzzySearch = source.indexOf("fuzzy_search");
      expect(fuzzySearch).toBeGreaterThan(-1);
      const block = source.slice(fuzzySearch, fuzzySearch + 500);
      expect(block).toMatch(/MAX_LINES|MAX_FUZZY|lines\.length.*Math\.min|clampedLines/);
    });
  });
});
