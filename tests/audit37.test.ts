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
  describe("#1 — lattice-tool should use realpath to prevent symlink bypass", () => {
    it("should use realpathSync or realpath in loadAsync", () => {
      const source = readFileSync("src/tool/lattice-tool.ts", "utf-8");
      const loadAsync = source.match(/async loadAsync[\s\S]*?loadFile/);
      expect(loadAsync).not.toBeNull();
      // Should use realpath to dereference symlinks before checking path
      expect(loadAsync![0]).toMatch(/realpath/i);
    });
  });

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
  describe("#3 — history pruning should validate both roles in pair", () => {
    it("should check history[3] role before splice(2,2)", () => {
      const source = readFileSync("src/rlm.ts", "utf-8");
      const pruneHistory = source.match(/const pruneHistory[\s\S]*?};/);
      expect(pruneHistory).not.toBeNull();
      const body = pruneHistory![0];
      // Should check both history[2] and history[3] roles before splicing a pair
      expect(body).toMatch(/history\[3\]/);
    });
  });

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
  describe("#5 — http adapter should reject negative content-length", () => {
    it("should check content-length > 0 or use Math.max", () => {
      const source = readFileSync("src/tool/adapters/http.ts", "utf-8");
      const readBody = source.match(/readBody[\s\S]*?return new Promise/);
      expect(readBody).not.toBeNull();
      // Should reject negative content-length values
      expect(readBody![0]).toMatch(/contentLength\s*<\s*0|contentLength\s*>\s*0|Math\.max\(0/);
    });
  });

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
  describe("#9 — relational-solver match should validate group bounds", () => {
    it("should check group < result.length", () => {
      const source = readFileSync("src/logic/relational-solver.ts", "utf-8");
      const matchPrim = source.match(/match:\s*\(input, args\)[\s\S]*?return result\[group\]/);
      expect(matchPrim).not.toBeNull();
      // Should validate group index against result length
      expect(matchPrim![0]).toMatch(/group\s*>=?\s*result\.length|group.*bounds|group.*length/i);
    });
  });

  // =========================================================================
  // #10 LOW — parseCurrency trailing minus not handled
  // =========================================================================
  describe("#10 — parseCurrency should handle trailing minus", () => {
    it("should detect trailing minus format like 1,234-", () => {
      const source = readFileSync("src/logic/lc-interpreter.ts", "utf-8");
      const parseCurrency = source.match(/case "parseCurrency"[\s\S]*?return isNegative/);
      expect(parseCurrency).not.toBeNull();
      // The isNegative check should handle trailing minus (already does via endsWith("-"))
      // But the clean step should also handle it properly
      expect(parseCurrency![0]).toMatch(/endsWith.*"-"/);
    });
  });
});
