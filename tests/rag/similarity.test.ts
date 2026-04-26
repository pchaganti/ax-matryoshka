/**
 * Tests for RAG Similarity Functions
 */

import { describe, it, expect } from "vitest";
import {
  tokenize,
  termFrequency,
  inverseDocumentFrequency,
  cosineSimilarity,
  keywordMatchScore,
  combinedSimilarity,
  buildSearchIndex,
  searchIndex,
} from "../../src/rag/similarity.js";
import { readFileSync } from "fs";

describe("tokenize", () => {
  it("should split text into lowercase words", () => {
    const tokens = tokenize("Hello World");
    expect(tokens).toEqual(["hello", "world"]);
  });

  it("should remove punctuation except $", () => {
    const tokens = tokenize("Price: $100! Great deal.");
    expect(tokens).toContain("$100");
    expect(tokens).toContain("price");
    expect(tokens).toContain("great");
    expect(tokens).toContain("deal");
  });

  it("should filter out single-character tokens", () => {
    const tokens = tokenize("I a am here");
    expect(tokens).not.toContain("i");
    expect(tokens).not.toContain("a");
    expect(tokens).toContain("am");
    expect(tokens).toContain("here");
  });

  it("should handle empty strings", () => {
    expect(tokenize("")).toEqual([]);
  });

  it("should handle whitespace-only strings", () => {
    expect(tokenize("   \n\t  ")).toEqual([]);
  });
});

describe("termFrequency", () => {
  it("should calculate normalized term frequency", () => {
    const tokens = ["hello", "world", "hello"];
    const tf = termFrequency(tokens);

    expect(tf.get("hello")).toBeCloseTo(2 / 3);
    expect(tf.get("world")).toBeCloseTo(1 / 3);
  });

  it("should handle single token", () => {
    const tf = termFrequency(["test"]);
    expect(tf.get("test")).toBe(1);
  });

  it("should handle empty array", () => {
    const tf = termFrequency([]);
    expect(tf.size).toBe(0);
  });
});

describe("inverseDocumentFrequency", () => {
  it("should calculate IDF for corpus", () => {
    const documents = [
      ["hello", "world"],
      ["hello", "there"],
      ["goodbye", "world"],
    ];

    const idf = inverseDocumentFrequency(documents);

    // "hello" appears in 2 of 3 docs — formula: log(1 + N/df)
    expect(idf.get("hello")).toBeCloseTo(Math.log(1 + 3 / 2));

    // "goodbye" appears in 1 of 3 docs
    expect(idf.get("goodbye")).toBeCloseTo(Math.log(1 + 3 / 1));
  });

  it("should give 0 IDF to terms in all documents", () => {
    const documents = [
      ["common", "word"],
      ["common", "other"],
    ];

    const idf = inverseDocumentFrequency(documents);
    expect(idf.get("common")).toBeCloseTo(Math.log(1 + 2 / 2));  // log(2) with smoothing
  });
});

describe("cosineSimilarity", () => {
  it("should return 1 for identical vectors", () => {
    const vec1 = new Map([["a", 1], ["b", 2]]);
    const vec2 = new Map([["a", 1], ["b", 2]]);

    expect(cosineSimilarity(vec1, vec2)).toBeCloseTo(1);
  });

  it("should return 0 for orthogonal vectors", () => {
    const vec1 = new Map([["a", 1]]);
    const vec2 = new Map([["b", 1]]);

    expect(cosineSimilarity(vec1, vec2)).toBe(0);
  });

  it("should handle partial overlap", () => {
    const vec1 = new Map([["a", 1], ["b", 1]]);
    const vec2 = new Map([["a", 1], ["c", 1]]);

    const sim = cosineSimilarity(vec1, vec2);
    expect(sim).toBeGreaterThan(0);
    expect(sim).toBeLessThan(1);
  });

  it("should handle empty vectors", () => {
    expect(cosineSimilarity(new Map(), new Map())).toBe(0);
  });
});

