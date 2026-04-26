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
  // #1 removed: DANGEROUS_VAR_NAMES deleted with FINAL_VAR marker.

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

});
