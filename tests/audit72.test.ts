/**
 * Audit #72 — TDD tests for 10 issues
 * These tests should FAIL before the fixes and PASS after.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";

describe("Audit #72", () => {
  // =========================================================================
  // #1 HIGH — synthesis-integrator synthesizeCurrencyParser missing isFinite on parseFloat
  // =========================================================================
  describe("#1 — currency parser fns should check isFinite on parseFloat result", () => {
    it("should have isFinite guard in currency parser functions", () => {
      const source = readFileSync("src/logic/synthesis-integrator.ts", "utf-8");
      const fnStart = source.indexOf("synthesizeCurrencyParser(");
      expect(fnStart).toBeGreaterThan(-1);
      // Check in the US/default format branch (last else block before verify)
      const defaultBranch = source.indexOf("// US/Default format", fnStart);
      expect(defaultBranch).toBeGreaterThan(-1);
      const block = source.slice(defaultBranch, defaultBranch + 400);
      // The fn lambda should check isFinite on parseFloat result
      expect(block).toMatch(/isFinite\(r\)|Number\.isFinite\(r\)/);
    });
  });

  // =========================================================================
  // #2 HIGH — lc-interpreter filter unbounded result array growth
  // =========================================================================
  describe("#2 — lc-interpreter filter should cap result array size", () => {
    it("should have MAX bound on filter output", () => {
      const source = readFileSync("src/logic/lc-interpreter.ts", "utf-8");
      const filterCase = source.indexOf('case "filter"');
      expect(filterCase).toBeGreaterThan(-1);
      const block = source.slice(filterCase, filterCase + 800);
      expect(block).toMatch(/MAX_FILTER|MAX_RESULTS|results\.length\s*>=|results\.length\s*>/);
    });
  });

  // =========================================================================
  // #3 HIGH — lc-interpreter map unbounded result array growth
  // =========================================================================
  describe("#3 — lc-interpreter map should cap result array size", () => {
    it("should have MAX bound on map output", () => {
      const source = readFileSync("src/logic/lc-interpreter.ts", "utf-8");
      const mapCase = source.indexOf('case "map"');
      expect(mapCase).toBeGreaterThan(-1);
      const block = source.slice(mapCase, mapCase + 800);
      expect(block).toMatch(/MAX_MAP|MAX_RESULTS|results\.length\s*>=|results\.length\s*>/);
    });
  });

  // =========================================================================
  // #4 MEDIUM — evolutionary.ts tryTemplateApproaches parseInt without isSafeInteger
  // =========================================================================
  describe("#4 — evolutionary tryTemplateApproaches parseInt should check isSafeInteger", () => {
    it("should have isSafeInteger guard in parseInt templates", () => {
      const source = readFileSync("src/synthesis/evolutionary.ts", "utf-8");
      const fnStart = source.indexOf("private tryTemplateApproaches(");
      expect(fnStart).toBeGreaterThan(-1);
      const block = source.slice(fnStart, fnStart + 600);
      // The parseInt templates should guard with isSafeInteger
      expect(block).toMatch(/isSafeInteger|Number\.isSafeInteger/);
    });
  });

  // =========================================================================
  // #5 MEDIUM — pipe.ts unbounded queue growth
  // =========================================================================
  describe("#5 — pipe adapter should cap queue size", () => {
    it("should have MAX_QUEUE_SIZE or queue length check", () => {
      const source = readFileSync("src/tool/adapters/pipe.ts", "utf-8");
      const queuePush = source.indexOf("this.queue.push");
      expect(queuePush).toBeGreaterThan(-1);
      const block = source.slice(queuePush - 200, queuePush + 100);
      expect(block).toMatch(/MAX_QUEUE|queue\.length\s*>=|queue\.length\s*>/);
    });
  });

  // =========================================================================
  // #6 MEDIUM — fts5-search extractSearchTerms unbounded term array
  // =========================================================================
  describe("#6 — fts5-search extractSearchTerms should cap terms", () => {
    it("should limit number of extracted terms", () => {
      const source = readFileSync("src/persistence/fts5-search.ts", "utf-8");
      const fnStart = source.indexOf("private extractSearchTerms(");
      expect(fnStart).toBeGreaterThan(-1);
      const block = source.slice(fnStart, fnStart + 400);
      expect(block).toMatch(/\.slice\(0|MAX_TERMS|MAX_EXTRACTED_TERMS/);
    });
  });

  // =========================================================================
  // #7 MEDIUM — verifier verifyObjectConstraint uncapped required array
  // =========================================================================
  describe("#7 — verifyObjectConstraint should cap required array iteration", () => {
    it("should limit required properties checked", () => {
      const source = readFileSync("src/constraints/verifier.ts", "utf-8");
      const fnStart = source.indexOf("function verifyObjectConstraint(");
      expect(fnStart).toBeGreaterThan(-1);
      const block = source.slice(fnStart, fnStart + 500);
      expect(block).toMatch(/MAX_REQUIRED|MAX_PROPERTIES|required\.length\s*>|required\.slice/);
    });
  });

  // =========================================================================
  // #8 MEDIUM — verifier verifyObjectConstraint uncapped properties entries
  // =========================================================================
  describe("#8 — verifyObjectConstraint should cap properties entries", () => {
    it("should limit properties checked", () => {
      const source = readFileSync("src/constraints/verifier.ts", "utf-8");
      const fnStart = source.indexOf("function verifyObjectConstraint(");
      expect(fnStart).toBeGreaterThan(-1);
      const block = source.slice(fnStart, fnStart + 700);
      expect(block).toMatch(/MAX_PROPERTIES|Object\.entries.*\.slice|entries\.length/);
    });
  });

  // =========================================================================
  // #9 MEDIUM — knowledge-base derive unbounded composableWith push
  // =========================================================================
  describe("#9 — knowledge-base derive should cap composableWith array", () => {
    it("should limit composableWith array size", () => {
      const source = readFileSync("src/synthesis/knowledge-base.ts", "utf-8");
      const fnStart = source.indexOf("derive(");
      expect(fnStart).toBeGreaterThan(-1);
      const block = source.slice(fnStart, fnStart + 500);
      expect(block).toMatch(/MAX_COMPOSABLE|composableWith\.length\s*>=|composableWith\.length\s*</);
    });
  });

  // #10 removed: rlm.ts buildSystemPrompt helper deleted. The adapter-level
  // isFinite check is covered by audit76/77.
});