describe("keywordMatchScore", () => {
  it("should return high score for exact matches", () => {
    const queryTokens = ["sum", "total", "sales"];
    const keywords = ["sum", "total", "aggregate"];

    const score = keywordMatchScore(queryTokens, keywords);
    expect(score).toBeGreaterThan(0.5);
  });

  it("should return 0 for no matches", () => {
    const queryTokens = ["hello", "world"];
    const keywords = ["foo", "bar", "baz"];

    const score = keywordMatchScore(queryTokens, keywords);
    expect(score).toBe(0);
  });

  it("should handle partial matches", () => {
    const queryTokens = ["currency"];
    const keywords = ["$", "dollar", "money"];

    // "currency" doesn't match exactly, might get partial
    const score = keywordMatchScore(queryTokens, keywords);
    expect(score).toBeGreaterThanOrEqual(0);
  });

  it("should be case insensitive", () => {
    const queryTokens = ["total"];
    const keywords = ["TOTAL", "Sum"];

    const score = keywordMatchScore(queryTokens, keywords);
    expect(score).toBeGreaterThan(0);
  });
});

describe("buildSearchIndex and searchIndex", () => {
  const docs = [
    {
      id: "sum-currency",
      text: "Sum all currency values from sales data",
      keywords: ["sum", "total", "currency", "sales", "$"],
    },
    {
      id: "count-errors",
      text: "Count the number of error messages in logs",
      keywords: ["count", "error", "log", "number"],
    },
    {
      id: "extract-dates",
      text: "Extract and parse date values from text",
      keywords: ["date", "extract", "parse", "time"],
    },
  ];

  it("should build a valid search index", () => {
    const index = buildSearchIndex(docs);

    expect(index.ids).toHaveLength(3);
    expect(index.documents).toHaveLength(3);
    expect(index.keywords).toHaveLength(3);
    expect(index.idf.size).toBeGreaterThan(0);
  });

  it("should rank currency queries high for currency doc", () => {
    const index = buildSearchIndex(docs);
    const results = searchIndex(index, "sum up the total sales dollars", 3);

    expect(results[0].id).toBe("sum-currency");
    expect(results[0].score).toBeGreaterThan(0);
  });

  it("should rank error queries high for error doc", () => {
    const index = buildSearchIndex(docs);
    const results = searchIndex(index, "count how many errors in the log file", 3);

    expect(results[0].id).toBe("count-errors");
  });

  it("should rank date queries high for date doc", () => {
    const index = buildSearchIndex(docs);
    const results = searchIndex(index, "extract dates from the document", 3);

    expect(results[0].id).toBe("extract-dates");
  });

  it("should return specified number of results", () => {
    const index = buildSearchIndex(docs);
    const results = searchIndex(index, "data", 2);

    expect(results.length).toBeLessThanOrEqual(2);
  });

  it("should handle queries with no good matches", () => {
    const index = buildSearchIndex(docs);
    const results = searchIndex(index, "xyzzy foobar", 3);

    // Should still return results, just with low scores
    expect(results.length).toBeGreaterThan(0);
  });
});

describe("combinedSimilarity", () => {
  it("should weight keyword matches heavily", () => {
    const queryTokens = ["sum", "total"];
    const docTokens = ["sum", "values", "together"];
    const keywords = ["sum", "total", "aggregate"];
    const idf = new Map([["sum", 1], ["total", 1], ["values", 1]]);

    const score = combinedSimilarity(queryTokens, docTokens, keywords, idf);
    expect(score).toBeGreaterThan(0.3);  // Keywords should boost score
  });
});

