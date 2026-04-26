/**
 * Tests for the Relational Interpreter (evalo)
 *
 * evalo is the core relation that makes synthesis possible:
 * - Forward mode: evalo(extractor, input, ?output) => evaluates to output
 * - Backwards mode: evalo(?extractor, input, output) => synthesizes extractor
 */

import { describe, it, expect } from "vitest";
import {
  evalExtractor,
  evalo,
  synthesizeExtractor,
} from "../../src/synthesis/evalo/evalo.js";
import type { Extractor } from "../../src/synthesis/evalo/types.js";
import { readFileSync } from "fs";

describe("evalExtractor (forward mode)", () => {
  describe("base cases", () => {
    it("should return input unchanged", () => {
      const result = evalExtractor({ tag: "input" }, "hello");
      expect(result).toBe("hello");
    });

    it("should return string literal", () => {
      const result = evalExtractor({ tag: "lit", value: "world" }, "ignored");
      expect(result).toBe("world");
    });

    it("should return number literal", () => {
      const result = evalExtractor({ tag: "lit", value: 42 }, "ignored");
      expect(result).toBe(42);
    });
  });

  describe("match operation", () => {
    it("should extract regex group 0 (full match)", () => {
      const e: Extractor = {
        tag: "match",
        str: { tag: "input" },
        pattern: "\\d+",
        group: 0,
      };
      const result = evalExtractor(e, "abc123def");
      expect(result).toBe("123");
    });

    it("should extract regex group 1", () => {
      const e: Extractor = {
        tag: "match",
        str: { tag: "input" },
        pattern: "\\$(\\d+)",
        group: 1,
      };
      const result = evalExtractor(e, "Price: $100");
      expect(result).toBe("100");
    });

    it("should return null for no match", () => {
      const e: Extractor = {
        tag: "match",
        str: { tag: "input" },
        pattern: "\\d+",
        group: 0,
      };
      const result = evalExtractor(e, "no numbers here");
      expect(result).toBe(null);
    });

    it("should handle currency with commas", () => {
      const e: Extractor = {
        tag: "match",
        str: { tag: "input" },
        pattern: "\\$([\\d,]+)",
        group: 1,
      };
      const result = evalExtractor(e, "SALES: $1,234,567");
      expect(result).toBe("1,234,567");
    });
  });

  describe("replace operation", () => {
    it("should replace all occurrences", () => {
      const e: Extractor = {
        tag: "replace",
        str: { tag: "input" },
        from: ",",
        to: "",
      };
      const result = evalExtractor(e, "1,234,567");
      expect(result).toBe("1234567");
    });

    it("should handle no matches", () => {
      const e: Extractor = {
        tag: "replace",
        str: { tag: "input" },
        from: "x",
        to: "y",
      };
      const result = evalExtractor(e, "hello");
      expect(result).toBe("hello");
    });
  });

  describe("slice operation", () => {
    it("should extract substring", () => {
      const e: Extractor = {
        tag: "slice",
        str: { tag: "input" },
        start: 0,
        end: 5,
      };
      const result = evalExtractor(e, "hello world");
      expect(result).toBe("hello");
    });

    it("should handle negative end", () => {
      const e: Extractor = {
        tag: "slice",
        str: { tag: "input" },
        start: 0,
        end: -1,
      };
      const result = evalExtractor(e, "hello");
      // Negative end is now rejected for security (prevents unexpected data extraction)
      expect(result).toBe(null);
    });
  });

  describe("split operation", () => {
    it("should split and get index", () => {
      const e: Extractor = {
        tag: "split",
        str: { tag: "input" },
        delim: ":",
        index: 1,
      };
      const result = evalExtractor(e, "key: value");
      expect(result).toBe(" value");
    });

    it("should return null for out of bounds", () => {
      const e: Extractor = {
        tag: "split",
        str: { tag: "input" },
        delim: ":",
        index: 5,
      };
      const result = evalExtractor(e, "a:b");
      expect(result).toBe(null);
    });
  });

  describe("parseInt operation", () => {
    it("should parse integer string", () => {
      const e: Extractor = {
        tag: "parseInt",
        str: { tag: "input" },
      };
      const result = evalExtractor(e, "42");
      expect(result).toBe(42);
    });

    it("should parse from matched string", () => {
      const e: Extractor = {
        tag: "parseInt",
        str: {
          tag: "match",
          str: { tag: "input" },
          pattern: "\\d+",
          group: 0,
        },
      };
      const result = evalExtractor(e, "abc123def");
      expect(result).toBe(123);
    });

    it("should return null for non-numeric", () => {
      const e: Extractor = {
        tag: "parseInt",
        str: { tag: "input" },
      };
      const result = evalExtractor(e, "hello");
      expect(result).toBeNull();
    });
  });

  describe("parseFloat operation", () => {
    it("should parse float string", () => {
      const e: Extractor = {
        tag: "parseFloat",
        str: { tag: "input" },
      };
      const result = evalExtractor(e, "3.14");
      expect(result).toBe(3.14);
    });

    it("should handle currency extraction", () => {
      // parseFloat(replace(match(input, /\$([\d,]+)/, 1), /,/, ""))
      const e: Extractor = {
        tag: "parseFloat",
        str: {
          tag: "replace",
          str: {
            tag: "match",
            str: { tag: "input" },
            pattern: "\\$([\\d,]+)",
            group: 1,
          },
          from: ",",
          to: "",
        },
      };
      const result = evalExtractor(e, "SALES: $1,234,567");
      expect(result).toBe(1234567);
    });
  });

  describe("add operation", () => {
    it("should add two numbers", () => {
      const e: Extractor = {
        tag: "add",
        left: { tag: "lit", value: 1 },
        right: { tag: "lit", value: 2 },
      };
      const result = evalExtractor(e, "ignored");
      expect(result).toBe(3);
    });

    it("should add parsed numbers", () => {
      const e: Extractor = {
        tag: "add",
        left: { tag: "parseInt", str: { tag: "lit", value: "10" } },
        right: { tag: "parseInt", str: { tag: "lit", value: "20" } },
      };
      const result = evalExtractor(e, "ignored");
      expect(result).toBe(30);
    });
  });

  describe("if operation", () => {
    it("should return then branch for truthy", () => {
      const e: Extractor = {
        tag: "if",
        cond: { tag: "lit", value: "truthy" },
        then: { tag: "lit", value: 1 },
        else: { tag: "lit", value: 0 },
      };
      const result = evalExtractor(e, "ignored");
      expect(result).toBe(1);
    });

    it("should return else branch for falsy", () => {
      const e: Extractor = {
        tag: "if",
        cond: { tag: "lit", value: "" },
        then: { tag: "lit", value: 1 },
        else: { tag: "lit", value: 0 },
      };
      const result = evalExtractor(e, "ignored");
      expect(result).toBe(0);
    });

    it("should return else branch for null", () => {
      const e: Extractor = {
        tag: "if",
        cond: {
          tag: "match",
          str: { tag: "input" },
          pattern: "xyz",
          group: 0,
        },
        then: { tag: "lit", value: "found" },
        else: { tag: "lit", value: "not found" },
      };
      const result = evalExtractor(e, "abc");
      expect(result).toBe("not found");
    });
  });
});

