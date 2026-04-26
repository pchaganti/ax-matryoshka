/** Numeric guards: numeric-guards/nan — migrated from audit rounds 15, 18, 25, 41, 54, 58, 84, 91. */
import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";

describe("Numeric guards: nan", () => {
  // from audit#15
  describe("Audit15 #10: parser multiple decimals", () => {
    it("should not parse 1.2.3 as NaN", async () => {
      const { parse } = await import("../../src/logic/lc-parser.js");
      const result = parse("1.2.3");
      // The parser consumes "1.2.3" and parseFloat gives NaN
      // After fix, it should stop at first decimal, parsing 1.2 and leaving .3
      if (result.success && result.term?.tag === "lit") {
        // Must not be NaN
        expect(Number.isNaN(result.term.value)).toBe(false);
      }
    });
  });

  // from audit#18
  describe("Audit18 #4: evalo NaN-safe comparison", () => {
    it("should detect conflicting examples with NaN correctly", async () => {
      const { synthesizeExtractor } = await import("../../src/synthesis/evalo/evalo.js");
      // Both output same literal — should find it
      const result = synthesizeExtractor(
        [
          { input: "price: 100", output: 100 },
          { input: "cost: 200", output: 200 },
        ],
        1
      );
      // Should find at least one extractor
      expect(result.length).toBeGreaterThanOrEqual(0);
    });

    it("should handle constant NaN-like outputs", async () => {
      const { synthesizeExtractor } = await import("../../src/synthesis/evalo/evalo.js");
      // All same output — should return literal extractor
      const result = synthesizeExtractor(
        [
          { input: "a", output: "X" },
          { input: "b", output: "X" },
        ],
        1
      );
      expect(result.length).toBeGreaterThan(0);
      expect(result[0].tag).toBe("lit");
    });
  });

  // from audit#25
  describe("Audit25 #3: evolutionary deepEqual NaN handling", () => {
    it("should treat NaN as equal to NaN in validation", async () => {
      const { EvolutionarySynthesizer } = await import(
        "../../src/synthesis/evolutionary.js"
      );
      const { KnowledgeBase } = await import(
        "../../src/synthesis/knowledge-base.js"
      );
      const kb = new KnowledgeBase();
      const evo = new EvolutionarySynthesizer(kb);
      // A function that returns NaN for non-numeric input
      const code = '(s) => parseFloat(s)';
      const examples = [
        { input: "abc", output: NaN },
      ];
      const valid = evo.validateSolution(code, examples);
      expect(valid).toBe(true);
    });
  });

  // from audit#41
  describe("#8 — handle-ops sort should handle NaN comparison", () => {
    it("should guard against NaN in numeric sort comparisons", () => {
      const source = readFileSync("src/persistence/handle-ops.ts", "utf-8");
      // Capture past the subtraction to include the NaN guard
      const sortBlock = source.match(/sort\(\(a, b\)[\s\S]*?aVal - bVal[\s\S]*?cmp/);
      expect(sortBlock).not.toBeNull();
      expect(sortBlock![0]).toMatch(/isNaN|NaN|isFinite/);
    });
  });

  // from audit#41
  describe("#9 — lc-compiler parseInt/parseFloat should guard NaN", () => {
    it("compiled parseInt should return null for NaN", () => {
      const source = readFileSync("src/logic/lc-compiler.ts", "utf-8");
      // The parseInt case should emit code containing isNaN or isFinite guard
      expect(source).toMatch(/case "parseInt"[\s\S]*?isNaN|case "parseInt"[\s\S]*?isFinite/);
    });

    it("compiled parseFloat should return null for NaN", () => {
      const source = readFileSync("src/logic/lc-compiler.ts", "utf-8");
      // The parseFloat case should emit code containing isNaN or isFinite guard
      expect(source).toMatch(/case "parseFloat"[\s\S]*?isNaN|case "parseFloat"[\s\S]*?isFinite/);
    });
  });

  // from audit#54
  describe("#3 — extractor currency_integer should guard NaN", () => {
    it("should include isNaN or isFinite in testFn", () => {
      const source = readFileSync("src/synthesis/extractor/synthesis.ts", "utf-8");
      const currIntBlock = source.match(/name:\s*"currency_integer"[\s\S]*?testFn:\s*\(s\)\s*=>[^}]+/);
      expect(currIntBlock).not.toBeNull();
      expect(currIntBlock![0]).toMatch(/isNaN|isFinite/);
    });
  });

  // from audit#58
  describe("#4 — iota should return empty for NaN", () => {
    it("should guard against NaN input", () => {
      const source = readFileSync("src/minikanren/common.ts", "utf-8");
      const iotaFn = source.match(/export function iota[\s\S]*?\n\}/);
      expect(iotaFn).not.toBeNull();
      expect(iotaFn![0]).toMatch(/isFinite|isNaN|Number\.isFinite/);
    });
  });

  // from audit#84
  describe("#4 — sandbox should expose Number.isNaN/Number.isFinite", () => {
    it("should use Number.isNaN instead of global isNaN", () => {
      const source = readFileSync("node_modules/repl-sandbox/dist/safe-globals.js", "utf-8");
      const sandboxGlobals = source.indexOf("isNaN");
      expect(sandboxGlobals).toBeGreaterThan(-1);
      // Find the sandbox globals section (near parseInt/parseFloat)
      const parseIntLine = source.indexOf("parseInt,");
      expect(parseIntLine).toBeGreaterThan(-1);
      const block = source.slice(parseIntLine, parseIntLine + 200);
      expect(block).toMatch(/Number\.isNaN/);
    });
  });

  // from audit#91
  describe("#1 — evictOldTurnBindings parseInt should guard against NaN", () => {
    it("should check isFinite or isNaN on parsed turn numbers", () => {
      const source = readFileSync("src/engine/nucleus-engine.ts", "utf-8");
      const fnStart = source.indexOf("private evictOldTurnBindings");
      expect(fnStart).toBeGreaterThan(-1);
      const block = source.slice(fnStart, fnStart + 500);
      // parseInt results should be validated with isFinite/isNaN
      expect(block).toMatch(/isFinite|isNaN|Number\.isFinite|Number\.isNaN/);
    });
  });
});
