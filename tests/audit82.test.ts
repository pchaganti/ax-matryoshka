/**
 * Audit #82 — 10 security issues
 *
 * 1. HIGH   session-db.ts — isFinite instead of isSafeInteger for symbol integer fields
 * 2. MEDIUM sandbox-tools.ts — console log messages not truncated in execute() override
 * 3. MEDIUM sandbox-tools.ts — unbounded declaration script size before vm.Script
 * 4. MEDIUM rag/manager.ts — $ not escaped in safeCode (formatExampleAsHint)
 * 5. MEDIUM rag/manager.ts — $ not escaped in failure.code (generateSelfCorrectionFeedback)
 * 6. MEDIUM relational/interpreter.ts — parseInt missing isSafeInteger in exprToCode
 * 7. MEDIUM extractor/synthesis.ts — split() creates unbounded arrays before MAX_FIELDS
 * 8. MEDIUM extractor/synthesis.ts — unescaped prefix/suffix in description
 * 9. LOW   compile.ts — missing explicit empty delimiter length check
 * 10. LOW  extractor/synthesis.ts — testFn returns undefined instead of null for OOB
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";

describe("Audit #82", () => {

  // =========================================================================
  // #8 MEDIUM — extractor/synthesis.ts unescaped prefix/suffix in description
  // =========================================================================
  describe("#8 — prefix/suffix should be escaped in description", () => {
    it("should escape or sanitize prefix/suffix before interpolation", () => {
      const source = readFileSync("src/synthesis/extractor/synthesis.ts", "utf-8");
      const descLine = source.indexOf('Remove prefix');
      expect(descLine).toBeGreaterThan(-1);
      const block = source.slice(descLine - 100, descLine + 100);
      expect(block).toMatch(/safePrefix|JSON\.stringify|prefix.*slice|inputPrefix.*replace/);
    });
  });

  // =========================================================================
  // #9 LOW — compile.ts missing explicit empty delimiter length check
  // =========================================================================
  describe("#9 — compile split should explicitly check empty delimiter", () => {
    it("should check delim.length === 0 explicitly", () => {
      const source = readFileSync("src/synthesis/evalo/compile.ts", "utf-8");
      const splitCase = source.indexOf('case "split"');
      expect(splitCase).toBeGreaterThan(-1);
      const block = source.slice(splitCase, splitCase + 200);
      expect(block).toMatch(/delim\.length\s*===?\s*0|delim\.length\s*[<>]/);
    });
  });

  // =========================================================================
  // #10 LOW — extractor/synthesis.ts testFn returns undefined not null
  // =========================================================================
  describe("#10 — delimiter testFn should return null for out-of-bounds", () => {
    it("should guard array access with bounds check or nullish coalescing", () => {
      const source = readFileSync("src/synthesis/extractor/synthesis.ts", "utf-8");
      const fnStart = source.indexOf("function tryDelimiterFieldExtraction");
      expect(fnStart).toBeGreaterThan(-1);
      const testFnBlock = source.indexOf("const testFn", fnStart);
      expect(testFnBlock).toBeGreaterThan(-1);
      const block = source.slice(testFnBlock, testFnBlock + 200);
      expect(block).toMatch(/\?\?\s*null|fieldIdx\].*\?\?|\.length\s*>\s*fieldIdx/);
    });
  });
});
