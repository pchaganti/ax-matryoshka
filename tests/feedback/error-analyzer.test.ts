/**
 * Tests for Error Analyzer with Levenshtein suggestions
 */

import { describe, it, expect } from "vitest";
import {
  levenshteinDistance,
  findSimilar,
  analyzeError,
  formatErrorFeedback,
} from "../../src/feedback/error-analyzer.js";
import { readFileSync } from "fs";

describe("Levenshtein Distance", () => {
  it("should return 0 for identical strings", () => {
    expect(levenshteinDistance("hello", "hello")).toBe(0);
  });

  it("should return correct distance for single character difference", () => {
    expect(levenshteinDistance("cat", "bat")).toBe(1);
    expect(levenshteinDistance("cat", "cats")).toBe(1);
    expect(levenshteinDistance("cat", "at")).toBe(1);
  });

  it("should return correct distance for multiple differences", () => {
    expect(levenshteinDistance("kitten", "sitting")).toBe(3);
    expect(levenshteinDistance("sunday", "saturday")).toBe(3);
  });

  it("should handle empty strings", () => {
    expect(levenshteinDistance("", "hello")).toBe(5);
    expect(levenshteinDistance("hello", "")).toBe(5);
    expect(levenshteinDistance("", "")).toBe(0);
  });
});

describe("Find Similar", () => {
  it("should find similar strings", () => {
    const candidates = ["grep", "graph", "grape", "green", "great"];
    const similar = findSimilar("grep", candidates);

    expect(similar.length).toBeGreaterThan(0);
    expect(similar[0].value).toBe("grep");
    expect(similar[0].distance).toBe(0);
  });

  it("should find typo corrections", () => {
    const candidates = ["grep", "synthesize_regex", "synthesize_extractor"];
    const similar = findSimilar("grpe", candidates);

    expect(similar.length).toBeGreaterThan(0);
    expect(similar[0].value).toBe("grep");
    expect(similar[0].distance).toBe(2); // transposition
  });

  it("should respect maxDistance", () => {
    const candidates = ["apple", "banana", "cherry"];
    const similar = findSimilar("aple", candidates, 1);

    expect(similar.length).toBe(1);
    expect(similar[0].value).toBe("apple");
  });

  it("should respect maxResults", () => {
    const candidates = ["a", "b", "c", "d", "e", "f"];
    const similar = findSimilar("a", candidates, 5, 2);

    expect(similar.length).toBeLessThanOrEqual(2);
  });
});

describe("Analyze Error - Invalid Regex Flags", () => {
  it("should detect grep misuse with word as flags", () => {
    const analysis = analyzeError("Invalid flags supplied to RegExp constructor 'regionm'");

    expect(analysis.errorType).toBe("invalid_regex_flags");
    expect(analysis.problematicValue).toBe("regionm");
    expect(analysis.explanation).toContain("region");
    expect(analysis.explanation).toContain("grep");
    expect(analysis.suggestions.length).toBeGreaterThan(0);
  });

  it("should suggest using | for multiple patterns", () => {
    const analysis = analyzeError("Invalid flags supplied to RegExp constructor 'salesm'");

    expect(analysis.explanation).toContain("|");
    expect(analysis.suggestions.some(s => s.includes("|"))).toBe(true);
  });

  it("should list valid flags", () => {
    const analysis = analyzeError("Invalid flags supplied to RegExp constructor 'xyz'");

    expect(analysis.explanation).toContain("g");
    expect(analysis.explanation).toContain("i");
    expect(analysis.explanation).toContain("m");
  });
});

describe("Analyze Error - Undefined Variable", () => {
  it("should detect undefined variable", () => {
    const analysis = analyzeError("hits is not defined");

    expect(analysis.errorType).toBe("undefined_variable");
    expect(analysis.problematicValue).toBe("hits");
  });

  it("should suggest defining variable first", () => {
    const analysis = analyzeError("hits is not defined");

    expect(analysis.suggestions.some(s => s.includes("grep"))).toBe(true);
  });

  it("should find similar function names for typos", () => {
    const analysis = analyzeError("grpe is not defined");

    expect(analysis.suggestions.some(s => s.toLowerCase().includes("grep"))).toBe(true);
  });
});

describe("Analyze Error - Property of Undefined", () => {
  it("should detect property access on undefined", () => {
    const analysis = analyzeError("Cannot read properties of undefined (reading 'slice')");

    expect(analysis.errorType).toBe("property_of_undefined");
    expect(analysis.problematicValue).toBe("slice");
  });

  it("should suggest null checks", () => {
    const analysis = analyzeError("Cannot read properties of undefined (reading 'map')");

    expect(analysis.suggestions.some(s => s.includes("if") || s.includes("check"))).toBe(true);
  });
});

