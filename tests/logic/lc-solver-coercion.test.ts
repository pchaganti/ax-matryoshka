/**
 * Tests for LC Solver type coercion and parsing
 */

import { describe, it, expect } from "vitest";
import { solve, type SolverTools, type Bindings } from "../../src/logic/lc-solver.js";
import { parse } from "../../src/logic/lc-parser.js";

// Helper to create mock tools
function createMockTools(context: string): SolverTools {
  const lines = context.split("\n");
  return {
    context,
    lines,
    grep: (pattern: string) => {
      const regex = new RegExp(pattern, "gi");
      const results: Array<{ match: string; line: string; lineNum: number; index: number; groups: string[] }> = [];
      let match;
      while ((match = regex.exec(context)) !== null) {
        const beforeMatch = context.slice(0, match.index);
        const lineNum = (beforeMatch.match(/\n/g) || []).length + 1;
        results.push({
          match: match[0],
          line: lines[lineNum - 1] || "",
          lineNum,
          index: match.index,
          groups: match.slice(1),
        });
      }
      return results;
    },
    fuzzy_search: (query: string, limit = 10) => {
      return lines
        .map((line, idx) => ({
          line,
          lineNum: idx + 1,
          score: line.toLowerCase().includes(query.toLowerCase()) ? 100 : 0,
        }))
        .filter(r => r.score > 0)
        .slice(0, limit);
    },
    bm25: (_query: string, _limit = 10) => [],
    semantic: (_query: string, _limit = 10) => [],
    text_stats: () => ({
      length: context.length,
      lineCount: lines.length,
      sample: { start: "", middle: "", end: "" },
    }),
  };
}

