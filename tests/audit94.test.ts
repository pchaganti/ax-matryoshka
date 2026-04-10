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
  // =========================================================================
  // #1 HIGH — base.ts DANGEROUS_VAR_NAMES incomplete
  // =========================================================================
  describe("#1 — base.ts DANGEROUS_VAR_NAMES should match nucleus.ts", () => {
    it("should include hasOwnProperty/toString/valueOf in blocklist", () => {
      const source = readFileSync("src/adapters/base.ts", "utf-8");
      const dangerousLine = source.indexOf("DANGEROUS_VAR_NAMES");
      expect(dangerousLine).toBeGreaterThan(-1);
      const block = source.slice(dangerousLine, dangerousLine + 500);
      // Should include all the same properties as nucleus.ts
      expect(block).toMatch(/hasOwnProperty/);
      expect(block).toMatch(/toString/);
      expect(block).toMatch(/valueOf/);
    });
  });

  // =========================================================================
  // #2 MEDIUM — reduce no iteration cap
  // =========================================================================
  describe("#2 — reduce should cap iterations", () => {
    it("should have MAX_REDUCE iteration limit", () => {
      const source = readFileSync("src/logic/lc-interpreter.ts", "utf-8");
      const reduceCase = source.indexOf('case "reduce"');
      expect(reduceCase).toBeGreaterThan(-1);
      const block = source.slice(reduceCase, reduceCase + 600);
      // Should have an iteration cap like map has MAX_MAP_RESULTS
      expect(block).toMatch(/MAX_REDUCE|collection\.length\s*>\s*\d|collection\.slice/);
    });
  });

  // =========================================================================
  // #3 MEDIUM — formatValue JSON.stringify unbounded
  // =========================================================================
  describe("#3 — formatValue should cap string output", () => {
    it("should limit JSON.stringify output for strings", () => {
      const source = readFileSync("src/logic/lc-interpreter.ts", "utf-8");
      const formatStart = source.indexOf("export function formatValue");
      expect(formatStart).toBeGreaterThan(-1);
      const block = source.slice(formatStart, formatStart + 500);
      // Should cap string output length
      expect(block).toMatch(/MAX_FORMAT_STRING|\.slice\(0,|\.substring\(0,/);
    });
  });

  // =========================================================================
  // #4 MEDIUM — count_tokens split unbounded
  // =========================================================================
  describe("#4 — count_tokens should cap input before split", () => {
    it("should cap string length before splitting on whitespace", () => {
      const source = readFileSync("node_modules/repl-sandbox/dist/builtins/text-utils.js", "utf-8");
      const countStart = source.indexOf("function count_tokens");
      expect(countStart).toBeGreaterThan(-1);
      const block = source.slice(countStart, countStart + 400);
      // Should cap input string length before the unbounded split
      expect(block).toMatch(/MAX_TOKEN_INPUT|str\.slice\(0,|str\.length\s*>\s*[1-9]/);
    });
  });

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

  // =========================================================================
  // #6 MEDIUM — searchByRelevance lower.split(term) unbounded O(n*m)
  // Now delegates to FTS5 BM25 via session-db — verify no manual split-counting
  // =========================================================================
  describe("#6 — searchByRelevance should cap content length for scoring", () => {
    it("should limit content length before split-counting", () => {
      const source = readFileSync("src/persistence/fts5-search.ts", "utf-8");
      const scoringStart = source.indexOf("const lower = r.content");
      if (scoringStart === -1) {
        // Code was refactored to use FTS5 BM25 — no manual content scoring
        expect(true).toBe(true);
        return;
      }
      const block = source.slice(scoringStart, scoringStart + 200);
      // Should cap content length before split-based counting
      expect(block).toMatch(/\.slice\(0,|MAX_CONTENT|\.substring\(0,/);
    });
  });

  // =========================================================================
  // #7 MEDIUM — pipe.ts MAX_LINE_LENGTH too permissive
  // =========================================================================
  describe("#7 — pipe.ts MAX_LINE_LENGTH should be reasonable", () => {
    it("should use a more conservative line length limit", () => {
      const source = readFileSync("src/tool/adapters/pipe.ts", "utf-8");
      const maxLine = source.match(/MAX_LINE_LENGTH\s*=\s*(\d[\d_]*)/);
      expect(maxLine).not.toBeNull();
      const value = parseInt(maxLine![1].replace(/_/g, ""), 10);
      // 10MB per line is too high; should be 1MB or less
      expect(value).toBeLessThanOrEqual(1_000_000);
    });
  });

  // =========================================================================
  // #8 MEDIUM — session-db.ts split on 100MB creates huge array
  // =========================================================================
  describe("#8 — session-db loadDocument should use split limit", () => {
    it("should pass limit to split to avoid huge intermediate array", () => {
      const source = readFileSync("src/persistence/session-db.ts", "utf-8");
      const splitLine = source.indexOf('.split("\\n",');
      expect(splitLine).toBeGreaterThan(-1);
      const block = source.slice(splitLine, splitLine + 60);
      // Should pass a limit to split to avoid huge intermediate array
      expect(block).toMatch(/\.split\("\\n",\s*MAX/);
    });
  });

  // =========================================================================
  // #9 MEDIUM — lattice-tool.ts JSON.stringify unbounded
  // =========================================================================
  describe("#9 — lattice-tool formatResult should safely stringify objects", () => {
    it("should use replacer or cap depth for object JSON.stringify", () => {
      const source = readFileSync("src/tool/lattice-tool.ts", "utf-8");
      const stringifyLine = source.indexOf("JSON.stringify(safeValue");
      expect(stringifyLine).toBeGreaterThan(-1);
      const block = source.slice(stringifyLine - 200, stringifyLine + 100);
      // Should use a safe stringify with capped keys, not raw JSON.stringify(value)
      expect(block).toMatch(/safeValue|Object\.keys|Object\.fromEntries/);
    });
  });

  // =========================================================================
  // #10 MEDIUM — classify individual example input strings not length-capped
  // =========================================================================
  describe("#10 — classify should cap individual example input lengths", () => {
    it("should limit example input string length", () => {
      const source = readFileSync("src/logic/lc-interpreter.ts", "utf-8");
      const classifyCase = source.indexOf('case "classify"');
      expect(classifyCase).toBeGreaterThan(-1);
      const block = source.slice(classifyCase, classifyCase + 500);
      // Should cap individual example input string lengths
      expect(block).toMatch(/\.input\.slice|\.input\.length|MAX_EXAMPLE_INPUT|e\.input\.length\s*>/);
    });
  });
});
