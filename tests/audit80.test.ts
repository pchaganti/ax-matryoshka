/**
 * Audit #80 — 10 security issues
 *
 * 1. HIGH   rlm.ts — maxTurns/turnTimeoutMs/maxSubCalls not validated
 * 2. MEDIUM rag/manager.ts — example.code backtick breakout in formatExampleAsHint
 * 3. MEDIUM rag/manager.ts — failure.error not truncated in self-correction
 * 4. MEDIUM synthesis-integrator.ts — JSON.stringify without try-catch
 * 5. MEDIUM coordinator.ts — string concat can bypass blocklist
 * 6. MEDIUM compile.ts — no extractor tag validation before compile
 * 7. MEDIUM relational-solver.ts — parseInt without explicit radix 10
 * 8. MEDIUM nucleus-engine.ts — empty query matches all lines in fuzzyMatch
 * 9. MEDIUM rag/manager.ts — example.rationale not truncated
 * 10. MEDIUM rag/manager.ts — formatHintsForPrompt no per-hint size cap
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";

describe("Audit #80", () => {
  // =========================================================================
  // #1 HIGH — rlm.ts maxTurns/turnTimeoutMs/maxSubCalls not validated
  // =========================================================================
  describe("#1 — rlm should validate numeric config parameters", () => {
    it("should validate maxTurns with isFinite or bounds check", () => {
      const source = readFileSync("src/rlm.ts", "utf-8");
      const destructure = source.indexOf("maxTurns =");
      expect(destructure).toBeGreaterThan(-1);
      const block = source.slice(destructure, destructure + 600);
      expect(block).toMatch(/isFinite.*maxTurns|maxTurns.*isFinite|maxTurns\s*[<>]=?\s*\d|maxTurns\s*=\s*Math\.(min|max)/);
    });
  });

  // =========================================================================
  // #2 MEDIUM — rag/manager.ts example.code backtick breakout
  // =========================================================================
  describe("#2 — formatExampleAsHint should escape code backticks", () => {
    it("should escape backticks in example.code", () => {
      const source = readFileSync("src/rag/manager.ts", "utf-8");
      const fnStart = source.indexOf("private formatExampleAsHint");
      expect(fnStart).toBeGreaterThan(-1);
      const block = source.slice(fnStart, fnStart + 400);
      expect(block).toMatch(/\.replace\(.*`|escape.*code|safeCode/);
    });
  });

  // =========================================================================
  // #3 MEDIUM — rag/manager.ts failure.error not truncated
  // =========================================================================
  describe("#3 — self-correction should truncate failure.error", () => {
    it("should truncate or escape failure.error", () => {
      const source = readFileSync("src/rag/manager.ts", "utf-8");
      const fnStart = source.indexOf("generateSelfCorrectionFeedback");
      expect(fnStart).toBeGreaterThan(-1);
      const errorLine = source.indexOf("failure.error", fnStart);
      expect(errorLine).toBeGreaterThan(-1);
      const block = source.slice(errorLine - 100, errorLine + 100);
      expect(block).toMatch(/\.slice\(0,|safeError|error\.replace|truncat/);
    });
  });

  // =========================================================================
  // #4 MEDIUM — synthesis-integrator.ts JSON.stringify without try-catch
  // =========================================================================
  describe("#4 — synthesizeOnFailure should wrap JSON.stringify in try-catch", () => {
    it("should have error handling around JSON.stringify(ex.output)", () => {
      const source = readFileSync("src/logic/synthesis-integrator.ts", "utf-8");
      const stringify = source.indexOf("JSON.stringify(ex.output)");
      expect(stringify).toBeGreaterThan(-1);
      const block = source.slice(Math.max(0, stringify - 200), stringify + 50);
      expect(block).toMatch(/try\s*\{|safeStringify/);
    });
  });

  // =========================================================================
  // #5 MEDIUM — coordinator.ts string concat can bypass blocklist
  // =========================================================================
  describe("#5 — safeEvalSynthesized should block string concatenation", () => {
    it("should reject string concatenation patterns", () => {
      const source = readFileSync("src/synthesis/coordinator.ts", "utf-8");
      const fnStart = source.indexOf("function safeEvalSynthesized");
      expect(fnStart).toBeGreaterThan(-1);
      const block = source.slice(fnStart, fnStart + 1800);
      expect(block).toMatch(/["']\s*\+\s*["']|string\s*concat|concat.*pattern/);
    });
  });

  // =========================================================================
  // #6 MEDIUM — compile.ts no extractor tag validation before compile
  // =========================================================================
  describe("#6 — compileToFunction should validate extractor tags", () => {
    it("should validate extractor tag is known before compilation", () => {
      const source = readFileSync("src/synthesis/evalo/compile.ts", "utf-8");
      const fnStart = source.indexOf("export function compileToFunction");
      expect(fnStart).toBeGreaterThan(-1);
      const block = source.slice(fnStart, fnStart + 500);
      expect(block).toMatch(/validTags|validateExtractor|tag.*includes|VALID_TAGS/);
    });
  });

  // =========================================================================
  // #7 MEDIUM — relational-solver.ts parseInt without explicit radix
  // =========================================================================
  describe("#7 — relational-solver parseInt should use radix 10", () => {
    it("should pass radix 10 to parseInt(shortYear)", () => {
      const source = readFileSync("src/logic/relational-solver.ts", "utf-8");
      const parseIntCall = source.indexOf("parseInt(shortYear)");
      if (parseIntCall === -1) {
        // Already fixed — uses parseInt(shortYear, 10)
        const fixedCall = source.indexOf("parseInt(shortYear, 10)");
        expect(fixedCall).toBeGreaterThan(-1);
      } else {
        // Still unfixed
        expect(parseIntCall).toBe(-1); // Force failure
      }
    });
  });

  // =========================================================================
  // #8 MEDIUM — nucleus-engine.ts empty query in fuzzyMatch
  // =========================================================================
  describe("#8 — fuzzyMatch should reject empty queries", () => {
    it("should guard against empty query string", () => {
      const source = readFileSync("src/engine/nucleus-engine.ts", "utf-8");
      const fnStart = source.indexOf("function fuzzyMatch");
      expect(fnStart).toBeGreaterThan(-1);
      const block = source.slice(fnStart, fnStart + 300);
      expect(block).toMatch(/query\.length\s*[<>=]+\s*0|!query|queryLower\.length\s*[<>=]+\s*0|!queryLower/);
    });
  });

  // =========================================================================
  // #9 MEDIUM — rag/manager.ts example.rationale not truncated
  // =========================================================================
  describe("#9 — formatExampleAsHint should truncate rationale", () => {
    it("should truncate or cap example.rationale", () => {
      const source = readFileSync("src/rag/manager.ts", "utf-8");
      const fnStart = source.indexOf("private formatExampleAsHint");
      expect(fnStart).toBeGreaterThan(-1);
      const block = source.slice(fnStart, fnStart + 400);
      expect(block).toMatch(/rationale.*\.slice\(0,|safeRationale|rationale.*truncat/);
    });
  });

  // =========================================================================
  // #10 MEDIUM — rag/manager.ts formatHintsForPrompt no per-hint size cap
  // =========================================================================
  describe("#10 — formatHintsForPrompt should cap individual hint size", () => {
    it("should truncate individual hints before joining", () => {
      const source = readFileSync("src/rag/manager.ts", "utf-8");
      const fnStart = source.indexOf("formatHintsForPrompt");
      expect(fnStart).toBeGreaterThan(-1);
      const block = source.slice(fnStart, fnStart + 600);
      expect(block).toMatch(/MAX_HINT|hint.*\.slice|content.*\.slice|MAX_INDIVIDUAL/);
    });
  });
});