describe("LC Solver Type Coercion", () => {
  const tools = createMockTools("");
  const bindings: Bindings = new Map();

  describe("parseDate", () => {
    it("should parse ISO date format", async () => {
      const result = await solve(parse('(parseDate "2024-01-15")').term!, tools, bindings);
      expect(result.success).toBe(true);
      expect(result.value).toBe("2024-01-15");
    });

    it("should parse US date format with hint", async () => {
      const result = await solve(parse('(parseDate "01/15/2024" "US")').term!, tools, bindings);
      expect(result.success).toBe(true);
      expect(result.value).toBe("2024-01-15");
    });

    it("should parse EU date format with hint", async () => {
      const result = await solve(parse('(parseDate "15/01/2024" "EU")').term!, tools, bindings);
      expect(result.success).toBe(true);
      expect(result.value).toBe("2024-01-15");
    });

    it("should parse natural language date (Month Day, Year)", async () => {
      const result = await solve(parse('(parseDate "January 15, 2024")').term!, tools, bindings);
      expect(result.success).toBe(true);
      expect(result.value).toBe("2024-01-15");
    });

    it("should parse natural language date (Day Month Year)", async () => {
      const result = await solve(parse('(parseDate "15 Jan 2024")').term!, tools, bindings);
      expect(result.success).toBe(true);
      expect(result.value).toBe("2024-01-15");
    });

    it("should return null for invalid date", async () => {
      const result = await solve(parse('(parseDate "not a date")').term!, tools, bindings);
      expect(result.success).toBe(true);
      expect(result.value).toBe(null);
    });
  });

  describe("parseCurrency", () => {
    it("should parse US dollar format", async () => {
      const result = await solve(parse('(parseCurrency "$1,234.56")').term!, tools, bindings);
      expect(result.success).toBe(true);
      expect(result.value).toBe(1234.56);
    });

    it("should parse EU format (dot thousands, comma decimal)", async () => {
      const result = await solve(parse('(parseCurrency "€1.234,56")').term!, tools, bindings);
      expect(result.success).toBe(true);
      expect(result.value).toBe(1234.56);
    });

    it("should parse large currency amounts", async () => {
      const result = await solve(parse('(parseCurrency "$2,340,000")').term!, tools, bindings);
      expect(result.success).toBe(true);
      expect(result.value).toBe(2340000);
    });

    it("should handle negative currency (parentheses)", async () => {
      const result = await solve(parse('(parseCurrency "($1,234)")').term!, tools, bindings);
      expect(result.success).toBe(true);
      expect(result.value).toBe(-1234);
    });

    it("should handle negative currency (minus sign)", async () => {
      const result = await solve(parse('(parseCurrency "-$1,234")').term!, tools, bindings);
      expect(result.success).toBe(true);
      expect(result.value).toBe(-1234);
    });
  });

  describe("parseNumber", () => {
    it("should parse comma-separated number", async () => {
      const result = await solve(parse('(parseNumber "1,234,567")').term!, tools, bindings);
      expect(result.success).toBe(true);
      expect(result.value).toBe(1234567);
    });

    it("should parse percentage", async () => {
      const result = await solve(parse('(parseNumber "50%")').term!, tools, bindings);
      expect(result.success).toBe(true);
      expect(result.value).toBe(0.5);
    });

    it("should parse decimal", async () => {
      const result = await solve(parse('(parseNumber "3.14159")').term!, tools, bindings);
      expect(result.success).toBe(true);
      expect(result.value).toBe(3.14159);
    });

    it("should parse scientific notation", async () => {
      const result = await solve(parse('(parseNumber "1.5e6")').term!, tools, bindings);
      expect(result.success).toBe(true);
      expect(result.value).toBe(1500000);
    });
  });

  describe("coerce", () => {
    it("should coerce string to date", async () => {
      const result = await solve(parse('(coerce "2024-01-15" "date")').term!, tools, bindings);
      expect(result.success).toBe(true);
      expect(result.value).toBe("2024-01-15");
    });

    it("should coerce string to currency", async () => {
      const result = await solve(parse('(coerce "$1,234" "currency")').term!, tools, bindings);
      expect(result.success).toBe(true);
      expect(result.value).toBe(1234);
    });

    it("should coerce string to number", async () => {
      const result = await solve(parse('(coerce "1,234" "number")').term!, tools, bindings);
      expect(result.success).toBe(true);
      expect(result.value).toBe(1234);
    });

    it("should coerce to boolean", async () => {
      expect((await solve(parse('(coerce "true" "boolean")').term!, tools, bindings)).value).toBe(true);
      expect((await solve(parse('(coerce "yes" "boolean")').term!, tools, bindings)).value).toBe(true);
      expect((await solve(parse('(coerce "false" "boolean")').term!, tools, bindings)).value).toBe(false);
      expect((await solve(parse('(coerce "no" "boolean")').term!, tools, bindings)).value).toBe(false);
    });
  });

  describe("extract with type coercion", () => {
    it("should extract and coerce to currency", async () => {
      const result = await solve(parse('(extract "Total: $1,234.56" "\\\\$[\\\\d,.]+" 0 "currency")').term!, tools, bindings);
      expect(result.success).toBe(true);
      expect(result.value).toBe(1234.56);
    });

    it("should extract and coerce to date", async () => {
      const result = await solve(parse('(extract "Date: 2024-01-15" "\\\\d{4}-\\\\d{2}-\\\\d{2}" 0 "date")').term!, tools, bindings);
      expect(result.success).toBe(true);
      expect(result.value).toBe("2024-01-15");
    });

    it("should extract without coercion when type not specified", async () => {
      const result = await solve(parse('(extract "Value: 42" "\\\\d+" 0)').term!, tools, bindings);
      expect(result.success).toBe(true);
      expect(result.value).toBe("42"); // String, not number
    });
  });

  describe("map with type coercion", () => {
    it("should parse dates in map", async () => {
      const context = `Event: Jan 15, 2024
Event: Feb 20, 2024
Event: Mar 10, 2024`;
      const mapTools = createMockTools(context);
      const mapBindings: Bindings = new Map();

      // First grep
      const grepResult = await solve(parse('(grep "Event")').term!, mapTools, mapBindings);
      mapBindings.set("RESULTS", grepResult.value);

      // Map to extract and parse dates
      const mapResult = await solve(
        parse('(map RESULTS (lambda x (parseDate (match x "[A-Za-z]+ \\\\d+, \\\\d+" 0))))').term!,
        mapTools,
        mapBindings
      );
      expect(mapResult.success).toBe(true);
      expect(mapResult.value).toEqual(["2024-01-15", "2024-02-20", "2024-03-10"]);
    });

    it("should parse currencies in map", async () => {
      const context = `SALES_NORTH: $2,340,000
SALES_SOUTH: $3,120,000
SALES_EAST: $1,890,000`;
      const mapTools = createMockTools(context);
      const mapBindings: Bindings = new Map();

      // First grep
      const grepResult = await solve(parse('(grep "SALES")').term!, mapTools, mapBindings);
      mapBindings.set("RESULTS", grepResult.value);

      // Map to extract and parse currencies
      const mapResult = await solve(
        parse('(map RESULTS (lambda x (parseCurrency (match x "\\\\$[\\\\d,]+" 0))))').term!,
        mapTools,
        mapBindings
      );
      expect(mapResult.success).toBe(true);
      expect(mapResult.value).toEqual([2340000, 3120000, 1890000]);
    });
  });
});

