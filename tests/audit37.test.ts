/**
 * Audit #37 — TDD tests for 10 issues
 * These tests should FAIL before the fixes and PASS after.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";

describe("Audit #37", () => {
  // =========================================================================
  // #1 HIGH — Symlink bypass in lattice-tool path validation
  // =========================================================================
  // #2 HIGH — parseCurrency breaks EU-format numbers
  // =========================================================================
  describe("#2 — parseCurrency should detect EU format", () => {
    it("should detect EU comma-as-decimal format", () => {
      const source = readFileSync("src/logic/lc-interpreter.ts", "utf-8");
      const parseCurrency = source.match(/case "parseCurrency"[\s\S]*?return isNegative/);
      expect(parseCurrency).not.toBeNull();
      // Should have EU format detection logic
      expect(parseCurrency![0]).toMatch(/EU|euro|comma.*decimal|decimal.*comma|lastComma|commaPos/i);
    });
  });

  // =========================================================================
  // #3 HIGH — History pruning doesn't validate pair completeness
  // =========================================================================
  // #4 MEDIUM — DELETE outside transaction in session-db
  // =========================================================================
  describe("#4 — session-db loadDocument should wrap DELETE in transaction", () => {
    it("DELETE and INSERT should be in the same transaction", () => {
      const source = readFileSync("src/persistence/session-db.ts", "utf-8");
      const loadDoc = source.match(/loadDocument[\s\S]*?return lines\.length/);
      expect(loadDoc).not.toBeNull();
      const body = loadDoc![0];
      // DELETE should be INSIDE the transaction, not before it
      // The transaction callback should contain the DELETE
      expect(body).toMatch(/transaction\([\s\S]*?DELETE/);
    });
  });

  // =========================================================================
  // #5 MEDIUM — Negative Content-Length bypasses pre-check
  // =========================================================================
  // #6 MEDIUM — split with empty string delimiter
  // =========================================================================
  describe("#6 — split should validate non-empty delimiter", () => {
    it("should check for empty delimiter in split case", () => {
      const source = readFileSync("src/logic/lc-interpreter.ts", "utf-8");
      const splitCase = source.match(/case "split"[\s\S]*?parts\[term\.index\]/);
      expect(splitCase).not.toBeNull();
      // Should validate delimiter is not empty
      expect(splitCase![0]).toMatch(/delim.*===\s*""|delim\.length|!term\.delim|delim.*empty/i);
    });
  });

  // =========================================================================
  // #7 MEDIUM — Math.max(...[]) returns -Infinity in synthesis
  // =========================================================================
  describe("#7 — delimiter extraction should guard against empty examples", () => {
    it("should handle empty array in Math.max spread", () => {
      const source = readFileSync("src/synthesis/extractor/synthesis.ts", "utf-8");
      // Find the specific Math.max line in the delimiter extraction function
      const maxLine = source.match(/const maxFields = [^;]+/);
      expect(maxLine).not.toBeNull();
      // Should guard against empty spread: Math.max(0, ...) or use reduce with 0 default
      expect(maxLine![0]).toMatch(/Math\.max\(0|\.reduce\(/);
    });
  });

  // =========================================================================
  // #8 MEDIUM — Match group index unbounded in interpreter
  // =========================================================================
  describe("#8 — interpreter match should validate group bounds", () => {
    it("should check group < result.length", () => {
      const source = readFileSync("src/logic/lc-interpreter.ts", "utf-8");
      const matchCase = source.match(/case "match"[\s\S]*?result\[term\.group\]/);
      expect(matchCase).not.toBeNull();
      // Should validate group index against result length
      expect(matchCase![0]).toMatch(/term\.group\s*>=?\s*result\.length|group.*bounds|group.*length/i);
    });
  });

  // =========================================================================
  // #9 MEDIUM — Same group index issue in relational-solver match
  // =========================================================================
  // #10 LOW — parseCurrency trailing minus not handled
});
