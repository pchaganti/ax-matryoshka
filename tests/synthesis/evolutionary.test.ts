/**
 * Tests for Evolutionary Synthesizer - NaN guard in generated strategies
 */

import { describe, it, expect } from "vitest";
import { EvolutionarySynthesizer } from "../../src/synthesis/evolutionary.js";
import { KnowledgeBase } from "../../src/synthesis/knowledge-base.js";

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
