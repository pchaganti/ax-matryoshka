/**
 * Audit #62 — TDD tests for 10 issues
 * These tests should FAIL before the fixes and PASS after.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";

describe("Audit #62", () => {
  // =========================================================================
  // #1 HIGH — lc-interpreter parseInt uses isFinite not isSafeInteger
  // =========================================================================
  describe("#1 — lc-interpreter parseInt should use isSafeInteger", () => {
    it("should validate parsed int with isSafeInteger", () => {
      const source = readFileSync("src/logic/lc-interpreter.ts", "utf-8");
      const caseStart = source.indexOf('case "parseInt"');
      expect(caseStart).toBeGreaterThan(-1);
      const block = source.slice(caseStart, caseStart + 400);
      expect(block).toMatch(/isSafeInteger/);
    });
  });

  // =========================================================================
  // #2 HIGH — evalo.ts evalExtractor no recursion depth limit
  // =========================================================================
  describe("#2 — evalExtractor should have recursion depth limit", () => {
    it("should track and limit recursion depth", () => {
      const source = readFileSync("src/synthesis/evalo/evalo.ts", "utf-8");
      const fnStart = source.indexOf("function evalExtractor(");
      expect(fnStart).toBeGreaterThan(-1);
      const block = source.slice(fnStart, fnStart + 400);
      expect(block).toMatch(/MAX_EVAL_DEPTH|depth\s*>/i);
    });
  });

  // =========================================================================
  // #3 MEDIUM — compile.ts split no delimiter length check
  // =========================================================================
  describe("#3 — compiled split should validate delimiter length", () => {
    it("should check delimiter length before generating code", () => {
      const source = readFileSync("src/synthesis/evalo/compile.ts", "utf-8");
      const splitStart = source.indexOf('case "split"');
      expect(splitStart).toBeGreaterThan(-1);
      const block = source.slice(splitStart, splitStart + 300);
      expect(block).toMatch(/delim\.length|extractor\.delim\.length/);
    });
  });

  // =========================================================================
  // #4 MEDIUM — lc-solver parseInt uses isFinite not isSafeInteger
  // =========================================================================
  describe("#4 — lc-solver parseInt should use isSafeInteger", () => {
    it("should validate parsed int with isSafeInteger", () => {
      const source = readFileSync("src/logic/lc-solver.ts", "utf-8");
      const caseStart = source.indexOf('case "parseInt"');
      expect(caseStart).toBeGreaterThan(-1);
      const block = source.slice(caseStart, caseStart + 300);
      expect(block).toMatch(/isSafeInteger/);
    });
  });

  // =========================================================================
  // #5 MEDIUM — rlm.ts createSolverTools splits context unbounded
  // =========================================================================
  describe("#5 — createSolverTools should cap lines array", () => {
    it("should limit lines from context split", () => {
      const source = readFileSync("src/rlm.ts", "utf-8");
      const fnStart = source.indexOf("function createSolverTools(");
      expect(fnStart).toBeGreaterThan(-1);
      const block = source.slice(fnStart, fnStart + 300);
      // Should cap the main lines array, not just sample slices
      expect(block).toMatch(/MAX_SOLVER_LINES|MAX_CONTEXT_LINES|lines\s*=\s*lines\.slice/i);
    });
  });

  // =========================================================================
  // #6 MEDIUM — grammar-config addCustomGrammar no package validation
  // =========================================================================
  describe("#6 — addCustomGrammar should validate package field", () => {
    it("should check package name format", () => {
      const source = readFileSync("src/config/grammar-config.ts", "utf-8");
      const fnStart = source.indexOf("function addCustomGrammar(");
      expect(fnStart).toBeGreaterThan(-1);
      const block = source.slice(fnStart, fnStart + 800);
      expect(block).toMatch(/grammar\.package|package.*length|package.*test/i);
    });
  });

  // =========================================================================
  // #7 MEDIUM — grammar-config addCustomGrammar no symbols bounds check
  // =========================================================================
  describe("#7 — addCustomGrammar should validate symbols object", () => {
    it("should check symbols object size", () => {
      const source = readFileSync("src/config/grammar-config.ts", "utf-8");
      const fnStart = source.indexOf("function addCustomGrammar(");
      expect(fnStart).toBeGreaterThan(-1);
      const block = source.slice(fnStart, fnStart + 1800);
      expect(block).toMatch(/symbols.*keys|Object\.keys.*symbols|MAX_SYMBOLS/i);
    });
  });

  // =========================================================================
  // #8 MEDIUM — rag/manager.ts recordFailure no code length cap
  // =========================================================================
  describe("#8 — recordFailure should cap code length", () => {
    it("should limit failure code before storing", () => {
      const source = readFileSync("src/rag/manager.ts", "utf-8");
      const fnStart = source.indexOf("recordFailure(");
      expect(fnStart).toBeGreaterThan(-1);
      const block = source.slice(fnStart, fnStart + 400);
      expect(block).toMatch(/code\.length|code\.slice|MAX_CODE/i);
    });
  });

  // =========================================================================
  // #9 MEDIUM — verifier.ts isSafeInvariant should normalize Unicode
  // =========================================================================
  describe("#9 — isSafeInvariant should normalize or reject Unicode bypasses", () => {
    it("should normalize NFKC before keyword checks", () => {
      const source = readFileSync("src/constraints/verifier.ts", "utf-8");
      const fnStart = source.indexOf("function isSafeInvariant(");
      expect(fnStart).toBeGreaterThan(-1);
      const block = source.slice(fnStart, fnStart + 800);
      // Should normalize to NFKC form to catch Unicode confusables
      expect(block).toMatch(/normalize.*NFKC|NFKC.*normalize/);
    });
  });

  // =========================================================================
  // #10 MEDIUM — lc-interpreter split doesn't cap parts length
  // =========================================================================
  describe("#10 — lc-interpreter split should cap parts length", () => {
    it("should limit split result size", () => {
      const source = readFileSync("src/logic/lc-interpreter.ts", "utf-8");
      const caseStart = source.indexOf('case "split"');
      expect(caseStart).toBeGreaterThan(-1);
      const block = source.slice(caseStart, caseStart + 400);
      expect(block).toMatch(/MAX_SPLIT|parts\.length/i);
    });
  });
});
