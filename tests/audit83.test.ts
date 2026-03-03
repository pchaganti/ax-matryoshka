/**
 * Audit #83 — 10 security issues
 *
 * 1. HIGH   compile.ts — Number.isInteger instead of isSafeInteger for split index
 * 2. HIGH   synthesis-integrator.ts — unbounded individualPatterns creates massive regex
 * 3. MEDIUM relational/interpreter.ts — missing `with` in DANGEROUS_CODE_PATTERNS
 * 4. MEDIUM relational/interpreter.ts — missing `delete` in DANGEROUS_CODE_PATTERNS
 * 5. MEDIUM relational/interpreter.ts — match expr returns undefined not null
 * 6. MEDIUM sandbox-tools.ts — Object.fromEntries enables __proto__ creation
 * 7. MEDIUM sandbox-tools.ts — Object.defineProperty exposed in sandbox
 * 8. MEDIUM relational/interpreter.ts — maxResults parameter unbounded
 * 9. MEDIUM synthesis-integrator.ts — orPattern length not checked
 * 10. LOW  coordinator.ts — parseFloat ctx input not length-bounded
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";

describe("Audit #83", () => {
  // =========================================================================
  // #1 HIGH — compile.ts Number.isInteger → isSafeInteger for split index
  // =========================================================================
  describe("#1 — compile split index should use isSafeInteger", () => {
    it("should validate split index with isSafeInteger", () => {
      const source = readFileSync("src/synthesis/evalo/compile.ts", "utf-8");
      const splitCase = source.indexOf('case "split"');
      expect(splitCase).toBeGreaterThan(-1);
      const block = source.slice(splitCase, splitCase + 400);
      expect(block).toMatch(/isSafeInteger\(idx\)/);
    });
  });

  // =========================================================================
  // #2 HIGH — synthesis-integrator.ts unbounded individualPatterns
  // =========================================================================
  describe("#2 — findDistinguishingPattern should cap individualPatterns", () => {
    it("should limit the number of individual patterns", () => {
      const source = readFileSync("src/logic/synthesis-integrator.ts", "utf-8");
      const fnStart = source.indexOf("individualPatterns");
      expect(fnStart).toBeGreaterThan(-1);
      const block = source.slice(fnStart, fnStart + 600);
      expect(block).toMatch(/MAX_PATTERNS|individualPatterns\.length\s*>=?\s*\d|\.slice\(0,/);
    });
  });

  // =========================================================================
  // #3 MEDIUM — relational/interpreter.ts missing `with` in blocklist
  // =========================================================================
  describe("#3 — DANGEROUS_CODE_PATTERNS should block `with`", () => {
    it("should include with keyword in blocklist", () => {
      const source = readFileSync("src/synthesis/relational/interpreter.ts", "utf-8");
      const blocklistStart = source.indexOf("DANGEROUS_CODE_PATTERNS");
      expect(blocklistStart).toBeGreaterThan(-1);
      const block = source.slice(blocklistStart, blocklistStart + 400);
      expect(block).toMatch(/\\bwith\\b/);
    });
  });

  // =========================================================================
  // #4 MEDIUM — relational/interpreter.ts missing `delete` in blocklist
  // =========================================================================
  describe("#4 — DANGEROUS_CODE_PATTERNS should block `delete`", () => {
    it("should include delete keyword in blocklist", () => {
      const source = readFileSync("src/synthesis/relational/interpreter.ts", "utf-8");
      const blocklistStart = source.indexOf("DANGEROUS_CODE_PATTERNS");
      expect(blocklistStart).toBeGreaterThan(-1);
      const block = source.slice(blocklistStart, blocklistStart + 400);
      expect(block).toMatch(/\\bdelete\\b/);
    });
  });

  // =========================================================================
  // #5 MEDIUM — relational/interpreter.ts match expr undefined → null
  // =========================================================================
  describe("#5 — exprToCode match should coalesce undefined to null", () => {
    it("should add ?? null after match group access", () => {
      const source = readFileSync("src/synthesis/relational/interpreter.ts", "utf-8");
      const matchCase = source.indexOf('case "match"', source.indexOf("function exprToCode"));
      expect(matchCase).toBeGreaterThan(-1);
      const block = source.slice(matchCase, matchCase + 500);
      expect(block).toMatch(/\?\?\s*null/);
    });
  });

  // =========================================================================
  // #6 MEDIUM — sandbox-tools.ts Object.fromEntries enables __proto__
  // =========================================================================
  describe("#6 — sandbox should not expose Object.fromEntries", () => {
    it("should remove or guard Object.fromEntries in sandbox globals", () => {
      const source = readFileSync("src/synthesis/sandbox-tools.ts", "utf-8");
      const objectBlock = source.indexOf("Object: Object.freeze(Object.create(null");
      expect(objectBlock).toBeGreaterThan(-1);
      const block = source.slice(objectBlock, objectBlock + 800);
      expect(block).not.toMatch(/fromEntries:\s*\{\s*value:\s*Object\.fromEntries/);
    });
  });

  // =========================================================================
  // #7 MEDIUM — sandbox-tools.ts Object.defineProperty exposed
  // =========================================================================
  describe("#7 — sandbox should not expose Object.defineProperty", () => {
    it("should remove or guard Object.defineProperty in sandbox globals", () => {
      const source = readFileSync("src/synthesis/sandbox-tools.ts", "utf-8");
      const objectBlock = source.indexOf("Object: Object.freeze(Object.create(null");
      expect(objectBlock).toBeGreaterThan(-1);
      const block = source.slice(objectBlock, objectBlock + 800);
      expect(block).not.toMatch(/defineProperty:\s*\{\s*value:\s*Object\.defineProperty/);
    });
  });

  // =========================================================================
  // #8 MEDIUM — relational/interpreter.ts maxResults unbounded
  // =========================================================================
  describe("#8 — synthesizeProgram should cap maxResults", () => {
    it("should bound maxResults parameter", () => {
      const source = readFileSync("src/synthesis/relational/interpreter.ts", "utf-8");
      const fnStart = source.indexOf("function synthesizeProgram") !== -1
        ? source.indexOf("function synthesizeProgram")
        : source.indexOf("export function synthesizeProgram");
      expect(fnStart).toBeGreaterThan(-1);
      const block = source.slice(fnStart, fnStart + 300);
      expect(block).toMatch(/MAX_RESULTS|Math\.min.*maxResults|maxResults.*Math\.min|boundedMax/);
    });
  });

  // =========================================================================
  // #9 MEDIUM — synthesis-integrator.ts orPattern length not checked
  // =========================================================================
  describe("#9 — orPattern should be length-checked before RegExp", () => {
    it("should validate orPattern length before creating regex", () => {
      const source = readFileSync("src/logic/synthesis-integrator.ts", "utf-8");
      const orPattern = source.indexOf("orPattern");
      expect(orPattern).toBeGreaterThan(-1);
      const block = source.slice(orPattern, orPattern + 300);
      expect(block).toMatch(/orPattern\.length\s*>|MAX_PATTERN|orPattern\.length\s*</);
    });
  });

  // =========================================================================
  // #10 LOW — coordinator.ts parseFloat ctx not length-bounded
  // =========================================================================
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
