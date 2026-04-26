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
  // =========================================================================
  // #1 MEDIUM — analyzeCharacters minLen not capped
  // =========================================================================
  describe("#1 — analyzeCharacters should cap minLen", () => {
    it("should limit per-position iteration", () => {
      const source = readFileSync("src/synthesis/regex/synthesis.ts", "utf-8");
      const funcStart = source.indexOf("export function analyzeCharacters");
      expect(funcStart).toBeGreaterThan(-1);
      const block = source.slice(funcStart, funcStart + 600);
      // Should cap minLen to prevent excessive per-position iteration
      expect(block).toMatch(/MAX_CHAR_ANALYSIS|minLen\s*>\s*\d|Math\.min\(minLen/);
    });
  });

  // =========================================================================
  // #2 MEDIUM — nodeToRegex unbounded recursion
  // =========================================================================
  describe("#2 — nodeToRegex should have depth limit", () => {
    it("should track and cap recursion depth", () => {
      const source = readFileSync("src/synthesis/regex/synthesis.ts", "utf-8");
      const funcStart = source.indexOf("export function nodeToRegex");
      expect(funcStart).toBeGreaterThan(-1);
      const block = source.slice(funcStart, funcStart + 400);
      // Should accept and check a depth parameter
      expect(block).toMatch(/depth|MAX_REGEX_DEPTH|MAX_DEPTH/);
    });
  });

  // =========================================================================
  // #3 MEDIUM — exprToCode unbounded recursion
  // =========================================================================
  describe("#3 — exprToCode should have depth limit", () => {
    it("should track and cap recursion depth", () => {
      const source = readFileSync("src/synthesis/relational/interpreter.ts", "utf-8");
      const funcStart = source.indexOf("export function exprToCode");
      expect(funcStart).toBeGreaterThan(-1);
      const block = source.slice(funcStart, funcStart + 400);
      // Should accept and check a depth parameter
      expect(block).toMatch(/depth|MAX_CODE_DEPTH|MAX_DEPTH/);
    });
  });

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
  // #8 MEDIUM — classify examples not length-capped
  // =========================================================================
  describe("#8 — classify should cap term.examples length", () => {
    it("should limit number of examples", () => {
      const source = readFileSync("src/logic/lc-interpreter.ts", "utf-8");
      const classifyStart = source.indexOf('case "classify"');
      expect(classifyStart).toBeGreaterThan(-1);
      const block = source.slice(classifyStart, classifyStart + 400);
      // Should cap examples length
      expect(block).toMatch(/MAX_CLASSIFY|examples\.slice\(0,|examples\.length\s*>/);
    });
  });

  // =========================================================================
  // #9 MEDIUM — synthesizeRegex example strings not length-capped
  // =========================================================================
  describe("#9 — synthesizeRegex should cap individual example string length", () => {
    it("should validate example string lengths", () => {
      const source = readFileSync("src/synthesis/regex/synthesis.ts", "utf-8");
      const funcStart = source.indexOf("export function synthesizeRegex");
      expect(funcStart).toBeGreaterThan(-1);
      const block = source.slice(funcStart, funcStart + 500);
      // Should check/filter individual example string length
      expect(block).toMatch(/MAX_EXAMPLE_LENGTH|\.length\s*>\s*\d|\.filter.*\.length/);
    });
  });

  // =========================================================================
  // #10 MEDIUM — exprToCode replace $ not escaped
});