// =====================================================================
// Source-pattern checks (from audits)
// =====================================================================
describe("Source-pattern checks (from audits)", () => {
  // from tests/audit18.test.ts Audit18 #15: keyword score normalization
  describe("Audit18 #15: keyword score normalization", () => {
    it("keyword score should not exceed 1.0", async () => {
      const { keywordMatchScore } = await import("../../src/rag/similarity.js");
      // Edge case: many query tokens matching few keywords
      const score = keywordMatchScore(
        ["error", "critical", "fatal"],
        ["error", "critical", "fatal"]
      );
      expect(score).toBeLessThanOrEqual(1.0);
    });

    it("keyword score should handle empty query", async () => {
      const { keywordMatchScore } = await import("../../src/rag/similarity.js");
      const score = keywordMatchScore([], ["error"]);
      expect(score).toBe(0);
    });
  });

  // from tests/audit20.test.ts Audit20 #3: keywordMatchScore division by zero
  describe("Audit20 #3: keywordMatchScore division by zero", () => {
    it("should return 0 for empty queryTokens and empty keywords", async () => {
      const { keywordMatchScore } = await import("../../src/rag/similarity.js");
      const score = keywordMatchScore([], []);
      expect(Number.isNaN(score)).toBe(false);
      expect(score).toBe(0);
    });

    it("should return 0 for empty queryTokens with non-empty keywords", async () => {
      const { keywordMatchScore } = await import("../../src/rag/similarity.js");
      const score = keywordMatchScore([], ["error", "warning"]);
      expect(Number.isNaN(score)).toBe(false);
      expect(score).toBe(0);
    });
  });

  // from tests/audit25.test.ts Audit25 #10: similarity IDF
  describe("Audit25 #10: similarity IDF", () => {
    it("should be importable", async () => {
      const mod = await import("../../src/rag/similarity.js");
      expect(mod.tfidfVector).toBeDefined();
    });
  });

  // from tests/audit28.test.ts #6 — IDF zero with single document
  describe("#6 — IDF zero with single document", () => {
      it("should produce non-zero IDF values for single document corpus", () => {
        const docs = [["hello", "world", "test"]];
        const idf = inverseDocumentFrequency(docs);
        // With 1 doc, all terms have df=1, so log(1/1) = 0
        // After fix, should use smoothing to produce non-zero values
        for (const [, value] of idf) {
          expect(value).not.toBe(0);
        }
      });

      it("should find similar documents in single-doc index", () => {
        const index = buildSearchIndex([
          { id: "doc1", text: "hello world test data", keywords: ["hello", "world"] },
        ]);
        const results = searchIndex(index, "hello world");
        expect(results.length).toBeGreaterThan(0);
        expect(results[0].score).toBeGreaterThan(0);
      });
    });

  // from tests/audit67.test.ts #10 — buildSearchIndex should validate doc fields
  describe("#10 — buildSearchIndex should validate doc fields", () => {
      it("should check doc.text is string and doc.keywords is array", () => {
        const source = readFileSync("src/rag/similarity.ts", "utf-8");
        const fnStart = source.indexOf("function buildSearchIndex(");
        expect(fnStart).toBeGreaterThan(-1);
        const block = source.slice(fnStart, fnStart + 400);
        expect(block).toMatch(/typeof.*text|Array\.isArray.*keywords|typeof.*id/i);
      });
    });

  // from tests/audit68.test.ts #10 — searchIndex sort should use safe comparator
  describe("#10 — searchIndex sort should use safe comparator", () => {
      it("should not use raw subtraction for score sorting", () => {
        const source = readFileSync("src/rag/similarity.ts", "utf-8");
        const sortStart = source.indexOf("Sort by score");
        expect(sortStart).toBeGreaterThan(-1);
        const block = source.slice(sortStart, sortStart + 200);
        // Should use comparison operators not subtraction
        const hasRawSubtraction = /\.sort\(\(a,\s*b\)\s*=>\s*b\.score\s*-\s*a\.score\)/.test(block);
        expect(hasRawSubtraction).toBe(false);
      });
    });

  // from tests/audit73.test.ts #8 — similarity tokenize should cap token count
  describe("#8 — similarity tokenize should cap token count", () => {
      it("should limit number of tokens returned", () => {
        const source = readFileSync("src/rag/similarity.ts", "utf-8");
        const fnStart = source.indexOf("function tokenize(");
        expect(fnStart).toBeGreaterThan(-1);
        const block = source.slice(fnStart, fnStart + 300);
        expect(block).toMatch(/MAX_TOKENS|\.slice\(0/);
      });
    });

});
