/**
 * Tests for BM25 search (ported from Ori-Mnemos)
 */

import { describe, it, expect } from "vitest";
import { tokenize, buildBM25Index, searchBM25 } from "../../src/logic/bm25.js";

describe("BM25 tokenizer", () => {
  it("should lowercase and split on non-alphanumeric", () => {
    const tokens = tokenize("Hello World! Testing 123");
    expect(tokens).toContain("hello");
    expect(tokens).toContain("world");
    expect(tokens).toContain("testing");
    expect(tokens).toContain("123");
  });

  it("should filter stopwords", () => {
    const tokens = tokenize("the quick brown fox and the lazy dog");
    expect(tokens).not.toContain("the");
    expect(tokens).not.toContain("and");
    expect(tokens).toContain("quick");
    expect(tokens).toContain("brown");
    expect(tokens).toContain("fox");
    expect(tokens).toContain("lazy");
    expect(tokens).toContain("dog");
  });

  it("should filter single-character tokens", () => {
    const tokens = tokenize("I a b cd ef");
    expect(tokens).not.toContain("i");
    expect(tokens).not.toContain("b");
    expect(tokens).toContain("cd");
    expect(tokens).toContain("ef");
  });

  it("should return empty array for empty input", () => {
    expect(tokenize("")).toEqual([]);
    expect(tokenize("   ")).toEqual([]);
  });

  it("should handle all-stopword input", () => {
    expect(tokenize("the and is are")).toEqual([]);
  });
});

describe("BM25 index", () => {
  const lines = [
    "ERROR: database connection failed",
    "INFO: retry scheduled for database",
    "ERROR: timeout waiting for response",
    "INFO: connection established successfully",
    "DEBUG: query executed in 5ms",
  ];

  it("should build index with correct doc count", () => {
    const index = buildBM25Index(lines);
    expect(index.docCount).toBe(5);
  });

  it("should track term frequencies per line", () => {
    const index = buildBM25Index(lines);
    // "database" appears in lines 1 and 2
    const dbMap = index.termFreqs.get("database");
    expect(dbMap).toBeDefined();
    expect(dbMap!.size).toBe(2);
    expect(dbMap!.has(1)).toBe(true); // line 1
    expect(dbMap!.has(2)).toBe(true); // line 2
  });

  it("should compute average document length", () => {
    const index = buildBM25Index(lines);
    expect(index.avgDocLength).toBeGreaterThan(0);
  });

  it("should handle empty lines array", () => {
    const index = buildBM25Index([]);
    expect(index.docCount).toBe(0);
    expect(index.avgDocLength).toBe(0);
  });
});

describe("BM25 search", () => {
  const lines = [
    "ERROR: database connection failed",
    "INFO: retry scheduled for database",
    "ERROR: timeout waiting for response",
    "INFO: connection established successfully",
    "DEBUG: query executed in 5ms",
  ];

  it("should return results ranked by relevance", () => {
    const index = buildBM25Index(lines);
    const results = searchBM25("database connection", lines, index);

    expect(results.length).toBeGreaterThan(0);
    // Line 1 has both "database" and "connection" — should rank highest
    expect(results[0].lineNum).toBe(1);
    expect(results[0].score).toBeGreaterThan(0);
  });

  it("should include line content in results", () => {
    const index = buildBM25Index(lines);
    const results = searchBM25("error", lines, index);

    expect(results.length).toBe(2);
    for (const r of results) {
      expect(r.line.toLowerCase()).toContain("error");
      expect(r.lineNum).toBeGreaterThan(0);
    }
  });

  it("should respect limit parameter", () => {
    const index = buildBM25Index(lines);
    const results = searchBM25("database connection error", lines, index, undefined, 2);
    expect(results.length).toBeLessThanOrEqual(2);
  });

  it("should return empty for no matches", () => {
    const index = buildBM25Index(lines);
    const results = searchBM25("xyznonexistent", lines, index);
    expect(results).toEqual([]);
  });

  it("should return empty for stopword-only query", () => {
    const index = buildBM25Index(lines);
    const results = searchBM25("the and is", lines, index);
    expect(results).toEqual([]);
  });

  it("should score multi-term matches higher than single-term", () => {
    const index = buildBM25Index(lines);
    const results = searchBM25("database connection", lines, index);

    // Line 1 has both terms, line 2 only has "database"
    if (results.length >= 2) {
      const line1Score = results.find(r => r.lineNum === 1)?.score ?? 0;
      const line2Score = results.find(r => r.lineNum === 2)?.score ?? 0;
      expect(line1Score).toBeGreaterThan(line2Score);
    }
  });

  it("should handle repeated terms in query", () => {
    const index = buildBM25Index(lines);
    const results = searchBM25("error error error", lines, index);
    // Should still work, just boosting "error" term
    expect(results.length).toBeGreaterThan(0);
  });
});
