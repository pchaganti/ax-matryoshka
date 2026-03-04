/**
 * Integration tests for synthesis system
 * Proves that miniKanren-based synthesis actually works
 */

import { describe, it, expect, beforeEach } from "vitest";
import { run, eq, conde, exist, Rel } from "../../src/minikanren/index.js";
import type { Var } from "../../src/minikanren/common.js";
import {
  synthesizeProgram,
  exprToCode,
  testProgram,
  enumerateCandidates,
  type Example,
} from "../../src/synthesis/relational/interpreter.js";
import { SynthesisCoordinator } from "../../src/synthesis/coordinator.js";
import { createSandboxWithSynthesis } from "../../src/synthesis/sandbox-tools.js";

describe("miniKanren Core Verification", () => {
  it("should enumerate solutions using run()", () => {
    // Basic test: find values where x = 5
    const results = run(3)((q: Var) => eq(q, 5));
    expect(results).toEqual([5]);
  });

  it("should handle conde for multiple solutions", () => {
    // Multiple solutions using conde
    const results = run(5)((q: Var) =>
      conde(
        eq(q, "apple"),
        eq(q, "banana"),
        eq(q, "cherry")
      )
    );
    expect(results).toEqual(["apple", "banana", "cherry"]);
  });

  it("should enumerate structure+pattern combinations", () => {
    // This is what the synthesis uses
    const candidates = enumerateCandidates(10);

    expect(candidates.length).toBeGreaterThan(0);
    expect(candidates[0]).toHaveProperty("structure");
    expect(candidates[0]).toHaveProperty("pattern");

    // Check that different structures are enumerated
    const structures = new Set(candidates.map(c => (c.structure as any).kind));
    expect(structures.size).toBeGreaterThan(1);
  });
});

describe("Relational Synthesis - Currency Extraction", () => {
  it("should synthesize currency extraction from examples", () => {
    const examples: Example[] = [
      { input: "$1,000", output: 1000 },
      { input: "$2,500", output: 2500 },
      { input: "$10,000", output: 10000 },
    ];

    const programs = synthesizeProgram(examples, 5);

    expect(programs.length).toBeGreaterThan(0);

    // Verify the program works
    const program = programs[0];
    expect(testProgram(program, examples)).toBe(true);

    // Generate code
    const code = exprToCode(program);
    expect(code).toBeDefined();
    expect(code.length).toBeGreaterThan(0);

    // Test the generated code
    const fn = new Function("input", `return ${code}`);
    expect(fn("$1,000")).toBe(1000);
    expect(fn("$5,000")).toBe(5000); // Unseen example
    expect(fn("$2,340,000")).toBe(2340000); // Large currency
  });

  it("should synthesize from scattered-data format", () => {
    // Examples from the actual test fixture format
    const examples: Example[] = [
      { input: "$2,340,000", output: 2340000 },
      { input: "$3,120,000", output: 3120000 },
      { input: "$2,890,000", output: 2890000 },
    ];

    const programs = synthesizeProgram(examples, 5);

    expect(programs.length).toBeGreaterThan(0);

    const program = programs[0];
    const code = exprToCode(program);
    const fn = new Function("input", `return ${code}`);

    // Test on all examples
    expect(fn("$2,340,000")).toBe(2340000);
    expect(fn("$3,120,000")).toBe(3120000);
    expect(fn("$2,890,000")).toBe(2890000);

    // Test on unseen examples
    expect(fn("$2,670,000")).toBe(2670000);
    expect(fn("$1,980,000")).toBe(1980000);
  });

  it("should handle percentage extraction", () => {
    const examples: Example[] = [
      { input: "50%", output: 50 },
      { input: "75%", output: 75 },
      { input: "100%", output: 100 },
    ];

    const programs = synthesizeProgram(examples, 5);

    expect(programs.length).toBeGreaterThan(0);

    const program = programs[0];
    expect(testProgram(program, examples)).toBe(true);
  });
});

