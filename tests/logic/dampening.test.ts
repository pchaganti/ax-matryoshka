/**
 * Tests for dampening (gravity dampening ported from Ori-Mnemos)
 */

import { describe, it, expect } from "vitest";
import { extractKeyTerms, applyGravityDampening, type DampenableResult } from "../../src/logic/dampening.js";

describe("extractKeyTerms", () => {
  it("should extract non-stopword terms", () => {
    const terms = extractKeyTerms("the quick brown fox jumps over the lazy dog");
    expect(terms.has("quick")).toBe(true);
    expect(terms.has("brown")).toBe(true);
    expect(terms.has("fox")).toBe(true);
    expect(terms.has("jumps")).toBe(true);
    expect(terms.has("lazy")).toBe(true);
    expect(terms.has("dog")).toBe(true);
    // Stopwords removed
    expect(terms.has("the")).toBe(false);
    expect(terms.has("over")).toBe(false);
  });

  it("should lowercase all terms", () => {
    const terms = extractKeyTerms("ERROR Database Connection");
    expect(terms.has("error")).toBe(true);
    expect(terms.has("database")).toBe(true);
    expect(terms.has("connection")).toBe(true);
    expect(terms.has("ERROR")).toBe(false);
  });

  it("should strip punctuation and split hyphens", () => {
    const terms = extractKeyTerms("error: connection-timeout (retry)");
    expect(terms.has("error")).toBe(true);
    expect(terms.has("connection")).toBe(true);
    expect(terms.has("timeout")).toBe(true);
    expect(terms.has("retry")).toBe(true);
    // Hyphens split into separate terms, not preserved
    expect(terms.has("connection-timeout")).toBe(false);
  });

  it("should filter single-character tokens", () => {
    const terms = extractKeyTerms("a b c database");
    expect(terms.has("database")).toBe(true);
    expect(terms.size).toBe(1);
  });

  it("should return empty set for empty input", () => {
    expect(extractKeyTerms("").size).toBe(0);
    expect(extractKeyTerms("   ").size).toBe(0);
  });

  it("should return empty set for all-stopword input", () => {
    expect(extractKeyTerms("the and is are in of").size).toBe(0);
  });
});

describe("applyGravityDampening", () => {
  const results: DampenableResult[] = [
    { line: "ERROR: database connection failed", lineNum: 1, score: 0.95 },
    { line: "INFO: system started successfully", lineNum: 2, score: 0.80 },
    { line: "DEBUG: initializing modules", lineNum: 3, score: 0.60 },
    { line: "WARNING: low memory detected", lineNum: 4, score: 0.20 },
  ];

  it("should halve score for zero-overlap high-scoring results", () => {
    const dampened = applyGravityDampening(results, "database error");
    // Line 1 has "database" and "error" → overlap → keep score
    expect(dampened[0].score).toBe(0.95);
    // Line 2 has no overlap with "database error" → halve
    expect(dampened[1].score).toBeCloseTo(0.40);
    // Line 3 has no overlap → halve
    expect(dampened[2].score).toBeCloseTo(0.30);
  });

  it("should not dampen results below threshold", () => {
    const dampened = applyGravityDampening(results, "nonexistent term");
    // Line 4 score (0.20) is below default threshold (0.3) → keep
    expect(dampened[3].score).toBe(0.20);
  });

  it("should preserve results with query term overlap", () => {
    const dampened = applyGravityDampening(results, "database");
    // Line 1 contains "database" → no dampening
    expect(dampened[0].score).toBe(0.95);
  });

  it("should handle empty query", () => {
    const dampened = applyGravityDampening(results, "");
    // No terms → no dampening
    expect(dampened[0].score).toBe(0.95);
    expect(dampened[1].score).toBe(0.80);
  });

  it("should handle all-stopword query", () => {
    const dampened = applyGravityDampening(results, "the and is");
    // No key terms → no dampening
    expect(dampened[0].score).toBe(0.95);
  });

  it("should respect custom threshold", () => {
    // Threshold 0.9 → only line 1 (0.95) is above
    const dampened = applyGravityDampening(results, "nonexistent", 0.9);
    expect(dampened[0].score).toBeCloseTo(0.475); // 0.95 * 0.5
    expect(dampened[1].score).toBe(0.80); // below threshold
  });

  it("should respect custom penalty", () => {
    const dampened = applyGravityDampening(results, "nonexistent", 0.3, 0.25);
    // Line 1 (0.95) dampened by 0.25x
    expect(dampened[0].score).toBeCloseTo(0.2375);
  });

  it("should handle empty results array", () => {
    expect(applyGravityDampening([], "query")).toEqual([]);
  });

  it("should only need one term to overlap", () => {
    const dampened = applyGravityDampening(results, "database unicorn magic");
    // Line 1 has "database" → overlap exists → no dampening
    expect(dampened[0].score).toBe(0.95);
  });
});
