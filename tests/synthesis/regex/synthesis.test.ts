/**
 * Tests for regex synthesis engine
 * Following TDD - these tests are written first
 */

import { describe, it, expect } from "vitest";
import {
  // AST types
  RegexNode,
  Literal,
  CharClass,
  Repeat,
  Sequence,
  Alt,
  Group,
  // AST to regex conversion
  nodeToRegex,
  // Template matching
  matchTemplate,
  // Character analysis
  analyzeCharacters,
  // Main synthesis function
  synthesizeRegex,
} from "../../../src/synthesis/regex/synthesis.js";
import { readFileSync } from "fs";

describe("Regex Synthesis", () => {
  describe("AST Nodes", () => {
    describe("Literal", () => {
      it("should match exact characters", () => {
        const node: Literal = { type: "literal", value: "hello" };
        const regex = new RegExp(`^${nodeToRegex(node)}$`);
        expect(regex.test("hello")).toBe(true);
        expect(regex.test("world")).toBe(false);
      });

      it("should escape special regex characters", () => {
        const node: Literal = { type: "literal", value: "$100.00" };
        const regex = new RegExp(`^${nodeToRegex(node)}$`);
        expect(regex.test("$100.00")).toBe(true);
        expect(regex.test("$10000")).toBe(false);
      });
    });

    describe("CharClass", () => {
      it("should match digit class", () => {
        const node: CharClass = { type: "charClass", class: "digit" };
        const regex = new RegExp(`^${nodeToRegex(node)}$`);
        expect(regex.test("5")).toBe(true);
        expect(regex.test("a")).toBe(false);
      });

      it("should match word class", () => {
        const node: CharClass = { type: "charClass", class: "word" };
        const regex = new RegExp(`^${nodeToRegex(node)}$`);
        expect(regex.test("a")).toBe(true);
        expect(regex.test("Z")).toBe(true);
        expect(regex.test("5")).toBe(true);
        expect(regex.test("_")).toBe(true);
        expect(regex.test("!")).toBe(false);
      });

      it("should match whitespace class", () => {
        const node: CharClass = { type: "charClass", class: "whitespace" };
        const regex = new RegExp(`^${nodeToRegex(node)}$`);
        expect(regex.test(" ")).toBe(true);
        expect(regex.test("\t")).toBe(true);
        expect(regex.test("a")).toBe(false);
      });

      it("should match any class", () => {
        const node: CharClass = { type: "charClass", class: "any" };
        const regex = new RegExp(`^${nodeToRegex(node)}$`);
        expect(regex.test("a")).toBe(true);
        expect(regex.test("5")).toBe(true);
        expect(regex.test("!")).toBe(true);
      });

      it("should match custom character set", () => {
        const node: CharClass = { type: "charClass", class: "custom", chars: "aeiou" };
        const regex = new RegExp(`^${nodeToRegex(node)}$`);
        expect(regex.test("a")).toBe(true);
        expect(regex.test("e")).toBe(true);
        expect(regex.test("b")).toBe(false);
      });
    });

    describe("Repeat", () => {
      it("should match one or more", () => {
        const node: Repeat = {
          type: "repeat",
          child: { type: "charClass", class: "digit" },
          min: 1,
          max: Infinity,
        };
        const regex = new RegExp(`^${nodeToRegex(node)}$`);
        expect(regex.test("123")).toBe(true);
        expect(regex.test("1")).toBe(true);
        expect(regex.test("")).toBe(false);
      });

      it("should match zero or more", () => {
        const node: Repeat = {
          type: "repeat",
          child: { type: "charClass", class: "digit" },
          min: 0,
          max: Infinity,
        };
        const regex = new RegExp(`^${nodeToRegex(node)}$`);
        expect(regex.test("123")).toBe(true);
        expect(regex.test("")).toBe(true);
      });

      it("should match exact count", () => {
        const node: Repeat = {
          type: "repeat",
          child: { type: "charClass", class: "digit" },
          min: 3,
          max: 3,
        };
        const regex = new RegExp(`^${nodeToRegex(node)}$`);
        expect(regex.test("123")).toBe(true);
        expect(regex.test("12")).toBe(false);
        expect(regex.test("1234")).toBe(false);
      });

      it("should match range", () => {
        const node: Repeat = {
          type: "repeat",
          child: { type: "charClass", class: "digit" },
          min: 2,
          max: 4,
        };
        const regex = new RegExp(`^${nodeToRegex(node)}$`);
        expect(regex.test("12")).toBe(true);
        expect(regex.test("123")).toBe(true);
        expect(regex.test("1234")).toBe(true);
        expect(regex.test("1")).toBe(false);
        expect(regex.test("12345")).toBe(false);
      });

      it("should match optional (zero or one)", () => {
        const node: Repeat = {
          type: "repeat",
          child: { type: "literal", value: "-" },
          min: 0,
          max: 1,
        };
        const regex = new RegExp(`^${nodeToRegex(node)}$`);
        expect(regex.test("-")).toBe(true);
        expect(regex.test("")).toBe(true);
        expect(regex.test("--")).toBe(false);
      });
    });

    describe("Sequence", () => {
      it("should match elements in order", () => {
        const node: Sequence = {
          type: "sequence",
          children: [
            { type: "literal", value: "ID:" },
            { type: "charClass", class: "digit" },
            { type: "charClass", class: "digit" },
            { type: "charClass", class: "digit" },
          ],
        };
        const regex = new RegExp(`^${nodeToRegex(node)}$`);
        expect(regex.test("ID:123")).toBe(true);
        expect(regex.test("ID:12")).toBe(false);
        expect(regex.test("ID:abc")).toBe(false);
      });

      it("should handle empty sequence", () => {
        const node: Sequence = { type: "sequence", children: [] };
        const regex = new RegExp(`^${nodeToRegex(node)}$`);
        expect(regex.test("")).toBe(true);
      });
    });

    describe("Alt", () => {
      it("should match any alternative", () => {
        const node: Alt = {
          type: "alt",
          children: [
            { type: "literal", value: "yes" },
            { type: "literal", value: "no" },
            { type: "literal", value: "maybe" },
          ],
        };
        const regex = new RegExp(`^${nodeToRegex(node)}$`);
        expect(regex.test("yes")).toBe(true);
        expect(regex.test("no")).toBe(true);
        expect(regex.test("maybe")).toBe(true);
        expect(regex.test("never")).toBe(false);
      });
    });

    describe("Group", () => {
      it("should create capturing group", () => {
        const node: Group = {
          type: "group",
          child: { type: "charClass", class: "digit" },
          capturing: true,
        };
        const regex = new RegExp(`^${nodeToRegex(node)}$`);
        const match = "5".match(regex);
        expect(match).not.toBeNull();
        expect(match![1]).toBe("5");
      });

      it("should create non-capturing group", () => {
        const node: Group = {
          type: "group",
          child: { type: "charClass", class: "digit" },
          capturing: false,
        };
        const regex = new RegExp(`^${nodeToRegex(node)}$`);
        expect(regex.test("5")).toBe(true);
      });
    });
  });

  describe("Template Matching", () => {
    it("should match integer pattern", () => {
      const result = matchTemplate(["123", "456", "7890"]);
      expect(result).not.toBeNull();
      const regex = new RegExp(`^${nodeToRegex(result!)}$`);
      expect(regex.test("999")).toBe(true);
      expect(regex.test("abc")).toBe(false);
    });

    it("should match decimal pattern", () => {
      const result = matchTemplate(["1.23", "45.67", "0.99"]);
      expect(result).not.toBeNull();
      const regex = new RegExp(`^${nodeToRegex(result!)}$`);
      expect(regex.test("12.34")).toBe(true);
      expect(regex.test("123")).toBe(false);
    });

    it("should match currency pattern with dollar", () => {
      const result = matchTemplate(["$100", "$1,234", "$99.99"]);
      expect(result).not.toBeNull();
      const regex = new RegExp(`^${nodeToRegex(result!)}$`);
      expect(regex.test("$500")).toBe(true);
      expect(regex.test("$1,000")).toBe(true);
    });

    it("should match date pattern YYYY-MM-DD", () => {
      const result = matchTemplate(["2024-01-15", "2023-12-31", "2025-06-01"]);
      expect(result).not.toBeNull();
      const regex = new RegExp(`^${nodeToRegex(result!)}$`);
      expect(regex.test("2024-03-20")).toBe(true);
      expect(regex.test("2024/03/20")).toBe(false);
    });

    it("should match date pattern MM/DD/YYYY", () => {
      const result = matchTemplate(["01/15/2024", "12/31/2023", "06/01/2025"]);
      expect(result).not.toBeNull();
      const regex = new RegExp(`^${nodeToRegex(result!)}$`);
      expect(regex.test("03/20/2024")).toBe(true);
    });

    it("should match time pattern HH:MM:SS", () => {
      const result = matchTemplate(["12:30:45", "23:59:59", "00:00:00"]);
      expect(result).not.toBeNull();
      const regex = new RegExp(`^${nodeToRegex(result!)}$`);
      expect(regex.test("14:25:30")).toBe(true);
    });

    it("should match email-like pattern", () => {
      const result = matchTemplate(["user@example.com", "test@domain.org"]);
      expect(result).not.toBeNull();
      const regex = new RegExp(`^${nodeToRegex(result!)}$`);
      expect(regex.test("foo@bar.net")).toBe(true);
    });

    it("should return null for no common template", () => {
      const result = matchTemplate(["abc", "123", "!@#"]);
      expect(result).toBeNull();
    });
  });

  describe("Character Analysis", () => {
    it("should detect all-digit strings", () => {
      const result = analyzeCharacters(["123", "456", "789"]);
      expect(result).not.toBeNull();
      const regex = new RegExp(`^${nodeToRegex(result!)}$`);
      expect(regex.test("999")).toBe(true);
      expect(regex.test("abc")).toBe(false);
    });

    it("should detect all-alpha strings", () => {
      const result = analyzeCharacters(["abc", "xyz", "hello"]);
      expect(result).not.toBeNull();
      const regex = new RegExp(`^${nodeToRegex(result!)}$`);
      expect(regex.test("world")).toBe(true);
      expect(regex.test("123")).toBe(false);
    });

    it("should detect alphanumeric strings", () => {
      const result = analyzeCharacters(["abc123", "xyz789", "test1"]);
      expect(result).not.toBeNull();
      const regex = new RegExp(`^${nodeToRegex(result!)}$`);
      expect(regex.test("foo42")).toBe(true);
    });

    it("should handle fixed-length patterns", () => {
      const result = analyzeCharacters(["AAA", "BBB", "CCC"]);
      expect(result).not.toBeNull();
      const regex = new RegExp(`^${nodeToRegex(result!)}$`);
      expect(regex.test("DDD")).toBe(true);
      expect(regex.test("DDDD")).toBe(false);
      expect(regex.test("DD")).toBe(false);
    });

    it("should handle mixed structures with common prefix", () => {
      const result = analyzeCharacters(["ID_001", "ID_002", "ID_999"]);
      expect(result).not.toBeNull();
      const regex = new RegExp(`^${nodeToRegex(result!)}$`);
      expect(regex.test("ID_123")).toBe(true);
    });
  });

  describe("synthesizeRegex", () => {
    it("should synthesize regex for simple integers", () => {
      const result = synthesizeRegex({
        positives: ["123", "456", "7890"],
        negatives: ["abc", "12.3"],
      });
      expect(result.success).toBe(true);
      expect(result.pattern).toBeDefined();
      const regex = new RegExp(`^${result.pattern}$`);
      expect(regex.test("999")).toBe(true);
      expect(regex.test("abc")).toBe(false);
    });

    it("should synthesize regex for dates", () => {
      const result = synthesizeRegex({
        positives: ["2024-01-15", "2023-12-31"],
        negatives: ["2024/01/15", "Jan 15, 2024"],
      });
      expect(result.success).toBe(true);
      const regex = new RegExp(`^${result.pattern}$`);
      expect(regex.test("2025-06-01")).toBe(true);
      expect(regex.test("2025/06/01")).toBe(false);
    });

    it("should synthesize regex for currency", () => {
      const result = synthesizeRegex({
        positives: ["$100", "$1,234", "$99"],
        negatives: ["100", "€100"],
      });
      expect(result.success).toBe(true);
      const regex = new RegExp(`^${result.pattern}$`);
      expect(regex.test("$500")).toBe(true);
      expect(regex.test("500")).toBe(false);
    });

    it("should reject patterns that match negatives", () => {
      const result = synthesizeRegex({
        positives: ["abc", "def"],
        negatives: ["ghi"], // Same pattern as positives
      });
      // Should still succeed but pattern should not match negatives
      if (result.success) {
        const regex = new RegExp(`^${result.pattern}$`);
        expect(regex.test("ghi")).toBe(false);
      }
    });

    it("should fail gracefully with conflicting examples", () => {
      const result = synthesizeRegex({
        positives: ["abc"],
        negatives: ["abc"], // Same as positive
      });
      expect(result.success).toBe(false);
    });

    it("should handle empty positives", () => {
      const result = synthesizeRegex({
        positives: [],
        negatives: ["abc"],
      });
      expect(result.success).toBe(false);
    });

    it("should work without negatives", () => {
      const result = synthesizeRegex({
        positives: ["foo", "bar", "baz"],
        negatives: [],
      });
      expect(result.success).toBe(true);
    });

    it("should synthesize for log levels", () => {
      const result = synthesizeRegex({
        positives: ["ERROR", "WARN", "INFO", "DEBUG"],
        negatives: ["error", "warning"],
      });
      expect(result.success).toBe(true);
      const regex = new RegExp(`^${result.pattern}$`);
      expect(regex.test("ERROR")).toBe(true);
      expect(regex.test("error")).toBe(false);
    });

    it("should synthesize for structured IDs", () => {
      const result = synthesizeRegex({
        positives: ["ID-001", "ID-002", "ID-999"],
        negatives: ["ID001", "id-001"],
      });
      expect(result.success).toBe(true);
      const regex = new RegExp(`^${result.pattern}$`);
      expect(regex.test("ID-123")).toBe(true);
      expect(regex.test("ID123")).toBe(false);
    });

    it("should return AST node when requested", () => {
      const result = synthesizeRegex({
        positives: ["123", "456"],
        negatives: [],
      });
      expect(result.success).toBe(true);
      expect(result.ast).toBeDefined();
    });
  });

  describe("Complex Patterns", () => {
    it("should handle IP addresses", () => {
      const result = synthesizeRegex({
        positives: ["192.168.1.1", "10.0.0.1", "255.255.255.0"],
        negatives: ["192.168.1", "not.an.ip"],
      });
      expect(result.success).toBe(true);
      const regex = new RegExp(`^${result.pattern}$`);
      expect(regex.test("172.16.0.1")).toBe(true);
    });

    it("should handle phone numbers", () => {
      const result = synthesizeRegex({
        positives: ["555-1234", "555-5678", "555-9999"],
        negatives: ["5551234", "555-123"],
      });
      expect(result.success).toBe(true);
      const regex = new RegExp(`^${result.pattern}$`);
      expect(regex.test("555-0000")).toBe(true);
      expect(regex.test("5550000")).toBe(false);
    });

    it("should handle version numbers", () => {
      const result = synthesizeRegex({
        positives: ["v1.0.0", "v2.3.4", "v10.20.30"],
        negatives: ["1.0.0", "v1.0"],
      });
      expect(result.success).toBe(true);
      const regex = new RegExp(`^${result.pattern}$`);
      expect(regex.test("v5.6.7")).toBe(true);
      expect(regex.test("5.6.7")).toBe(false);
    });

    it("should handle hex colors", () => {
      const result = synthesizeRegex({
        positives: ["#FF0000", "#00FF00", "#0000FF"],
        negatives: ["FF0000", "#FFF"],
      });
      expect(result.success).toBe(true);
      const regex = new RegExp(`^${result.pattern}$`);
      expect(regex.test("#AABBCC")).toBe(true);
      expect(regex.test("AABBCC")).toBe(false);
    });
  });
});