describe("SynthesisCoordinator Integration", () => {
  let coordinator: SynthesisCoordinator;

  beforeEach(() => {
    coordinator = new SynthesisCoordinator();
  });

  it("should use miniKanren synthesis for extractors", () => {
    const result = coordinator.synthesize({
      type: "extractor",
      description: "currency extraction",
      positiveExamples: ["$1,000", "$2,500", "$10,000"],
      expectedOutputs: [1000, 2500, 10000],
    });

    expect(result.success).toBe(true);
    expect(result.extractor).toBeDefined();
    expect(result.extractorCode).toBeDefined();

    // Verify the extractor works
    const fn = result.extractor!.test;
    expect(fn("$1,000")).toBe(1000);
    expect(fn("$5,000")).toBe(5000); // Unseen
  });

  it("should extract from scattered-data style lines", () => {
    // Test with full line extraction
    const result = coordinator.synthesize({
      type: "extractor",
      description: "sales data extraction",
      positiveExamples: ["$2,340,000", "$3,120,000"],
      expectedOutputs: [2340000, 3120000],
    });

    expect(result.success).toBe(true);
    expect(result.extractor).toBeDefined();

    // Test
    const fn = result.extractor!.test;
    expect(fn("$2,340,000")).toBe(2340000);
    expect(fn("$2,670,000")).toBe(2670000);
    expect(fn("$1,980,000")).toBe(1980000);
  });
});

describe("Sandbox Synthesis Tools", () => {
  it("should synthesize extractor in sandbox context", async () => {
    const context = `
SALES_DATA_NORTH: $2,340,000
SALES_DATA_SOUTH: $3,120,000
SALES_DATA_EAST: $2,890,000
SALES_DATA_WEST: $2,670,000
SALES_DATA_CENTRAL: $1,980,000
`;

    const coordinator = new SynthesisCoordinator();
    const sandbox = await createSandboxWithSynthesis(
      context,
      async () => "",
      coordinator
    );

    // Test synthesize_extractor
    const extractorResult = await sandbox.execute(`
      const extractor = synthesize_extractor([
        { input: "$2,340,000", output: 2340000 },
        { input: "$3,120,000", output: 3120000 },
      ]);

      if (extractor) {
        console.log("Extractor synthesized!");
        console.log("Test $2,340,000:", extractor("$2,340,000"));
        console.log("Test $2,670,000:", extractor("$2,670,000"));
      } else {
        console.log("Synthesis failed!");
      }
    `);

    expect(extractorResult.error).toBeUndefined();
    expect(extractorResult.logs).toContain("Extractor synthesized!");
    expect(extractorResult.logs).toContain("Test $2,340,000: 2340000");
    expect(extractorResult.logs).toContain("Test $2,670,000: 2670000");

    sandbox.dispose();
  });

  it("should calculate total sales using synthesized extractor", async () => {
    const context = `
SALES_DATA_NORTH: $2,340,000
SALES_DATA_SOUTH: $3,120,000
SALES_DATA_EAST: $2,890,000
SALES_DATA_WEST: $2,670,000
SALES_DATA_CENTRAL: $1,980,000
`;

    const coordinator = new SynthesisCoordinator();
    const sandbox = await createSandboxWithSynthesis(
      context,
      async () => "",
      coordinator
    );

    // Full workflow: grep -> synthesize -> sum
    const result = await sandbox.execute(`
      // Step 1: Find sales data lines
      const hits = grep("SALES_DATA");
      console.log("Found", hits.length, "sales entries");

      // Step 2: Extract just the dollar amounts as examples
      const dollarValues = hits.map(h => {
        const match = h.line.match(/\\$[\\d,]+/);
        return match ? match[0] : null;
      }).filter(v => v !== null);

      console.log("Dollar values:", JSON.stringify(dollarValues));

      // Step 3: Synthesize an extractor from examples
      const extractor = synthesize_extractor([
        { input: dollarValues[0], output: parseFloat(dollarValues[0].replace(/[$,]/g, '')) },
        { input: dollarValues[1], output: parseFloat(dollarValues[1].replace(/[$,]/g, '')) },
      ]);

      // Step 4: Apply to all values and sum
      let total = 0;
      for (const value of dollarValues) {
        const num = extractor(value);
        console.log(value, "->", num);
        total += num;
      }

      console.log("Total:", total);
    `);

    expect(result.error).toBeUndefined();
    expect(result.logs).toContain("Found 5 sales entries");
    expect(result.logs).toContain("Total: 13000000");

    sandbox.dispose();
  });
});

