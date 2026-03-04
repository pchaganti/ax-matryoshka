/**
 * Audit #95 — 10 security issues
 *
 * 1. HIGH nucleus.ts + base.ts — DANGEROUS_VAR_NAMES missing eval/Function
 * 2. MEDIUM fts5-search.ts — searchWithHighlights highlighted string unbounded growth
 * 3. MEDIUM fts5-search.ts — searchWithSnippets snippet string unbounded growth
 * 4. MEDIUM evalo/evalo.ts — split without limit creates unbounded intermediate array
 * 5. MEDIUM relational/interpreter.ts — add case missing isFinite guard
 * 6. MEDIUM lattice-tool.ts — parseCommand split without array cap
 * 7. MEDIUM lattice-tool.ts — getBindings Object.keys join without pre-cap
 * 8. MEDIUM constraint-resolver.ts — resolve() no recursion depth limit
 * 9. MEDIUM regex/synthesis.ts — nodeToRegex repeat min/max not validated as integer
 * 10. MEDIUM qwen-synthesis.ts — contextLength not validated with isFinite
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";

describe("Audit #95", () => {
  // =========================================================================
  // #1 HIGH — DANGEROUS_VAR_NAMES missing eval/Function
  // =========================================================================
  describe("#1 — DANGEROUS_VAR_NAMES should include eval and Function", () => {
    it("nucleus.ts should block eval/Function in FINAL_VAR", () => {
      const source = readFileSync("src/adapters/nucleus.ts", "utf-8");
      const varNames = source.indexOf("DANGEROUS_VAR_NAMES");
      expect(varNames).toBeGreaterThan(-1);
      const block = source.slice(varNames, varNames + 500);
      expect(block).toMatch(/eval/);
      expect(block).toMatch(/Function/);
    });

    it("base.ts should block eval/Function in FINAL_VAR", () => {
      const source = readFileSync("src/adapters/base.ts", "utf-8");
      const varNames = source.indexOf("DANGEROUS_VAR_NAMES");
      expect(varNames).toBeGreaterThan(-1);
      const block = source.slice(varNames, varNames + 500);
      expect(block).toMatch(/eval/);
      expect(block).toMatch(/Function/);
    });
  });

  // =========================================================================
  // #2 MEDIUM — searchWithHighlights highlighted string unbounded
  // =========================================================================
  describe("#2 — searchWithHighlights should cap highlighted string", () => {
    it("should limit highlighted content length", () => {
      const source = readFileSync("src/persistence/fts5-search.ts", "utf-8");
      const highlightFn = source.indexOf("searchWithHighlights(");
      expect(highlightFn).toBeGreaterThan(-1);
      const block = source.slice(highlightFn, highlightFn + 1000);
      // Should cap result.content or highlighted string length
      expect(block).toMatch(/\.slice\(0,|MAX_HIGHLIGHT|content\.length\s*>/);
    });
  });

  // =========================================================================
  // #3 MEDIUM — searchWithSnippets snippet string unbounded
  // =========================================================================
  describe("#3 — searchWithSnippets should cap snippet string", () => {
    it("should limit snippet content length", () => {
      const source = readFileSync("src/persistence/fts5-search.ts", "utf-8");
      const snippetFn = source.indexOf("searchWithSnippets(");
      expect(snippetFn).toBeGreaterThan(-1);
      const block = source.slice(snippetFn, snippetFn + 600);
      // Should cap snippet string length
      expect(block).toMatch(/\.slice\(0,|MAX_SNIPPET|snippet\.length\s*>/);
    });
  });

  // =========================================================================
  // #4 MEDIUM — evalo split without limit
  // =========================================================================
  describe("#4 — evalo split should use limit parameter", () => {
    it("should pass limit to split to avoid unbounded array", () => {
      const source = readFileSync("src/synthesis/evalo/evalo.ts", "utf-8");
      const splitLine = source.indexOf("str.split(extractor.delim");
      expect(splitLine).toBeGreaterThan(-1);
      const block = source.slice(splitLine, splitLine + 80);
      // Should use split with limit: split(delim, MAX + 1)
      expect(block).toMatch(/\.split\(extractor\.delim,/);
    });
  });

  // =========================================================================
  // #5 MEDIUM — relational add missing isFinite guard
  // =========================================================================
  describe("#5 — relational exprToCode add should have isFinite guard", () => {
    it("should wrap add result in isFinite check like sub/mul/div", () => {
      const source = readFileSync("src/synthesis/relational/interpreter.ts", "utf-8");
      const addCase = source.indexOf('case "add":', source.indexOf("exprToCode"));
      expect(addCase).toBeGreaterThan(-1);
      // Only check the add case block, before the sub case starts
      const subCase = source.indexOf('case "sub":', addCase);
      const block = source.slice(addCase, subCase > addCase ? subCase : addCase + 150);
      // Should have isFinite guard like sub/mul/div cases
      expect(block).toMatch(/isFinite/);
    });
  });

  // =========================================================================
  // #6 MEDIUM — parseCommand split without array cap
  // =========================================================================
  describe("#6 — parseCommand should cap split result", () => {
    it("should limit parts array size from split", () => {
      const source = readFileSync("src/tool/lattice-tool.ts", "utf-8");
      const parseStart = source.indexOf("export function parseCommand");
      expect(parseStart).toBeGreaterThan(-1);
      const block = source.slice(parseStart, parseStart + 400);
      // Should cap parts array after split
      expect(block).toMatch(/\.slice\(0,\s*\d|\.split\(.*,\s*\d/);
    });
  });

  // =========================================================================
  // #7 MEDIUM — getBindings Object.keys join without pre-cap
  // =========================================================================
  describe("#7 — getBindings should cap keys before join", () => {
    it("should slice keys array before joining", () => {
      const source = readFileSync("src/tool/lattice-tool.ts", "utf-8");
      const bindingsStart = source.indexOf("private getBindings()");
      expect(bindingsStart).toBeGreaterThan(-1);
      const block = source.slice(bindingsStart, bindingsStart + 400);
      // Should slice keys before join, not join then slice
      expect(block).toMatch(/Object\.keys\(bindings\)\.slice\(0,/);
    });
  });

  // =========================================================================
  // #8 MEDIUM — constraint-resolver resolve() no depth limit
  // =========================================================================
  describe("#8 — constraint resolver should have recursion depth limit", () => {
    it("should track and cap recursion depth", () => {
      const source = readFileSync("src/logic/constraint-resolver.ts", "utf-8");
      const resolveStart = source.indexOf("function resolve(t:");
      expect(resolveStart).toBeGreaterThan(-1);
      const block = source.slice(resolveStart, resolveStart + 300);
      // Should have depth parameter and check
      expect(block).toMatch(/depth|MAX_RESOLVE_DEPTH|MAX_DEPTH/);
    });
  });

  // =========================================================================
  // #9 MEDIUM — nodeToRegex repeat min/max not validated as integer
  // =========================================================================
  describe("#9 — nodeToRegex should validate repeat bounds as integers", () => {
    it("should check isSafeInteger on min/max before generating quantifier", () => {
      const source = readFileSync("src/synthesis/regex/synthesis.ts", "utf-8");
      const repeatCase = source.indexOf('case "repeat"');
      expect(repeatCase).toBeGreaterThan(-1);
      const block = source.slice(repeatCase, repeatCase + 500);
      // Should validate min/max are safe integers
      expect(block).toMatch(/isSafeInteger|isInteger|Number\.isFinite\(node\.min\)/);
    });
  });

  // =========================================================================
  // #10 MEDIUM — qwen-synthesis.ts contextLength not validated
  // =========================================================================
  describe("#10 — qwen-synthesis buildSystemPrompt should validate contextLength", () => {
    it("should check isFinite on contextLength", () => {
      const source = readFileSync("src/adapters/qwen-synthesis.ts", "utf-8");
      const buildStart = source.indexOf("function buildSystemPrompt");
      expect(buildStart).toBeGreaterThan(-1);
      const block = source.slice(buildStart, buildStart + 300);
      // Should validate contextLength with isFinite
      expect(block).toMatch(/isFinite\(contextLength\)|Number\.isFinite\(contextLength\)/);
    });
  });
});