describe("Analyze Error - Not a Function", () => {
  it("should detect not a function error", () => {
    const analysis = analyzeError("synthesize is not a function");

    expect(analysis.errorType).toBe("not_a_function");
    expect(analysis.problematicValue).toBe("synthesize");
  });

  it("should suggest similar function names", () => {
    const analysis = analyzeError("syntesize_regex is not a function");

    expect(analysis.suggestions.some(s => s.includes("synthesize_regex"))).toBe(true);
  });
});

describe("Analyze Error - Invalid Regex", () => {
  it("should detect invalid regex pattern", () => {
    const analysis = analyzeError("Invalid regular expression: /[$[/");

    expect(analysis.errorType).toBe("invalid_regex");
  });

  it("should suggest using synthesis", () => {
    const analysis = analyzeError("Invalid regular expression: /[unclosed/");

    expect(analysis.suggestions.some(s => s.includes("synthesize"))).toBe(true);
  });
});

describe("Format Error Feedback", () => {
  it("should format feedback with error and suggestions", () => {
    const analysis = analyzeError("Invalid flags supplied to RegExp constructor 'regionm'");
    const feedback = formatErrorFeedback(analysis);

    expect(feedback).toContain("Error:");
    expect(feedback).toContain("Suggestions:");
    expect(feedback.length).toBeGreaterThan(100);
  });

  it("should include explanation", () => {
    const analysis = analyzeError("hits is not defined");
    const feedback = formatErrorFeedback(analysis);

    expect(feedback).toContain("hits");
    expect(feedback).toContain("not");
    expect(feedback).toContain("defined");
  });
});

describe("Real-World Error Scenarios", () => {
  it("should handle the actual regionm error from user demo", () => {
    const error = "Invalid flags supplied to RegExp constructor 'regionm'";
    const analysis = analyzeError(error);
    const feedback = formatErrorFeedback(analysis);

    // Should explain that "region" was treated as flags
    expect(analysis.explanation).toContain("region");

    // Should suggest correct grep usage
    expect(analysis.suggestions.some(s => s.includes("grep"))).toBe(true);

    // Should mention OR pattern with |
    expect(feedback).toContain("|");
  });

  it("should handle undefined hits error", () => {
    const error = "Cannot read properties of undefined (reading 'slice')";
    const analysis = analyzeError(error);

    expect(analysis.errorType).toBe("property_of_undefined");
    expect(analysis.suggestions.some(s => s.includes("grep") || s.includes("defined"))).toBe(true);
  });

  it("should handle typo in function name", () => {
    const error = "synthsize_extractor is not a function";
    const analysis = analyzeError(error);

    expect(analysis.errorType).toBe("not_a_function");
    // Should suggest the correct function name
    expect(analysis.suggestions.some(s => s.includes("synthesize_extractor"))).toBe(true);
  });
});

// =====================================================================
// Source-pattern checks (from audits)
// =====================================================================
describe("Source-pattern checks (from audits)", () => {
  // from tests/audit70.test.ts #4 — levenshteinDistance should cap input string lengths
  describe("#4 — levenshteinDistance should cap input string lengths", () => {
      it("should check a.length or b.length before allocating matrix", () => {
        const source = readFileSync("src/feedback/error-analyzer.ts", "utf-8");
        const fnStart = source.indexOf("function levenshteinDistance(");
        expect(fnStart).toBeGreaterThan(-1);
        const block = source.slice(fnStart, fnStart + 300);
        expect(block).toMatch(/MAX_STR|\.length\s*>/i);
      });
    });

  // from tests/audit70.test.ts #5 — findSimilar sort should use safe comparator
  describe("#5 — findSimilar sort should use safe comparator", () => {
      it("should not use raw subtraction for distance sorting", () => {
        const source = readFileSync("src/feedback/error-analyzer.ts", "utf-8");
        const sortStart = source.indexOf(".sort((a, b) =>");
        expect(sortStart).toBeGreaterThan(-1);
        const block = source.slice(sortStart, sortStart + 80);
        const hasRawSubtraction = /\.sort\(\(a,\s*b\)\s*=>\s*a\.distance\s*-\s*b\.distance\)/.test(block);
        expect(hasRawSubtraction).toBe(false);
      });
    });

  // from tests/audit90.test.ts #8 — analyzeInvalidRegex should detect chars at index 0
  describe("#8 — analyzeInvalidRegex should detect chars at index 0", () => {
      it("should use idx >= 0 not idx > 0 for special char detection", () => {
        const source = readFileSync("src/feedback/error-analyzer.ts", "utf-8");
        const filterLine = source.indexOf("specialChars.filter");
        expect(filterLine).toBeGreaterThan(-1);
        const block = source.slice(filterLine, filterLine + 200);
        // Should check idx >= 0 (or idx !== -1), not idx > 0
        expect(block).not.toMatch(/idx\s*>\s*0\s*&&/);
      });
    });

});
