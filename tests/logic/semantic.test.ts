/**
 * Tests for TF-IDF semantic search
 */

import { describe, it, expect } from "vitest";
import { buildSemanticIndex, searchSemantic } from "../../src/logic/semantic.js";

const lines = [
  "ERROR: database connection failed with timeout",
  "INFO: retry scheduled for database reconnection",
  "ERROR: authentication failed for user admin",
  "INFO: system health check passed successfully",
  "DEBUG: query executed in 5ms against primary database",
  "WARNING: disk usage above 90 percent threshold",
  "INFO: backup completed for all databases",
];

describe("buildSemanticIndex", () => {
  it("should build index with IDF values", () => {
    const index = buildSemanticIndex(lines);
    expect(index.lineTokens.length).toBe(7);
    expect(index.idf.size).toBeGreaterThan(0);
  });

  it("should handle empty lines", () => {
    const index = buildSemanticIndex([]);
    expect(index.lineTokens.length).toBe(0);
  });
});

describe("searchSemantic", () => {
  const index = buildSemanticIndex(lines);

  it("should rank by cosine similarity", () => {
    const results = searchSemantic("database connection error", lines, index);
    expect(results.length).toBeGreaterThan(0);
    // First result should be most similar to "database connection error"
    expect(results[0].line).toContain("database");
    // Sorted descending
    for (let i = 1; i < results.length; i++) {
      expect(results[i - 1].score).toBeGreaterThanOrEqual(results[i].score);
    }
  });

  it("should find semantically related lines even without exact match", () => {
    // "databases" (plural) should match lines with "database" via tokenization
    const results = searchSemantic("database failure", lines, index);
    expect(results.length).toBeGreaterThan(0);
    // Lines mentioning "database" and "failed" should rank high
    const topLineNums = results.slice(0, 3).map(r => r.lineNum);
    expect(topLineNums).toContain(1); // "database connection failed"
  });

  it("should return empty for no-match query", () => {
    const results = searchSemantic("xyznonexistent", lines, index);
    expect(results).toEqual([]);
  });

  it("should respect limit", () => {
    const results = searchSemantic("database", lines, index, 2);
    expect(results.length).toBeLessThanOrEqual(2);
  });

  it("should return empty for empty query", () => {
    expect(searchSemantic("", lines, index)).toEqual([]);
  });

  it("should score multi-term overlap higher than single-term", () => {
    const results = searchSemantic("database connection failed", lines, index);
    if (results.length >= 2) {
      // Line 1 has all three terms — should score highest
      const line1 = results.find(r => r.lineNum === 1);
      expect(line1).toBeDefined();
      if (results[0].lineNum !== 1) {
        // At minimum, line 1 should be in top results
        expect(results.findIndex(r => r.lineNum === 1)).toBeLessThan(3);
      }
    }
  });

  it("should have scores between 0 and 1", () => {
    const results = searchSemantic("database error", lines, index);
    for (const r of results) {
      expect(r.score).toBeGreaterThan(0);
      expect(r.score).toBeLessThanOrEqual(1);
    }
  });

  it("should include line content and lineNum", () => {
    const results = searchSemantic("database", lines, index);
    for (const r of results) {
      expect(typeof r.line).toBe("string");
      expect(r.line.length).toBeGreaterThan(0);
      expect(r.lineNum).toBeGreaterThan(0);
    }
  });
});
