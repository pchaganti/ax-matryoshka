import { describe, it, expect } from "vitest";
import { FUZZY_SEARCH_IMPL } from "../src/fuzzy-search.js";
import { readFileSync } from "fs";

function loadFuzzyModule() {
  const fn = new Function(FUZZY_SEARCH_IMPL + "\nreturn { fuzzySearch, fuzzyScore };");
  return fn();
}

describe("fuzzy search", () => {
  describe("fuzzyScore edit distance", () => {
    const { fuzzyScore } = loadFuzzyModule();
    const maxDist = 10;

    it("should return 0 for exact match", () => {
      expect(fuzzyScore("hello", "hello", maxDist)).toBe(0);
    });

    it("should count substitutions correctly", () => {
      expect(fuzzyScore("hallo", "hello", maxDist)).toBe(1);
    });

    it("should count remaining pattern chars as errors when text is shorter", () => {
      const score = fuzzyScore("abc", "abcdef", maxDist);
      expect(score).toBeGreaterThanOrEqual(3);
    });

    it("should count remaining pattern chars even when partial match at start", () => {
      const score = fuzzyScore("hello", "hello world", maxDist);
      expect(score).toBeGreaterThanOrEqual(6);
    });

    it("should not undercount when pattern is longer than text window", () => {
      const score = fuzzyScore("test", "testing", maxDist);
      expect(score).toBeGreaterThanOrEqual(3);
    });
  });
});

// =====================================================================
// Source-pattern checks (from audits)
// =====================================================================
describe("Source-pattern checks (from audits)", () => {
  // from tests/audit52.test.ts #10 — fuzzy-search fuzzySearch should clamp limit
  describe("#10 — fuzzy-search fuzzySearch should clamp limit", () => {
      it("should enforce a max limit on results", () => {
        const source = readFileSync("src/fuzzy-search.ts", "utf-8");
        const searchFn = source.match(/function fuzzySearch[\s\S]*?results\.slice\(0,\s*\w+\)/);
        expect(searchFn).not.toBeNull();
        expect(searchFn![0]).toMatch(/Math\.min|Math\.max|clamp|MAX_LIMIT/);
      });
    });

});
