import { describe, it, expect } from "vitest";
import { FUZZY_SEARCH_IMPL } from "../src/fuzzy-search.js";

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