describe("End-to-End Synthesis Proof", () => {
  it("should correctly sum sales from scattered-data.txt format", async () => {
    // Load actual test fixture content
    const fs = await import("fs");
    const path = await import("path");
    const fixturePath = path.join(process.cwd(), "test-fixtures/scattered-data.txt");
    const context = fs.readFileSync(fixturePath, "utf-8");

    const coordinator = new SynthesisCoordinator();
    const sandbox = await createSandboxWithSynthesis(
      context,
      async () => "",
      coordinator
    );

    const result = await sandbox.execute(`
      // Find SALES_DATA lines
      const hits = grep("SALES_DATA_");

      // Extract currency values
      const values = hits.map(h => {
        const match = h.line.match(/\\$[\\d,]+/);
        return match ? match[0] : null;
      }).filter(v => v !== null);

      // Synthesize extractor
      const extractor = synthesize_extractor([
        { input: values[0], output: parseFloat(values[0].replace(/[$,]/g, '')) },
        { input: values[1], output: parseFloat(values[1].replace(/[$,]/g, '')) },
      ]);

      // Sum all values
      let total = 0;
      for (const v of values) {
        total += extractor(v);
      }

      console.log("TOTAL_SALES:", total);
    `);

    expect(result.error).toBeUndefined();
    // Expected: 2,340,000 + 3,120,000 + 2,890,000 + 2,670,000 + 1,980,000 = 13,000,000
    expect(result.logs).toContain("TOTAL_SALES: 13000000");

    sandbox.dispose();
  });

  it("should show miniKanren enumeration is deterministic", () => {
    // Run enumeration multiple times and verify same results
    const run1 = enumerateCandidates(30);
    const run2 = enumerateCandidates(30);

    expect(run1.length).toBe(run2.length);
    expect(run1.length).toBe(30); // 5 structures * 6 patterns = 30

    // Verify structure
    for (let i = 0; i < run1.length; i++) {
      expect(run1[i].pattern).toBe(run2[i].pattern);
      expect((run1[i].structure as any).kind).toBe((run2[i].structure as any).kind);
    }
  });

  it("should synthesize different programs for different patterns", () => {
    // Currency pattern
    const currencyExamples: Example[] = [
      { input: "$100", output: 100 },
      { input: "$200", output: 200 },
    ];
    const currencyPrograms = synthesizeProgram(currencyExamples, 3);
    expect(currencyPrograms.length).toBeGreaterThan(0);

    // Percentage pattern
    const percentExamples: Example[] = [
      { input: "50%", output: 50 },
      { input: "75%", output: 75 },
    ];
    const percentPrograms = synthesizeProgram(percentExamples, 3);
    expect(percentPrograms.length).toBeGreaterThan(0);

    // Verify different code is generated
    const currencyCode = exprToCode(currencyPrograms[0]);
    const percentCode = exprToCode(percentPrograms[0]);

    expect(currencyCode).not.toBe(percentCode);
    expect(currencyCode).toContain("$"); // Currency pattern
    expect(percentCode).toContain("%"); // Percentage pattern
  });
});

describe("Synthesis Tool Correctness", () => {
  it("synthesize_extractor should work on real examples", async () => {
    const context = "test";
    const coordinator = new SynthesisCoordinator();
    const sandbox = await createSandboxWithSynthesis(
      context,
      async () => "",
      coordinator
    );

    // Test the synthesis tool returns working functions
    const result = await sandbox.execute(`
      const extractor = synthesize_extractor([
        { input: "$2,340,000", output: 2340000 },
        { input: "$3,120,000", output: 3120000 },
      ]);

      // Test on examples
      const test1 = extractor("$2,340,000");
      const test2 = extractor("$3,120,000");
      // Test on unseen data
      const test3 = extractor("$2,670,000");
      const test4 = extractor("$1,980,000");

      console.log("Synthesized extractor works:");
      console.log("$2,340,000 ->", test1, test1 === 2340000 ? "PASS" : "FAIL");
      console.log("$3,120,000 ->", test2, test2 === 3120000 ? "PASS" : "FAIL");
      console.log("$2,670,000 ->", test3, test3 === 2670000 ? "PASS" : "FAIL");
      console.log("$1,980,000 ->", test4, test4 === 1980000 ? "PASS" : "FAIL");
    `);

    expect(result.error).toBeUndefined();
    expect(result.logs.join(" ")).toContain("PASS");
    expect(result.logs.join(" ")).not.toContain("FAIL");

    sandbox.dispose();
  });

  it("get_extractor_code should return valid JavaScript", async () => {
    const context = "test";
    const coordinator = new SynthesisCoordinator();
    const sandbox = await createSandboxWithSynthesis(
      context,
      async () => "",
      coordinator
    );

    const result = await sandbox.execute(`
      const code = get_extractor_code([
        { input: "$1,000", output: 1000 },
        { input: "$2,500", output: 2500 },
      ]);

      console.log("Generated code:", code);

      // Verify the code works (using new Function, not eval)
      const fn = new Function("return " + code)();
      const test = fn("$5,000");
      console.log("Test $5,000 ->", test, test === 5000 ? "PASS" : "FAIL");
    `);

    expect(result.error).toBeUndefined();
    expect(result.logs.join(" ")).toContain("Generated code:");
    expect(result.logs.join(" ")).toContain("PASS");

    sandbox.dispose();
  });
});
