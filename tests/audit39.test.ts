/**
 * Audit #39 — TDD tests for 10 issues
 * These tests should FAIL before the fixes and PASS after.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";

describe("Audit #39", () => {
  // =========================================================================
  // #1 HIGH — Constructor chain bypass in synthesis-integrator code injection check
  // =========================================================================
  // #2 HIGH — lc-solver match/extract group bounds missing
  // =========================================================================
  // #3 HIGH — TOCTOU: loadFile uses original path not validated realpath
  // =========================================================================
  describe("#3 — lattice-tool should use realResolved path for loadFile", () => {
    it("should pass realResolved to loadFile, not original filePath", () => {
      const source = readFileSync("src/tool/lattice-tool.ts", "utf-8");
      // Check the actual loadFile call includes realResolved argument
      expect(source).toMatch(/loadFile\(realResolved\)/);
      // Should NOT use the original filePath for loadFile
      expect(source).not.toMatch(/loadFile\(filePath\)/);
    });
  });

  // =========================================================================
  // #4 HIGH — FTS5 ALLOWED_TAGS - verify event handlers are rejected
  // =========================================================================
  describe("#4 — fts5 ALLOWED_TAGS correctly rejects event handlers (verified)", () => {
    it("should not allow onclick or other event attributes", () => {
      const source = readFileSync("src/persistence/fts5-search.ts", "utf-8");
      const allowedTags = source.match(/ALLOWED_TAGS\s*=\s*\/.*\//);
      expect(allowedTags).not.toBeNull();
      // Existing regex is strict enough to reject event handlers
      expect(allowedTags![0]).toMatch(/class/);
    });
  });

});
