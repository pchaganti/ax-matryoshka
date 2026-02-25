/**
 * Audit #31 — TDD tests
 *
 * 5 issues: 3 High, 2 Medium
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";

describe("Audit #31", () => {
  // =============================================
  // Issue #1 — High: findDistinguishingPattern returns unescaped words as regex
  // =============================================
  describe("#1 — findDistinguishingPattern regex escaping", () => {
    it("should escape regex metacharacters in fallback word patterns", () => {
      const source = readFileSync("src/logic/lc-solver.ts", "utf-8");
      // Find the fallback section that returns words from true examples
      const fallback = source.match(/Fallback: use the most common word[\s\S]*?return null;\s*\}/);
      expect(fallback).not.toBeNull();
      // The returned word should be escaped for safe use in regex
      expect(fallback![0]).toMatch(/escapeRegex|replace\(|escape/i);
    });
  });

  // =============================================
  // Issue #2 — High: checkpoint restore doesn't clear RESULTS
  // =============================================
  describe("#2 — checkpoint restore clears stale RESULTS", () => {
    it("should clear RESULTS when checkpoint has no RESULTS binding", () => {
      const source = readFileSync("src/persistence/checkpoint.ts", "utf-8");
      const restoreMethod = source.match(/restore\(turn: number\)[\s\S]*?return true;\s*\}/);
      expect(restoreMethod).not.toBeNull();
      // Should clear RESULTS when checkpoint doesn't have it
      expect(restoreMethod![0]).toMatch(/clearResults|setResults\(null\)|resultsHandle\s*=\s*null/);
    });
  });

  // =============================================
  // Issue #3 — High: regex groups can contain undefined
  // =============================================
  describe("#3 — nucleus-engine groups filtering", () => {
    it("should filter undefined from regex groups", () => {
      const source = readFileSync("src/engine/nucleus-engine.ts", "utf-8");
      // Find the grep function's results.push call
      const pushSection = source.match(/groups:\s*match\.slice\(1\)[^,}]*/);
      expect(pushSection).not.toBeNull();
      // Should filter out undefined values
      expect(pushSection![0]).toMatch(/filter|\.map\(.*\?\?|as string/);
    });
  });

  // =============================================
  // Issue #4 — Medium: match/split type inference wrong
  // =============================================
  describe("#4 — type inference match/split nullable", () => {
    it("match should not infer as plain string since it can return null", () => {
      const source = readFileSync("src/logic/type-inference.ts", "utf-8");
      // Find the match case
      const matchCase = source.match(/case "match":[\s\S]*?return \{[^}]+\}/);
      expect(matchCase).not.toBeNull();
      // Should NOT return tag: "string" — should be "any" since match can return null
      expect(matchCase![0]).not.toMatch(/tag:\s*"string"/);
    });

    it("split should not infer as plain string since it can return null", () => {
      const source = readFileSync("src/logic/type-inference.ts", "utf-8");
      const splitCase = source.match(/case "split":[\s\S]*?return \{[^}]+\}/);
      expect(splitCase).not.toBeNull();
      // split returns array of strings, not a single string
      expect(splitCase![0]).not.toMatch(/tag:\s*"string"\s*\}/);
    });
  });

  // =============================================
  // Issue #5 — Medium: rlm.ts double-escaping in classify guidance
  // =============================================
  describe("#5 — rlm.ts classify guidance escaping", () => {
    it("should not double-escape backslashes from grep results", () => {
      const source = readFileSync("src/rlm.ts", "utf-8");
      // Find the buildClassifyGuidance function's escaping section
      const escapeSection = source.match(/Escape.*quotes for S-expression[\s\S]*?examples\.push/);
      expect(escapeSection).not.toBeNull();
      // Should only escape double quotes, not backslashes (lines are already plain text)
      expect(escapeSection![0]).not.toMatch(/replace\(\/\\\\\/g/);
    });
  });
});