describe("LC Solver Synthesis", () => {
  const tools = createMockTools("");
  const bindings: Bindings = new Map();

  describe("synthesize command", () => {
    it("should parse synthesize with bracket pairs", async () => {
      const parseResult = parse('(synthesize ["SALES: $100" 100] ["SALES: $200" 200])');
      expect(parseResult.success).toBe(true);
      expect(parseResult.term?.tag).toBe("synthesize");
    });

    it("should parse synthesize with paren pairs", async () => {
      const parseResult = parse('(synthesize ("input1" "output1") ("input2" "output2"))');
      expect(parseResult.success).toBe(true);
    });

    it("should synthesize a simple extractor", async () => {
      const result = await solve(
        parse('(synthesize ("$100" 100) ("$200" 200) ("$50" 50))').term!,
        tools,
        bindings
      );
      expect(result.success).toBe(true);
      // Should return a function
      expect(typeof result.value).toBe("function");

      // Test the synthesized function
      const fn = result.value as (s: string) => unknown;
      expect(fn("$300")).toBe(300);
    });

    it("should synthesize date parser via relational solver", async () => {
      // This tests the relational solver fallback - unusual date format
      const result = await solve(
        parse('(synthesize ("Q1-2024" "2024-01") ("Q2-2024" "2024-04") ("Q3-2024" "2024-07") ("Q4-2024" "2024-10"))').term!,
        tools,
        bindings
      );
      expect(result.success).toBe(true);
      expect(typeof result.value).toBe("function");

      const fn = result.value as (s: string) => unknown;
      expect(fn("Q1-2025")).toBe("2025-01");
    });

    it("should synthesize number extractor from complex pattern", async () => {
      const result = await solve(
        parse('(synthesize ("Order #12345 (SHIPPED)" 12345) ("Order #67890 (PENDING)" 67890))').term!,
        tools,
        bindings
      );
      expect(result.success).toBe(true);
      expect(typeof result.value).toBe("function");

      const fn = result.value as (s: string) => unknown;
      expect(fn("Order #11111 (DELIVERED)")).toBe(11111);
    });
  });
});

describe("LC Solver Lines Command", () => {
  const multiLineContext = `Line 1: Introduction
Line 2: Start of config
{
  "name": "example",
  "value": 42
}
Line 7: End of config
Line 8: Conclusion`;

  const tools = createMockTools(multiLineContext);
  const bindings: Bindings = new Map();

  it("should get specific line range", async () => {
    const result = await solve(parse("(lines 3 6)").term!, tools, bindings);
    expect(result.success).toBe(true);
    // lines returns an array of strings for compatibility with filter/map
    expect(result.value).toEqual([
      "{",
      '  "name": "example",',
      '  "value": 42',
      "}",
    ]);
  });

  it("should handle 1-indexed lines", async () => {
    const result = await solve(parse("(lines 1 2)").term!, tools, bindings);
    expect(result.success).toBe(true);
    expect(result.value).toEqual([
      "Line 1: Introduction",
      "Line 2: Start of config",
    ]);
  });

  it("should clamp to valid range", async () => {
    const result = await solve(parse("(lines 7 100)").term!, tools, bindings);
    expect(result.success).toBe(true);
    expect(result.value).toEqual([
      "Line 7: End of config",
      "Line 8: Conclusion",
    ]);
  });
});

describe("LC Solver NaN-safe parsing", () => {
  const tools = createMockTools("");
  const bindings: Bindings = new Map();

  it("should return null for parseInt of non-numeric string", async () => {
    const term = {
      tag: "parseInt" as const,
      str: { tag: "lit" as const, value: "not-a-number" },
    };
    const result = await solve(term as any, tools, bindings);
    expect(result.success).toBe(true);
    expect(result.value).toBeNull();
  });

  it("should return null for parseFloat of non-numeric string", async () => {
    const term = {
      tag: "parseFloat" as const,
      str: { tag: "lit" as const, value: "abc" },
    };
    const result = await solve(term as any, tools, bindings);
    expect(result.success).toBe(true);
    expect(result.value).toBeNull();
  });

  it("should still parse valid integers", async () => {
    const term = {
      tag: "parseInt" as const,
      str: { tag: "lit" as const, value: "42" },
    };
    const result = await solve(term as any, tools, bindings);
    expect(result.success).toBe(true);
    expect(result.value).toBe(42);
  });

  it("should still parse valid floats", async () => {
    const term = {
      tag: "parseFloat" as const,
      str: { tag: "lit" as const, value: "3.14" },
    };
    const result = await solve(term as any, tools, bindings);
    expect(result.success).toBe(true);
    expect(result.value).toBe(3.14);
  });
});

describe("LC Solver parse input length guard", () => {
  const tools = createMockTools("");
  const bindings: Bindings = new Map();

  it("should return null for parseCurrency with oversized input", async () => {
    const longStr = "$" + "1".repeat(200);
    const term = {
      tag: "coerce" as const,
      term: { tag: "lit" as const, value: longStr },
      targetType: "currency",
    };
    const result = await solve(term as any, tools, bindings);
    expect(result.success).toBe(true);
    expect(result.value).toBeNull();
  });

  it("should return null for parseNumber with oversized input", async () => {
    const longStr = "1".repeat(200);
    const term = {
      tag: "coerce" as const,
      term: { tag: "lit" as const, value: longStr },
      targetType: "number",
    };
    const result = await solve(term as any, tools, bindings);
    expect(result.success).toBe(true);
    expect(result.value).toBeNull();
  });
});