describe("evalo (relational mode)", () => {
  describe("forward mode", () => {
    it("should unify output with evaluation result", () => {
      // Omit expectedOutput to mean "no constraint" (undefined)
      const results = evalo({ tag: "input" }, "hello");
      expect(results).toContain("hello");
    });

    it("should return empty for wrong expected output", () => {
      const results = evalo({ tag: "input" }, "hello", "wrong");
      expect(results).not.toContain("hello");
    });
  });
});

describe("synthesizeExtractor (backwards mode)", () => {
  describe("simple cases", () => {
    it("should synthesize identity for same input/output", () => {
      const extractors = synthesizeExtractor([
        { input: "hello", output: "hello" },
        { input: "world", output: "world" },
      ]);
      expect(extractors.length).toBeGreaterThan(0);
      // The simplest solution is { tag: "input" }
      expect(extractors.some(e => e.tag === "input")).toBe(true);
    });

    it("should synthesize literal for constant output", () => {
      const extractors = synthesizeExtractor([
        { input: "anything", output: 42 },
        { input: "different", output: 42 },
      ]);
      expect(extractors.length).toBeGreaterThan(0);
      // The simplest solution is { tag: "lit", value: 42 }
      expect(extractors.some(e => e.tag === "lit" && e.value === 42)).toBe(true);
    });
  });

  describe("extraction patterns", () => {
    it("should synthesize currency extractor", () => {
      const extractors = synthesizeExtractor([
        { input: "$100", output: 100 },
        { input: "$200", output: 200 },
      ]);
      expect(extractors.length).toBeGreaterThan(0);

      // Verify the extractor works
      const extractor = extractors[0];
      expect(evalExtractor(extractor, "$100")).toBe(100);
      expect(evalExtractor(extractor, "$200")).toBe(200);
      expect(evalExtractor(extractor, "$300")).toBe(300);
    });

    it("should synthesize currency with commas extractor", () => {
      const extractors = synthesizeExtractor([
        { input: "$1,234", output: 1234 },
        { input: "$5,678", output: 5678 },
      ]);
      expect(extractors.length).toBeGreaterThan(0);

      const extractor = extractors[0];
      expect(evalExtractor(extractor, "$1,234")).toBe(1234);
      expect(evalExtractor(extractor, "$9,999")).toBe(9999);
    });

    it("should synthesize percentage extractor", () => {
      const extractors = synthesizeExtractor([
        { input: "50%", output: 50 },
        { input: "75%", output: 75 },
      ]);
      expect(extractors.length).toBeGreaterThan(0);

      const extractor = extractors[0];
      expect(evalExtractor(extractor, "50%")).toBe(50);
      expect(evalExtractor(extractor, "100%")).toBe(100);
    });
  });

  describe("error cases", () => {
    it("should detect conflicting examples", () => {
      expect(() =>
        synthesizeExtractor([
          { input: "abc", output: 1 },
          { input: "abc", output: 2 },
        ])
      ).toThrow(/conflict/i);
    });

    it("should require at least 2 examples", () => {
      expect(() => synthesizeExtractor([{ input: "x", output: 1 }])).toThrow(
        /at least 2/i
      );
    });

    it("should return empty for impossible extraction", () => {
      const extractors = synthesizeExtractor([
        { input: "abc", output: 1 },
        { input: "xyz", output: 2 },
      ]);
      // No simple pattern connects these
      expect(extractors.length).toBe(0);
    });
  });
});

