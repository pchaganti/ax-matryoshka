/**
 * Audit #14 — Failing tests for 15 issues
 * These tests should FAIL before the fixes and PASS after.
 */

import { describe, it, expect } from "vitest";
import { evalExtractor } from "../src/synthesis/evalo/evalo.js";
import { compileToFunction } from "../src/synthesis/evalo/compile.js";
import { inferType } from "../src/synthesis/evalo/typeo.js";
import type { Extractor } from "../src/synthesis/evalo/types.js";
import { formatValue, evaluate, type SandboxTools } from "../src/logic/lc-interpreter.js";

// =========================================================================
// Issue #1 — evalo.ts: evalExtractor uses new RegExp without validateRegex
// =========================================================================
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
// =========================================================================
// Issue #3 — lc-solver.ts:888: evaluateWithBinding var resets depth to 0
// =========================================================================
describe("Issue #3: evaluateWithBinding var case should not reset depth", () => {
  it("should propagate depth for unbound variable lookup", async () => {
    const fs = await import("node:fs/promises");
    const source = await fs.readFile("src/logic/lc-solver.ts", "utf-8");

    // Find the evaluateWithBinding function
    const ewbFn = source.match(
      /function evaluateWithBinding\([\s\S]*?\n\}/m
    );
    expect(ewbFn).not.toBeNull();
    const ewbBody = ewbFn![0];

    // Find the var case — it should NOT call evaluate with depth 0
    // (The `await ` prefix is part of the match after the async refactor.)
    const varCase = ewbBody.match(/case "var":\s*\n[^}]*?return (?:await )?evaluate\([^)]+\)/);
    expect(varCase).not.toBeNull();
    // The var case should pass depth + 1, not 0
    expect(varCase![0]).not.toMatch(/evaluate\([^,]+,[^,]+,[^,]+,[^,]+,\s*0\s*\)/);
  });
});

// =========================================================================
// Issue #4 — coordinator.ts:266: knowledge base regex without validateRegex
// =========================================================================
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

// =========================================================================
// Issue #6 — lc-interpreter.ts:242: replace backreference injection
// =========================================================================
describe("Issue #6: interpreter replace should escape replacement backreferences", () => {
  it("should treat $1 in replacement as literal, not backreference", async () => {
    const tools: SandboxTools = {
      grep: () => [],
      fuzzy_search: () => [],
      text_stats: () => ({ length: 0, lineCount: 0, sample: { start: "", middle: "", end: "" } }),
      context: "",
    };
    const env = new Map();
    const log = () => {};

    const term = {
      tag: "replace" as const,
      str: { tag: "lit" as const, value: "hello world" },
      from: "(\\w+)",
      to: "$1-replaced",
    };
    const result = evaluate(term as any, tools, env, log);
    // If $1 is treated as literal, result should contain "$1-replaced"
    // If $1 is a backreference, result would be "hello-replaced world-replaced" (wrong)
    expect(String(result)).toContain("$1-replaced");
  });
});

// =========================================================================
// Issue #7 — synthesis-integrator.ts:305-307: EU currency single comma replace
// =========================================================================
describe("Issue #7: EU currency parser should replace all commas", () => {
  it("should parse EU format with multiple dot separators", async () => {
    const { SynthesisIntegrator } = await import("../src/logic/synthesis-integrator.js");
    const integrator = new SynthesisIntegrator();

    const result = integrator.synthesizeOnFailure({
      operation: "parseCurrency",
      input: "1.234.567,89€",
      examples: [
        { input: "1.234,56€", output: 1234.56 },
        { input: "2.345,67€", output: 2345.67 },
      ],
    });

    // The fn should work for inputs with multiple dot separators
    if (result.success && result.fn) {
      expect(result.fn("1.234.567,89€")).toBeCloseTo(1234567.89, 1);
    }
  });
});

// =========================================================================
// Issue #8 — relational-solver.ts:527: quarter regex too broad
// =========================================================================
describe("Issue #8: quarter regex should reject invalid quarters", () => {
  it("should not match Q5, Q0, or Q9", async () => {
    const fs = await import("node:fs/promises");
    const source = await fs.readFile("src/logic/relational-solver.ts", "utf-8");

    // Find the quarterRegex definition
    const quarterRegexMatch = source.match(/const quarterRegex\s*=\s*\/([^/]+)\//);
    expect(quarterRegexMatch).not.toBeNull();
    const pattern = quarterRegexMatch![1];

    // The regex should only match Q1-Q4, not Q0 or Q5-Q9
    const regex = new RegExp(pattern);
    expect(regex.test("Q5-2024")).toBe(false);
    expect(regex.test("Q0-2024")).toBe(false);
    expect(regex.test("Q9-2024")).toBe(false);
    // But should still match valid quarters
    expect(regex.test("Q1-2024")).toBe(true);
    expect(regex.test("Q4-2024")).toBe(true);
  });
});
// =========================================================================
// Issue #10 — lc-solver.ts:409: replace $1 backreference in solver
// =========================================================================
describe("Issue #10: solver replace should escape replacement backreferences", () => {
  it("should treat $1 in replacement as literal string", async () => {
    const solverMod2 = await import("../src/logic/lc-solver.js");
    const { parse } = await import("../src/logic/lc-parser.js");

    const tools: any = {
      context: "",
      grep: () => [],
      fuzzy_search: () => [],
      text_stats: () => ({ length: 0, lineCount: 0, sample: { start: "", middle: "", end: "" } }),
    };

    const parsed = parse('(replace "hello world" "(\\\\w+)" "$1-test")');
    expect(parsed.success).toBe(true);
    const result = await solverMod2.solve(parsed.term!, tools);
    expect(result.success).toBe(true);
    // Should contain literal "$1-test", not a backreference substitution
    expect(String(result.value)).toContain("$1-test");
  });
});
// =========================================================================
// Issue #14 — lc-interpreter.ts:251: negative split index not validated
// =========================================================================
describe("Issue #14: interpreter split should reject negative index", () => {
  it("should return null for negative split index", async () => {
    const tools: SandboxTools = {
      grep: () => [],
      fuzzy_search: () => [],
      text_stats: () => ({ length: 0, lineCount: 0, sample: { start: "", middle: "", end: "" } }),
      context: "",
    };
    const env = new Map();
    const log = () => {};

    const term = {
      tag: "split" as const,
      str: { tag: "lit" as const, value: "a:b:c" },
      delim: ":",
      index: -1,
    };
    const result = evaluate(term as any, tools, env, log);
    expect(result).toBeNull();
  });
});

// =========================================================================
// Issue #15 — typeo.ts: inferType missing default case
// =========================================================================
describe("Issue #15: inferType should return unknown for unrecognized tags", () => {
  it("should return 'unknown' for a made-up tag", async () => {
    const e = { tag: "nonexistent" } as unknown as Extractor;
    const result = inferType(e);
    // Should return "unknown", not undefined
    expect(result).toBe("unknown");
  });
});
