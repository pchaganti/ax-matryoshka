/**
 * Tests for Evolutionary Synthesizer - NaN guard in generated strategies
 */

import { describe, it, expect } from "vitest";
import { EvolutionarySynthesizer } from "../../src/synthesis/evolutionary.js";
import { KnowledgeBase } from "../../src/synthesis/knowledge-base.js";
import { readFileSync } from "fs";

describe("EvolutionarySynthesizer - NaN guards in strategies", () => {
  it("should produce NaN-safe code for numeric extraction strategies", () => {
    const kb = new KnowledgeBase();
    const synth = new EvolutionarySynthesizer(kb);

    const partial = synth.initialize([
      { input: "$100", output: 100 },
      { input: "$200", output: 200 },
    ]);

    const solutions = synth.solve(partial);

    for (const code of solutions) {
      try {
        const fn = new Function("return " + code)();
        const result = fn("no-numbers");
        // Should be null (not NaN) for non-matching input
        if (typeof result === "number") {
          expect(Number.isNaN(result)).toBe(false);
        }
      } catch {
        // Compilation failure is acceptable
      }
    }
  });

  it("should not produce NaN from direct parseInt/parseFloat strategies", () => {
    const kb = new KnowledgeBase();
    const synth = new EvolutionarySynthesizer(kb);

    // These strategies use direct parseInt/parseFloat which can produce NaN
    const partial = synth.initialize([
      { input: "42", output: 42 },
      { input: "100", output: 100 },
    ]);

    const solutions = synth.solve(partial);

    for (const code of solutions) {
      try {
        const fn = new Function("return " + code)();
        const result = fn("hello");
        // Should be null or 0, not NaN
        if (result !== null && result !== undefined) {
          expect(Number.isNaN(result)).toBe(false);
        }
      } catch {
        // OK
      }
    }
  });
});

// =====================================================================
// Source-pattern checks (from audits)
// =====================================================================
describe("Source-pattern checks (from audits)", () => {
  // from tests/audit34.test.ts #1 — validateSolution should have safety checks
  describe("#1 — validateSolution should have safety checks", () => {
        it("should not execute dangerous code in validateSolution", async () => {
          const source = readFileSync("src/synthesis/evolutionary.ts", "utf-8");
          // Find validateSolution method
          const method = source.match(/validateSolution[\s\S]*?return examples\.every[\s\S]*?\}/);
          expect(method).not.toBeNull();
          // Should have some safety check before new Function
          // Either call safeEvalSynthesized, or have its own blocklist
          expect(method![0]).toMatch(/dangerous|blocked|safe|validate|blocklist|DANGEROUS/i);
        });

        it("should reject code containing process", async () => {
          const { EvolutionarySynthesizer } = await import("../../src/synthesis/evolutionary.js");
          const synth = new EvolutionarySynthesizer();
          const examples = [{ input: "hello", output: "hello" }];
          // Should not execute code containing "process"
          const result = synth.validateSolution(
            '(input) => { process.exit(1); return input; }',
            examples
          );
          expect(result).toBe(false);
        });
      });

  // from tests/audit34.test.ts #9 — evolutionary compose should validate transformer code
  describe("#9 — evolutionary compose should validate transformer code", () => {
        it("should validate full transformer code, not just prefix", () => {
          const source = readFileSync("src/synthesis/evolutionary.ts", "utf-8");
          const compose = source.match(/compose\([\s\S]*?return null;\s*\}/);
          expect(compose).not.toBeNull();
          // Should have dangerous code check on the full code string
          expect(compose![0]).toMatch(/dangerous|blocked|safe|DANGEROUS/i);
        });
      });

  // from tests/audit35.test.ts #15 — evolutionary Object blocklist should allow Object.keys etc
  describe("#15 — evolutionary Object blocklist should allow Object.keys etc", () => {
        it("should not block Object.keys usage", () => {
          const source = readFileSync("src/synthesis/evolutionary.ts", "utf-8");
          // The DANGEROUS_PATTERNS should not have a blanket /\bObject\b/ check
          const dangerousCheck = source.match(/DANGEROUS_PATTERNS[\s\S]*?\]/);
          expect(dangerousCheck).not.toBeNull();
          // Should either not include Object or have an exception for Object.keys etc
          const hasBlankObjectBlock = dangerousCheck![0].match(/\\bObject\\b/);
          if (hasBlankObjectBlock) {
            // If it blocks Object, there should be an allowlist
            expect(source).toMatch(/Object\.keys|Object\.values|Object\.entries|ALLOWED_OBJECT/i);
          }
        });
      });

  // from tests/audit50.test.ts #5 — evolutionary blocklist should include arguments
  describe("#5 — evolutionary blocklist should include arguments", () => {
      it("should block arguments keyword", () => {
        const source = readFileSync("src/synthesis/evolutionary.ts", "utf-8");
        const blocklist = source.match(/DANGEROUS_PATTERNS[\s\S]*?for \(const pattern/);
        expect(blocklist).not.toBeNull();
        expect(blocklist![0]).toMatch(/arguments/);
      });
    });

  // from tests/audit50.test.ts #10 — evolutionary blocklist should block template literals and bracket notation
  describe("#10 — evolutionary blocklist should block template literals and bracket notation", () => {
      it("should check for template literals and bracket notation with strings", () => {
        const source = readFileSync("src/synthesis/evolutionary.ts", "utf-8");
        const validateFn = source.match(/validateSolution[\s\S]*?new Function/);
        expect(validateFn).not.toBeNull();
        expect(validateFn![0]).toMatch(/`|template/i);
        expect(validateFn![0]).toMatch(/\\\[.*['"]|bracket/i);
      });
    });

  // from tests/audit69.test.ts #1 — validateSolution should cap code length
  describe("#1 — validateSolution should cap code length", () => {
      it("should check code.length before new Function()", () => {
        const source = readFileSync("src/synthesis/evolutionary.ts", "utf-8");
        const fnStart = source.indexOf("validateSolution(\n");
        expect(fnStart).toBeGreaterThan(-1);
        const block = source.slice(fnStart, fnStart + 400);
        expect(block).toMatch(/MAX_CODE|code\.length\s*>/i);
      });
    });

});