// =====================================================================
// Source-pattern checks (from audits)
// =====================================================================
describe("Source-pattern checks (from audits)", () => {
  // from tests/audit23.test.ts Audit23 #7: regex synthesis null positives guard
  describe("Audit23 #7: regex synthesis null positives guard", () => {
    it("should handle undefined input gracefully", async () => {
      const { synthesizeRegex } = await import(
        "../../../src/synthesis/regex/synthesis.js"
      );
      // Undefined input should not crash
      expect(() => {
        synthesizeRegex(undefined as any);
      }).not.toThrow();
      const result = synthesizeRegex(undefined as any);
      expect(result.success).toBe(false);
    });

    it("should handle null input gracefully", async () => {
      const { synthesizeRegex } = await import(
        "../../../src/synthesis/regex/synthesis.js"
      );
      expect(() => {
        synthesizeRegex(null as any);
      }).not.toThrow();
      const result = synthesizeRegex(null as any);
      expect(result.success).toBe(false);
    });
  });

  // from tests/audit27.test.ts Audit27 #10: regex synthesis position bounds
  describe("Audit27 #10: regex synthesis position bounds", () => {
    it("should handle variable-length examples gracefully", async () => {
      const mod = await import("../../../src/synthesis/regex/synthesis.js");
      expect(mod.synthesizeRegex).toBeDefined();
      // Variable-length examples should not crash
      const result = mod.synthesizeRegex({
        positives: ["ab", "abcd", "a"],
        negatives: ["xyz"],
      });
      // Should return a result (or null) without crashing
      expect(result === null || typeof result === "object").toBe(true);
    });
  });

  // from tests/audit34.test.ts #12 — regex synthesis should handle character class chars correctly
  describe("#12 — regex synthesis should handle character class chars correctly", () => {
        it("should not escape hyphens used as ranges in character classes", () => {
          const source = readFileSync("src/synthesis/regex/synthesis.ts", "utf-8");
          // The custom char class case should not use escapeRegex
          // or should use a char-class-specific escape function
          const customCase = source.match(/case "custom"[\s\S]*?return/);
          expect(customCase).not.toBeNull();
          // Should NOT use the general escapeRegex which breaks ranges
          expect(customCase![0]).not.toMatch(/escapeRegex\(node\.chars/);
        });
      });

  // from tests/audit36.test.ts #9 — regex synthesis should wrap nested repeats
  describe("#9 — regex synthesis should wrap nested repeats", () => {
        it("should also wrap repeat children in non-capturing groups", () => {
          const source = readFileSync("src/synthesis/regex/synthesis.ts", "utf-8");
          const repeatCase = source.match(/case "repeat"[\s\S]*?needsGroup/);
          expect(repeatCase).not.toBeNull();
          // Should include "repeat" in the needsGroup check
          expect(repeatCase![0]).toMatch(/repeat/);
        });
      });

  // from tests/audit43.test.ts #9 — escapeForCharClass should escape dash character
  describe("#9 — escapeForCharClass should escape dash character", () => {
      it("should include dash in the escape regex", () => {
        const source = readFileSync("src/synthesis/regex/synthesis.ts", "utf-8");
        const escapeFn = source.match(/function escapeForCharClass[\s\S]*?\n\}/);
        expect(escapeFn).not.toBeNull();
        // Should escape - (dash) inside character classes
        expect(escapeFn![0]).toMatch(/\\-|dash/i);
      });
    });

  // from tests/audit55.test.ts #9 — synthesizeRegex should limit example count
  describe("#9 — synthesizeRegex should limit example count", () => {
      it("should enforce max number of examples", () => {
        const source = readFileSync("src/synthesis/regex/synthesis.ts", "utf-8");
        const fnStart = source.indexOf("export function synthesizeRegex");
        expect(fnStart).toBeGreaterThan(-1);
        const fnBlock = source.slice(fnStart, fnStart + 400);
        // Should clamp or reject if too many positives
        expect(fnBlock).toMatch(/MAX_EXAMPLES|positives\s*=\s*positives\.slice|positives\.length\s*>\s*\d/);
      });
    });

  // from tests/audit55.test.ts #10 — matchTemplate should limit example string length
  describe("#10 — matchTemplate should limit example string length", () => {
      it("should check example string lengths", () => {
        const source = readFileSync("src/synthesis/regex/synthesis.ts", "utf-8");
        const fnStart = source.indexOf("export function matchTemplate");
        expect(fnStart).toBeGreaterThan(-1);
        const fnBlock = source.slice(fnStart, fnStart + 300);
        // Should check individual example string length
        expect(fnBlock).toMatch(/MAX_EXAMPLE_LENGTH|\.length\s*>\s*\d|every.*\.length/);
      });
    });

  // from tests/audit60.test.ts #6 — nodeToRegex should validate quantifier bounds
  describe("#6 — nodeToRegex should validate quantifier bounds", () => {
      it("should cap min/max quantifier values", () => {
        const source = readFileSync("src/synthesis/regex/synthesis.ts", "utf-8");
        const quantStart = source.indexOf("node.min === node.max");
        expect(quantStart).toBeGreaterThan(-1);
        // Check the region around quantifier handling for a bounds cap
        const quantBlock = source.slice(quantStart - 300, quantStart + 200);
        expect(quantBlock).toMatch(/node\.min\s*>\s*\d+|node\.max\s*>\s*\d+|MAX_QUANTIFIER/i);
      });
    });

  // from tests/audit63.test.ts #8 — analyzeCharacters should avoid spread on large arrays
  describe("#8 — analyzeCharacters should avoid spread on large arrays", () => {
      it("should use reduce or guard array size before Math.min/max spread", () => {
        const source = readFileSync("src/synthesis/regex/synthesis.ts", "utf-8");
        const fnStart = source.indexOf("function analyzeCharacters(");
        if (fnStart === -1) {
          const altStart = source.indexOf("export function analyzeCharacters(");
          expect(altStart).toBeGreaterThan(-1);
          const block = source.slice(altStart, altStart + 400);
          // Should NOT use Math.min(...lengths) or Math.max(...lengths) unguarded
          // Instead should use reduce or have a length cap
          expect(block).toMatch(/examples\.length\s*>|MAX_EXAMPLES|reduce/i);
        } else {
          const block = source.slice(fnStart, fnStart + 400);
          expect(block).toMatch(/examples\.length\s*>|MAX_EXAMPLES|reduce/i);
        }
      });
    });

  // from tests/audit64.test.ts #6 — conflict detection should use Set for O(1) lookup
  describe("#6 — conflict detection should use Set for O(1) lookup", () => {
      it("should use Set instead of Array.includes for negatives", () => {
        const source = readFileSync("src/synthesis/regex/synthesis.ts", "utf-8");
        const conflictStart = source.indexOf("Check for conflicts");
        if (conflictStart === -1) {
          // Try alternate text
          const altStart = source.indexOf("conflicts");
          expect(altStart).toBeGreaterThan(-1);
          const block = source.slice(Math.max(0, altStart - 100), altStart + 300);
          expect(block).toMatch(/new Set\(negatives\)|negSet|negativeSet/i);
        } else {
          const block = source.slice(conflictStart, conflictStart + 300);
          expect(block).toMatch(/new Set\(negatives\)|negSet|negativeSet/i);
        }
      });
    });

});
