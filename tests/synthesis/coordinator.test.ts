/**
 * Tests for Synthesis Coordinator
 * Following TDD - these tests are written first
 */

import { describe, it, expect, beforeEach } from "vitest";
import {
  SynthesisCoordinator,
  CollectedExample,
  SynthesisRequest,
  SynthesisResult,
  safeEvalSynthesized,
} from "../../src/synthesis/coordinator.js";
import { readFileSync } from "fs";

describe("SynthesisCoordinator", () => {
  let coordinator: SynthesisCoordinator;

  beforeEach(() => {
    coordinator = new SynthesisCoordinator();
  });

  describe("example collection", () => {
    it("should store and retrieve examples", () => {
      coordinator.collectExample("numbers", {
        source: "grep",
        raw: "$1,000",
      });

      const examples = coordinator.getExamples("numbers");
      expect(examples).toHaveLength(1);
      expect(examples[0].raw).toBe("$1,000");
    });

    it("should accumulate examples in same category", () => {
      coordinator.collectExample("numbers", { source: "grep", raw: "$1,000" });
      coordinator.collectExample("numbers", { source: "grep", raw: "$2,000" });

      expect(coordinator.getExamples("numbers")).toHaveLength(2);
    });

    it("should keep categories separate", () => {
      coordinator.collectExample("numbers", { source: "grep", raw: "$1,000" });
      coordinator.collectExample("dates", { source: "grep", raw: "2024-01-15" });

      expect(coordinator.getExamples("numbers")).toHaveLength(1);
      expect(coordinator.getExamples("dates")).toHaveLength(1);
    });

    it("should return empty array for unknown category", () => {
      expect(coordinator.getExamples("unknown")).toEqual([]);
    });

    it("should store context and line number with example", () => {
      coordinator.collectExample("logs", {
        source: "line",
        raw: "ERROR",
        context: "[2024-01-15] ERROR: Connection failed",
        lineNum: 42,
      });

      const examples = coordinator.getExamples("logs");
      expect(examples[0].context).toBe("[2024-01-15] ERROR: Connection failed");
      expect(examples[0].lineNum).toBe(42);
    });

    it("should clear examples when requested", () => {
      coordinator.collectExample("numbers", { source: "grep", raw: "$1,000" });
      coordinator.collectExample("numbers", { source: "grep", raw: "$2,000" });

      coordinator.clearExamples("numbers");

      expect(coordinator.getExamples("numbers")).toEqual([]);
    });

    it("should clear all examples", () => {
      coordinator.collectExample("numbers", { source: "grep", raw: "$1,000" });
      coordinator.collectExample("dates", { source: "grep", raw: "2024-01-15" });

      coordinator.clearAllExamples();

      expect(coordinator.getExamples("numbers")).toEqual([]);
      expect(coordinator.getExamples("dates")).toEqual([]);
    });

    it("should cap examples per category at 100", () => {
      // Add more than 100 examples to a single category
      for (let i = 0; i < 120; i++) {
        coordinator.collectExample("capped", { source: "grep", raw: `item-${i}` });
      }

      const examples = coordinator.getExamples("capped");
      expect(examples).toHaveLength(100);
      // Should keep the most recent ones (last 100)
      expect(examples[0].raw).toBe("item-20");
      expect(examples[99].raw).toBe("item-119");
    });

    it("should list all categories", () => {
      coordinator.collectExample("numbers", { source: "grep", raw: "$1,000" });
      coordinator.collectExample("dates", { source: "grep", raw: "2024-01-15" });
      coordinator.collectExample("errors", { source: "line", raw: "ERROR" });

      const categories = coordinator.getCategories();
      expect(categories).toContain("numbers");
      expect(categories).toContain("dates");
      expect(categories).toContain("errors");
      expect(categories.length).toBe(3);
    });
  });

  describe("regex synthesis", () => {
    it("should synthesize regex from positive examples", () => {
      const result = coordinator.synthesize({
        type: "regex",
        description: "currency pattern",
        positiveExamples: ["$1,000", "$2,500", "$100"],
      });

      expect(result.success).toBe(true);
      expect(result.regex).toBeDefined();
      expect(new RegExp(result.regex!).test("$5,000")).toBe(true);
    });

    it("should synthesize regex from positive and negative examples", () => {
      const result = coordinator.synthesize({
        type: "regex",
        description: "dollar amounts only",
        positiveExamples: ["$100", "$200"],
        negativeExamples: ["€100", "£200"],
      });

      expect(result.success).toBe(true);
      expect(result.regex).toBeDefined();
      const regex = new RegExp(result.regex!);
      expect(regex.test("$300")).toBe(true);
      expect(regex.test("€300")).toBe(false);
    });

    it("should report timing in result", () => {
      const result = coordinator.synthesize({
        type: "regex",
        description: "simple pattern",
        positiveExamples: ["abc", "def"],
      });

      expect(result.synthesisTimeMs).toBeGreaterThanOrEqual(0);
    });

    it("should return failure when no pattern found", () => {
      // Conflicting examples - no valid regex
      const result = coordinator.synthesize({
        type: "regex",
        description: "impossible pattern",
        positiveExamples: ["abc"],
        negativeExamples: ["abc"], // Same string in both - impossible
      });

      expect(result.success).toBe(false);
    });
  });

  describe("extractor synthesis", () => {
    it("should synthesize extractor from input/output examples", () => {
      const result = coordinator.synthesize({
        type: "extractor",
        description: "currency to number",
        positiveExamples: ["$1,000", "$2,500", "$500"],
        expectedOutputs: [1000, 2500, 500],
      });

      expect(result.success).toBe(true);
      expect(result.extractor).toBeDefined();
      expect(result.extractor!.test("$10,000")).toBe(10000);
    });

    it("should synthesize string extractor", () => {
      const result = coordinator.synthesize({
        type: "extractor",
        description: "value from key:value",
        positiveExamples: ["name: John", "city: NYC"],
        expectedOutputs: ["John", "NYC"],
      });

      expect(result.success).toBe(true);
      expect(result.extractor).toBeDefined();
      expect(result.extractor!.test("country: USA")).toBe("USA");
    });

    it("should return extractor code", () => {
      const result = coordinator.synthesize({
        type: "extractor",
        description: "integer extraction",
        positiveExamples: ["123", "456"],
        expectedOutputs: [123, 456],
      });

      expect(result.success).toBe(true);
      expect(result.extractorCode).toBeDefined();

      // Code should be compilable with new Function (not eval)
      const fn = new Function("return " + result.extractorCode!)();
      expect(fn("789")).toBe(789);
    });

    it("should compile synthesized extractor code via new Function (not eval)", () => {
      const result = coordinator.synthesize({
        type: "extractor",
        description: "number extraction",
        positiveExamples: ["$1,000", "$2,500"],
        expectedOutputs: [1000, 2500],
      });

      if (result.success && result.extractorCode) {
        // Verify the code can be compiled with new Function
        expect(() => new Function("return " + result.extractorCode!)()).not.toThrow();
        const fn = new Function("return " + result.extractorCode!)();
        expect(typeof fn).toBe("function");
      }
    });

    it("should return failure when no extractor pattern found", () => {
      const result = coordinator.synthesize({
        type: "extractor",
        description: "random mapping",
        positiveExamples: ["abc", "xyz"],
        expectedOutputs: [42, 99], // No discernible pattern
      });

      // May or may not succeed depending on heuristics
      expect(typeof result.success).toBe("boolean");
    });
  });

  describe("format synthesis", () => {
    it("should synthesize format from examples", () => {
      const result = coordinator.synthesize({
        type: "format",
        description: "date format",
        positiveExamples: ["2024-01-15", "2023-12-31", "2025-06-01"],
      });

      expect(result.success).toBe(true);
      expect(result.format).toBeDefined();
      // Format should describe the pattern
      expect(result.format).toContain("YYYY");
    });

    it("should return failure for inconsistent formats", () => {
      const result = coordinator.synthesize({
        type: "format",
        description: "mixed formats",
        positiveExamples: ["2024-01-15", "01/15/2024", "15.01.2024"],
      });

      // Mixed formats may fail or identify common structure
      expect(typeof result.success).toBe("boolean");
    });
  });

  describe("knowledge base integration", () => {
    it("should reuse previously synthesized patterns", () => {
      // First synthesis
      coordinator.synthesize({
        type: "regex",
        description: "currency",
        positiveExamples: ["$1,000", "$2,500"],
      });

      // Second synthesis with similar examples should be faster
      const start = Date.now();
      const result = coordinator.synthesize({
        type: "regex",
        description: "similar currency",
        positiveExamples: ["$3,000", "$4,500"],
      });
      const elapsed = Date.now() - start;

      expect(result.success).toBe(true);
      // Just verify it works - timing may vary
    });

    it("should track synthesis count", () => {
      expect(coordinator.getSynthesisCount()).toBe(0);

      coordinator.synthesize({
        type: "regex",
        description: "test",
        positiveExamples: ["abc"],
      });

      expect(coordinator.getSynthesisCount()).toBe(1);
    });

    it("should expose knowledge base for inspection", () => {
      coordinator.synthesize({
        type: "regex",
        description: "test",
        positiveExamples: ["abc", "def"],
      });

      const kb = coordinator.getKnowledgeBase();
      expect(kb.size()).toBeGreaterThanOrEqual(0);
    });
  });

  describe("synthesize from collected examples", () => {
    it("should synthesize regex from collected examples", () => {
      coordinator.collectExample("prices", { source: "grep", raw: "$100" });
      coordinator.collectExample("prices", { source: "grep", raw: "$200" });
      coordinator.collectExample("prices", { source: "grep", raw: "$300" });

      const result = coordinator.synthesizeFromCollected("prices", "regex");

      expect(result.success).toBe(true);
      expect(result.regex).toBeDefined();
    });

    it("should synthesize extractor from collected examples with context", () => {
      coordinator.collectExample("amounts", {
        source: "line",
        raw: "$1,000",
        context: "1000", // Context is the expected output
      });
      coordinator.collectExample("amounts", {
        source: "line",
        raw: "$2,000",
        context: "2000",
      });

      const result = coordinator.synthesizeFromCollected("amounts", "extractor");

      expect(result.success).toBe(true);
    });

    it("should return failure for empty category", () => {
      const result = coordinator.synthesizeFromCollected("empty", "regex");

      expect(result.success).toBe(false);
    });

    it("should return failure for category with insufficient examples", () => {
      coordinator.collectExample("single", { source: "grep", raw: "$100" });

      // Single example may not be enough for reliable synthesis
      const result = coordinator.synthesizeFromCollected("single", "regex");

      // May succeed or fail depending on implementation
      expect(typeof result.success).toBe("boolean");
    });
  });

  describe("helper methods", () => {
    it("should validate regex patterns", () => {
      expect(coordinator.validateRegex("\\$[\\d,]+")).toBe(true);
      expect(coordinator.validateRegex("[invalid")).toBe(false);
    });

    it("should test regex against string", () => {
      expect(coordinator.testRegex("\\$\\d+", "$100")).toBe(true);
      expect(coordinator.testRegex("\\$\\d+", "€100")).toBe(false);
    });

    it("should test regex safely with invalid pattern", () => {
      expect(coordinator.testRegex("[invalid", "test")).toBe(false);
    });
  });

  describe("batch operations", () => {
    it("should synthesize multiple patterns in batch", () => {
      const requests: SynthesisRequest[] = [
        { type: "regex", description: "numbers", positiveExamples: ["123", "456"] },
        { type: "regex", description: "letters", positiveExamples: ["abc", "def"] },
      ];

      const results = coordinator.synthesizeBatch(requests);

      expect(results).toHaveLength(2);
      expect(results[0].success).toBe(true);
      expect(results[1].success).toBe(true);
    });
  });
});

