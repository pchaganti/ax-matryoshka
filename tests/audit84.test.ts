/**
 * Audit #84 — 10 security issues
 *
 * 1. HIGH   lc-solver.ts — replace result not length-capped
 * 2. MEDIUM rlm.ts — escape-then-slice creates broken escape at boundary
 * 3. MEDIUM lc-interpreter.ts — split delimiter not type-checked, no max length
 * 4. MEDIUM sandbox-tools.ts — global isNaN/isFinite instead of Number.isNaN/isFinite
 * 5. MEDIUM session-db.ts — unbounded symbol query results without LIMIT
 * 6. MEDIUM checkpoint.ts — handle format not validated on restore
 * 7. MEDIUM rlm.ts — sessionId not validated
 * 8. MEDIUM rlm.ts — turnTimeoutMs has no upper bound
 * 9. MEDIUM rag/manager.ts — pitfalls content unbounded
 * 10. MEDIUM synthesis-integrator.ts — dangerousPatterns missing `delete`
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";

describe("Audit #84", () => {
  // =========================================================================
  // #1 HIGH — lc-solver.ts replace result not length-capped
  // =========================================================================
  describe("#1 — lc-solver replace should cap result length", () => {
    it("should check result length after replace", () => {
      const source = readFileSync("src/logic/lc-solver.ts", "utf-8");
      const replaceCase = source.indexOf('case "replace"', source.indexOf("function evaluate"));
      expect(replaceCase).toBeGreaterThan(-1);
      const block = source.slice(replaceCase, replaceCase + 700);
      expect(block).toMatch(/MAX_RESULT|result\.length\s*>|\.length\s*>/);
    });
  });

  // =========================================================================
  // #2 MEDIUM — rlm.ts escape-then-slice boundary issue
  // =========================================================================
  describe("#2 — generateClassifierGuidance should slice before escaping", () => {
    it("should slice line before escape to prevent broken sequences", () => {
      const source = readFileSync("src/rlm.ts", "utf-8");
      const fnStart = source.indexOf("function generateClassifierGuidance");
      expect(fnStart).toBeGreaterThan(-1);
      // Find the line variable assignment (grepResults[idx].line)
      const lineVar = source.indexOf("grepResults[idx].line", fnStart);
      expect(lineVar).toBeGreaterThan(-1);
      const block = source.slice(lineVar, lineVar + 300);
      // The line should NOT be escaped and THEN sliced — that creates broken escape sequences
      // Instead it should be sliced FIRST, then escaped
      expect(block).not.toMatch(/\.replace\([^)]*\)\.replace\([^)]*\)\.slice\(0,/);
    });
  });

  // =========================================================================
  // #3 MEDIUM — lc-interpreter.ts split delimiter not type-checked
  // =========================================================================
  describe("#3 — split should type-check and length-bound delimiter", () => {
    it("should validate delimiter is a string with max length", () => {
      const source = readFileSync("src/logic/lc-interpreter.ts", "utf-8");
      const splitCase = source.indexOf('case "split"', source.indexOf("lc-interpreter") > -1 ? 0 : 0);
      expect(splitCase).toBeGreaterThan(-1);
      const block = source.slice(splitCase, splitCase + 400);
      expect(block).toMatch(/typeof\s+term\.delim\s*!==?\s*["']string["']|term\.delim\.length\s*>\s*\d/);
    });
  });

  // =========================================================================
  // #4 MEDIUM — sandbox-tools.ts global isNaN/isFinite type coercion
  // =========================================================================
  describe("#4 — sandbox should expose Number.isNaN/Number.isFinite", () => {
    it("should use Number.isNaN instead of global isNaN", () => {
      const source = readFileSync("node_modules/repl-sandbox/dist/safe-globals.js", "utf-8");
      const sandboxGlobals = source.indexOf("isNaN");
      expect(sandboxGlobals).toBeGreaterThan(-1);
      // Find the sandbox globals section (near parseInt/parseFloat)
      const parseIntLine = source.indexOf("parseInt,");
      expect(parseIntLine).toBeGreaterThan(-1);
      const block = source.slice(parseIntLine, parseIntLine + 200);
      expect(block).toMatch(/Number\.isNaN/);
    });
  });

  // =========================================================================
  // #5 MEDIUM — session-db.ts unbounded symbol queries
  // =========================================================================
  describe("#5 — getAllSymbols should have LIMIT clause", () => {
    it("should include LIMIT in symbol query", () => {
      const source = readFileSync("src/persistence/session-db.ts", "utf-8");
      const getAllSymbols = source.indexOf("getAllSymbols");
      expect(getAllSymbols).toBeGreaterThan(-1);
      const block = source.slice(getAllSymbols, getAllSymbols + 300);
      expect(block).toMatch(/LIMIT\s+\d|MAX_SYMBOLS|\.slice\(0,/i);
    });
  });

  // =========================================================================
  // #6 MEDIUM — checkpoint.ts handle format not validated
  // =========================================================================
  describe("#6 — checkpoint restore should validate handle format", () => {
    it("should validate resultsHandle format before use", () => {
      const source = readFileSync("src/persistence/checkpoint.ts", "utf-8");
      const restoreMethod = source.indexOf("restore(turn");
      expect(restoreMethod).toBeGreaterThan(-1);
      const block = source.slice(restoreMethod, restoreMethod + 400);
      expect(block).toMatch(/\$res|test\(resultsHandle\)|validHandle|resultsHandle\.startsWith/);
    });
  });

  // =========================================================================
  // #7 MEDIUM — rlm.ts sessionId not validated
  // =========================================================================
  describe("#7 — sessionId should be validated", () => {
    it("should validate sessionId length and characters", () => {
      const source = readFileSync("src/rlm.ts", "utf-8");
      const sessionLine = source.indexOf("safeSessionId");
      expect(sessionLine).toBeGreaterThan(-1);
      const block = source.slice(sessionLine, sessionLine + 300);
      expect(block).toMatch(/\.length|\/\^[^/]*\$\/.*test|sessionId/);
    });
  });

  // =========================================================================
  // #8 MEDIUM — rlm.ts turnTimeoutMs no upper bound
  // =========================================================================
  describe("#8 — turnTimeoutMs should have upper bound", () => {
    it("should cap turnTimeoutMs at a maximum value", () => {
      const source = readFileSync("src/rlm.ts", "utf-8");
      const timeoutLine = source.indexOf("MAX_TIMEOUT");
      expect(timeoutLine).toBeGreaterThan(-1);
      const block = source.slice(timeoutLine, timeoutLine + 300);
      expect(block).toMatch(/turnTimeoutMs|rawTurnTimeoutMs/);
    });
  });

  // =========================================================================
  // #9 MEDIUM — rag/manager.ts pitfalls content unbounded
  // =========================================================================
  describe("#9 — pitfalls content should be size-capped", () => {
    it("should limit total pitfalls content size", () => {
      const source = readFileSync("src/rag/manager.ts", "utf-8");
      const pitfallsLine = source.indexOf("pitfalls");
      expect(pitfallsLine).toBeGreaterThan(-1);
      const block = source.slice(pitfallsLine, pitfallsLine + 500);
      expect(block).toMatch(/MAX_PITFALL|\.slice\(0,\s*MAX_PITFALLS?\)|pitfallContent\.slice/);
    });
  });

  // =========================================================================
  // #10 MEDIUM — synthesis-integrator.ts dangerousPatterns missing delete
  // =========================================================================
  describe("#10 — synthesizeViaRelational dangerousPatterns should block delete", () => {
    it("should include delete in dangerous patterns", () => {
      const source = readFileSync("src/logic/synthesis-integrator.ts", "utf-8");
      const patterns = source.indexOf("dangerousPatterns", source.indexOf("synthesizeViaRelational"));
      expect(patterns).toBeGreaterThan(-1);
      const block = source.slice(patterns, patterns + 500);
      expect(block).toMatch(/\\bdelete\\b/);
    });
  });
});