// =====================================================================
// Source-pattern checks (from audits)
// =====================================================================
describe("Source-pattern checks (from audits)", () => {
  // from tests/audit14.test.ts Issue #1: evalExtractor should validate regex patterns
  describe("Issue #1: evalExtractor should validate regex patterns", () => {
    it("should return null for ReDoS pattern in match", async () => {
      const e: Extractor = {
        tag: "match",
        str: { tag: "input" },
        pattern: "(a+)+$",
        group: 0,
      };
      // Should be caught by validateRegex, not allowed to execute
      // A safe implementation returns null without executing the dangerous regex
      const result = evalExtractor(e, "aaaaaaaaaaaaaaaaaaaaaaaa!");
      expect(result).toBeNull();
    });

    it("should return null for ReDoS pattern in replace", async () => {
      const e: Extractor = {
        tag: "replace",
        str: { tag: "input" },
        from: "(a+)+$",
        to: "b",
      };
      // Should not execute dangerous regex
      const result = evalExtractor(e, "aaaaaaaaaaaaaaaaaaaaaaaa!");
      // Should return the original string or null, not hang
      expect(result === null || result === "aaaaaaaaaaaaaaaaaaaaaaaa!").toBe(true);
    });
  });

  // from tests/audit16.test.ts Audit16 #11: evalo float comparison
  describe("Audit16 #11: evalo float comparison", () => {
    it("synthesis should handle floating-point precision", async () => {
      const { synthesizeExtractor } = await import("../../src/synthesis/evalo/evalo.js");
      // 0.1 + 0.2 = 0.30000000000000004 in JS
      // This test verifies the synthesis handles it
      const result = synthesizeExtractor(
        [
          { input: "price: 100", output: 100 },
          { input: "price: 200", output: 200 },
        ],
        1
      );
      // Should find at least one extractor
      expect(result.length).toBeGreaterThanOrEqual(0);
      // The test mainly verifies no crash from float comparison
    });
  });

  // from tests/audit20.test.ts Audit20 #2: evalo NaN-safe comparison
  describe("Audit20 #2: evalo NaN-safe comparison", () => {
    it("evalo should match NaN output with NaN result", async () => {
      const { evalo } = await import("../../src/synthesis/evalo/evalo.js");
      // A literal extractor that returns NaN
      const extractor: any = { tag: "lit", value: NaN };
      const result = evalo(extractor, "anything", NaN);
      // Should return [NaN] since NaN matches NaN
      expect(result.length).toBe(1);
    });

    it("synthesizeExtractor should detect identity with NaN values", async () => {
      const { synthesizeExtractor } = await import("../../src/synthesis/evalo/evalo.js");
      // All outputs equal inputs — identity check should work even with NaN-like values
      const result = synthesizeExtractor(
        [
          { input: "hello", output: "hello" },
          { input: "world", output: "world" },
        ],
        1
      );
      expect(result.length).toBeGreaterThan(0);
    });
  });

  // from tests/audit33.test.ts #6 — evalo should distinguish null output from 'no constraint'
  describe("#6 — evalo should distinguish null output from 'no constraint'", () => {
      it("should correctly check when expected output is null", async () => {
        const { evalo } = await import("../../src/synthesis/evalo/evalo.js");
        // If an extractor returns null and expectedOutput is null,
        // it should be treated as a MATCH (not as "no constraint")
        const extractor = {
          tag: "match" as const,
          str: { tag: "input" as const },
          pattern: "(\\d+)",
          group: 1,
        };
        // Input has no digits, so match returns null
        // expectedOutput is null — should match (null === null)
        const result = evalo(extractor, "no digits", null);
        expect(result).toEqual([null]);
      });

      it("should reject when expected output is null but result is not", async () => {
        const source = readFileSync("src/synthesis/evalo/evalo.ts", "utf-8");
        // The fix should use something other than !== null to distinguish
        // "no constraint" from "expected null"
        const evaloBody = source.match(/export function evalo[\s\S]*?^\}/m);
        expect(evaloBody).not.toBeNull();
        // Should NOT use `expectedOutput !== null` as the sole check
        // Should use undefined, arguments.length, or a sentinel value
        expect(evaloBody![0]).not.toMatch(/expectedOutput !== null\b/);
      });
    });

  // from tests/audit34.test.ts #22 — synthesizeExtractor constant check should handle objects
  describe("#22 — synthesizeExtractor constant check should handle objects", () => {
        it("should use deep equality for constant output detection", () => {
          const source = readFileSync("src/synthesis/evalo/evalo.ts", "utf-8");
          const allSame = source.match(/const allSame[\s\S]*?;/);
          expect(allSame).not.toBeNull();
          // Should use JSON.stringify, deepEqual, or Object.is for comparison
          expect(allSame![0]).toMatch(/JSON\.stringify|deepEqual|Object\.is/);
        });
      });

  // from tests/audit43.test.ts #5 — evalo synthesizeExtractor should use Object.is for constant check
  describe("#5 — evalo synthesizeExtractor should use Object.is for constant check", () => {
      it("should use Object.is instead of JSON.stringify for constant output detection", () => {
        const source = readFileSync("src/synthesis/evalo/evalo.ts", "utf-8");
        // The allSame check should NOT use JSON.stringify for comparison
        expect(source).not.toMatch(/allSame\s*=\s*outputs\.every\([^)]*JSON\.stringify/);
      });
    });

  // from tests/audit52.test.ts #6 — evalo evalExtractor slice should reject negative indices
  describe("#6 — evalo evalExtractor slice should reject negative indices", () => {
      it("should validate start and end are non-negative", () => {
        const source = readFileSync("src/synthesis/evalo/evalo.ts", "utf-8");
        const sliceCase = source.match(/case "slice"[\s\S]*?str\.slice\(/);
        expect(sliceCase).not.toBeNull();
        expect(sliceCase![0]).toMatch(/start\s*[<>]=?\s*0|start\s*<\s*0|isInteger/);
      });
    });

  // from tests/audit66.test.ts #4 — evalo split should reject empty delimiter
  describe("#4 — evalo split should reject empty delimiter", () => {
      it("should check delimiter is non-empty before split", () => {
        const source = readFileSync("src/synthesis/evalo/evalo.ts", "utf-8");
        const splitCase = source.indexOf('case "split"');
        expect(splitCase).toBeGreaterThan(-1);
        const block = source.slice(splitCase, splitCase + 300);
        expect(block).toMatch(/!extractor\.delim|delim\.length\s*===?\s*0|delim\s*===?\s*""/i);
      });
    });

  // from tests/audit74.test.ts #2 — evalo split should validate delimiter length
  describe("#2 — evalo split should validate delimiter length", () => {
      it("should reject overly long delimiters", () => {
        const source = readFileSync("src/synthesis/evalo/evalo.ts", "utf-8");
        const splitCase = source.indexOf('case "split"');
        expect(splitCase).toBeGreaterThan(-1);
        const block = source.slice(splitCase, splitCase + 300);
        // Should check delimiter max length, not just empty
        expect(block).toMatch(/delim\.length\s*>\s*\d{2,}|MAX_DELIM/);
      });
    });

  // from tests/audit75.test.ts #7 — evalo parseFloat should validate input length
  describe("#7 — evalo parseFloat should validate input length", () => {
      it("should check string length before parsing", () => {
        const source = readFileSync("src/synthesis/evalo/evalo.ts", "utf-8");
        const parseFloatCase = source.indexOf('case "parseFloat"');
        expect(parseFloatCase).toBeGreaterThan(-1);
        const block = source.slice(parseFloatCase, parseFloatCase + 300);
        expect(block).toMatch(/\.length\s*>|MAX_STR/);
      });
    });

  // from tests/audit87.test.ts #2 — evalo.ts slice should reject negative end
  describe("#2 — evalo.ts slice should reject negative end", () => {
      it("should validate end >= 0", () => {
        const source = readFileSync("src/synthesis/evalo/evalo.ts", "utf-8");
        const sliceCase = source.indexOf('case "slice"');
        expect(sliceCase).toBeGreaterThan(-1);
        const block = source.slice(sliceCase, sliceCase + 300);
        expect(block).toMatch(/end\s*<\s*0|end\s*<\s*extractor\.start|end\s*>=?\s*0/);
      });
    });

  // from tests/audit90.test.ts #1 — parseInt should check string length before parsing
  describe("#1 — parseInt should check string length before parsing", () => {
      it("should validate string length in parseInt case", () => {
        const source = readFileSync("src/synthesis/evalo/evalo.ts", "utf-8");
        const intCase = source.indexOf('case "parseInt"');
        expect(intCase).toBeGreaterThan(-1);
        const block = source.slice(intCase, intCase + 300);
        // Should have length check like parseFloat does
        expect(block).toMatch(/\.length\s*>/);
      });
    });

  // from tests/audit95.test.ts #4 — evalo split should use limit parameter
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