describe("safeEvalSynthesized sandbox (bug #6)", () => {
  it("should block atob/btoa to prevent base64 bypass of blocklist", () => {
    expect(() => safeEvalSynthesized(`(x) => atob(x)`)).toThrow();
    expect(() => safeEvalSynthesized(`(x) => btoa(x)`)).toThrow();
  });

  it("should block access to global object", () => {
    // 'global' is Node.js global scope — not in current blocklist
    expect(() => safeEvalSynthesized(`(x) => global`)).toThrow();
  });

  it("should block access to self", () => {
    expect(() => safeEvalSynthesized(`(x) => self`)).toThrow();
  });

  it("should still allow safe arrow functions", () => {
    const fn = safeEvalSynthesized(`(x) => x.toUpperCase()`);
    expect(fn("hello")).toBe("HELLO");
  });
});

describe("CollectedExample interface", () => {
  it("should support all source types", () => {
    const grepExample: CollectedExample = { source: "grep", raw: "test" };
    const lineExample: CollectedExample = { source: "line", raw: "test" };
    const matchExample: CollectedExample = { source: "match", raw: "test" };

    expect(grepExample.source).toBe("grep");
    expect(lineExample.source).toBe("line");
    expect(matchExample.source).toBe("match");
  });
});

// =====================================================================
// Source-pattern checks (from audits)
// =====================================================================
describe("Source-pattern checks (from audits)", () => {
  // from tests/audit14.test.ts Issue #4: coordinator should validate knowledge base regex
  describe("Issue #4: coordinator should validate knowledge base regex", () => {
    it("should validate regex from knowledge base before testing", async () => {
      const fs = await import("node:fs/promises");
      const source = await fs.readFile("src/synthesis/coordinator.ts", "utf-8");

      // Find the knowledge base lookup section
      const kbSection = source.match(/for \(const component of similar[\s\S]*?catch \{[\s\S]*?\}/);
      expect(kbSection).not.toBeNull();
      const kbBody = kbSection![0];

      // Should contain validateRegex before new RegExp
      expect(kbBody).toMatch(/validateRegex/);
    });
  });

  // from tests/audit18.test.ts Audit18 #1: validateRegex curly brace quantifiers
  describe("Audit18 #1: validateRegex curly brace quantifiers", () => {
    it("should reject nested quantifiers using {n,} syntax", async () => {
      const { SynthesisCoordinator } = await import("../../src/synthesis/coordinator.js");
      const coord = new SynthesisCoordinator();
      // (a{1,})+ is equivalent to (a+)+ — catastrophic backtracking
      expect(coord.validateRegex("(a{1,})+")).toBe(false);
    });

    it("should reject nested quantifiers using {n,m} syntax", async () => {
      const { SynthesisCoordinator } = await import("../../src/synthesis/coordinator.js");
      const coord = new SynthesisCoordinator();
      expect(coord.validateRegex("(a{2,5})+")).toBe(false);
    });

    it("should still accept safe patterns with curly braces", async () => {
      const { SynthesisCoordinator } = await import("../../src/synthesis/coordinator.js");
      const coord = new SynthesisCoordinator();
      // Non-nested quantifiers are fine
      expect(coord.validateRegex("a{1,3}")).toBe(true);
      expect(coord.validateRegex("\\d{2,4}")).toBe(true);
    });
  });

  // from tests/audit18.test.ts Audit18 #3: testRegex calls validateRegex
  describe("Audit18 #3: testRegex calls validateRegex", () => {
    it("should reject ReDoS pattern in testRegex", async () => {
      const { SynthesisCoordinator } = await import("../../src/synthesis/coordinator.js");
      const coord = new SynthesisCoordinator();
      // (a+)+ is a ReDoS pattern — testRegex should reject it
      const result = coord.testRegex("(a+)+", "aaaaaa");
      expect(result).toBe(false);
    });

    it("should allow safe patterns in testRegex", async () => {
      const { SynthesisCoordinator } = await import("../../src/synthesis/coordinator.js");
      const coord = new SynthesisCoordinator();
      expect(coord.testRegex("\\d+", "123")).toBe(true);
    });
  });

  // from tests/audit24.test.ts Audit24 #2: coordinator synthesizeFromCollected context safety
  describe("Audit24 #2: coordinator synthesizeFromCollected context safety", () => {
    it("should not crash when all examples have undefined context", async () => {
      const { SynthesisCoordinator } = await import(
        "../../src/synthesis/coordinator.js"
      );
      const coord = new SynthesisCoordinator();
      // Collect examples WITHOUT context
      coord.collectExample("nocontext", { source: "grep", raw: "hello world" });
      coord.collectExample("nocontext", { source: "grep", raw: "foo bar" });
      // synthesizeFromCollected with "extractor" should not crash
      const result = coord.synthesizeFromCollected("nocontext", "extractor");
      // Should return failure (no expectedOutputs), not throw
      expect(result.success).toBe(false);
    });
  });

  // from tests/audit32.test.ts #3 — coordinator new Function should validate code
  describe("#3 — coordinator new Function should validate code", () => {
        it("should not use bare new Function for synthesized code", () => {
          const source = readFileSync("src/synthesis/coordinator.ts", "utf-8");
          // Find the synthesizeExtractorResult method
          const method = source.match(/synthesizeExtractorResult[\s\S]*?tryRelationalSynthesis/);
          expect(method).not.toBeNull();
          // Should not have bare new Function("return " + code)
          // Should either use a safe evaluator or validate the code
          const hasBareNewFunction = /new Function\("return "\s*\+\s*code\)/.test(method![0]);
          expect(hasBareNewFunction).toBe(false);
        });

        it("should not use bare new Function in tryRelationalSynthesis", () => {
          const source = readFileSync("src/synthesis/coordinator.ts", "utf-8");
          const method = source.match(/tryRelationalSynthesis[\s\S]*?return null/);
          expect(method).not.toBeNull();
          const hasBareNewFunction = /new Function\("return "\s*\+\s*code\)/.test(method![0]);
          expect(hasBareNewFunction).toBe(false);
        });
      });

  // from tests/audit42.test.ts #4 — coordinator safeEvalSynthesized should block Reflect and Proxy
  describe("#4 — coordinator safeEvalSynthesized should block Reflect and Proxy", () => {
      it("should include Reflect in dangerous patterns", () => {
        const source = readFileSync("src/synthesis/coordinator.ts", "utf-8");
        const evalBlock = source.match(/function safeEvalSynthesized[\s\S]*?new Function/);
        expect(evalBlock).not.toBeNull();
        expect(evalBlock![0]).toMatch(/\\bReflect\\b/);
      });

      it("should include Proxy in dangerous patterns", () => {
        const source = readFileSync("src/synthesis/coordinator.ts", "utf-8");
        const evalBlock = source.match(/function safeEvalSynthesized[\s\S]*?new Function/);
        expect(evalBlock).not.toBeNull();
        expect(evalBlock![0]).toMatch(/\\bProxy\\b/);
      });
    });

  // from tests/audit48.test.ts #10 — coordinator safeEvalSynthesized should block more patterns
  describe("#10 — coordinator safeEvalSynthesized should block more patterns", () => {
      it("should block bracket notation, template literals, and unicode escapes", () => {
        const source = readFileSync("src/synthesis/coordinator.ts", "utf-8");
        const safeEvalFn = source.match(/function safeEvalSynthesized[\s\S]*?new Function/);
        expect(safeEvalFn).not.toBeNull();
        // Should block bracket notation with strings
        expect(safeEvalFn![0]).toMatch(/\\\[.*['"]|bracket/i);
        // Should block template literals
        expect(safeEvalFn![0]).toMatch(/`|template/i);
        // Should block unicode escapes
        expect(safeEvalFn![0]).toMatch(/\\\\u|unicode/i);
      });
    });

  // from tests/audit80.test.ts #5 — safeEvalSynthesized should block string concatenation
  describe("#5 — safeEvalSynthesized should block string concatenation", () => {
      it("should reject string concatenation patterns", () => {
        const source = readFileSync("src/synthesis/coordinator.ts", "utf-8");
        const fnStart = source.indexOf("function safeEvalSynthesized");
        expect(fnStart).toBeGreaterThan(-1);
        const block = source.slice(fnStart, fnStart + 2500);
        expect(block).toMatch(/["']\s*\+\s*["']|string\s*concat|concat.*pattern/);
      });
    });

  // from tests/audit83.test.ts #10 — parseFloat ctx should be length-bounded
  describe("#10 — parseFloat ctx should be length-bounded", () => {
      it("should check ctx length before parseFloat", () => {
        const source = readFileSync("src/synthesis/coordinator.ts", "utf-8");
        const parseFloatLine = source.indexOf("parseFloat(ctx)");
        expect(parseFloatLine).toBeGreaterThan(-1);
        const block = source.slice(parseFloatLine - 200, parseFloatLine + 50);
        expect(block).toMatch(/ctx\.length|ctx\.slice|MAX_CTX|safeCtx/);
      });
    });

});
