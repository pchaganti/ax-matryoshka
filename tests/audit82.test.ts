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
  // #2 MEDIUM — sandbox-tools.ts console logs not truncated in execute()
  // =========================================================================
  describe("#2 — execute() console override should truncate log messages", () => {
    it("should truncate log messages before pushing", () => {
      const source = readFileSync("node_modules/repl-sandbox/dist/sandbox.js", "utf-8");
      // Find the execute method's console.log override (not the initial one)
      const executeBlock = source.indexOf("const executionLogs");
      expect(executeBlock).toBeGreaterThan(-1);
      const logOverride = source.indexOf("consoleImpl.log = ", executeBlock);
      expect(logOverride).toBeGreaterThan(-1);
      const block = source.slice(logOverride, logOverride + 200);
      expect(block).toMatch(/\.slice\(0,|MAX_LOG_ENTRY|msg\.length/);
    });
  });

  // =========================================================================
  // #3 MEDIUM — sandbox-tools.ts unbounded declaration script size
  // =========================================================================
  describe("#3 — execute() should cap declaration script size", () => {
    it("should limit declaration script length before vm.Script", () => {
      const source = readFileSync("node_modules/repl-sandbox/dist/sandbox.js", "utf-8");
      const declJoin = source.indexOf('declarations.join("\\n")');
      expect(declJoin).toBeGreaterThan(-1);
      const block = source.slice(declJoin - 200, declJoin + 100);
      expect(block).toMatch(/MAX_DECL|declCode\.length|declarations\.join.*\.length/);
    });
  });

  // =========================================================================
  // #7 MEDIUM — extractor/synthesis.ts split() unbounded before MAX_FIELDS
  // =========================================================================
  describe("#7 — tryDelimiterFieldExtraction should cap split results", () => {
    it("should limit split array size in maxFields calculation", () => {
      const source = readFileSync("src/synthesis/extractor/synthesis.ts", "utf-8");
      const fnStart = source.indexOf("function tryDelimiterFieldExtraction");
      expect(fnStart).toBeGreaterThan(-1);
      const splitBlock = source.indexOf("split(delim,", fnStart);
      expect(splitBlock).toBeGreaterThan(-1);
      const block = source.slice(splitBlock - 50, splitBlock + 100);
      expect(block).toMatch(/\.slice\(0,\s*MAX_FIELDS|split\(delim,\s*MAX_FIELDS|MAX_SPLIT/);
    });
  });

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
