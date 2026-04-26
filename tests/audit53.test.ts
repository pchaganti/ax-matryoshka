/**
 * Audit #53 — TDD tests for 10 issues
 * These tests should FAIL before the fixes and PASS after.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";

describe("Audit #53", () => {
  // #1 removed: FINAL_VAR parser deleted from base adapter (legacy marker).

  // =========================================================================
  // #3 HIGH — relational-solver.ts: split missing empty delimiter check
  // =========================================================================
  describe("#3 — relational-solver split should validate delimiter", () => {
    it("should check delimiter is not empty", () => {
      const source = readFileSync("src/logic/relational-solver.ts", "utf-8");
      const splitPrim = source.match(/split:\s*\(input,\s*args\)[\s\S]*?input\.split\(delim\)/);
      expect(splitPrim).not.toBeNull();
      expect(splitPrim![0]).toMatch(/delim\.length|!delim|delim\s*===\s*""/);
    });
  });

  // =========================================================================
  // #5 MEDIUM — lattice-tool.ts: getStats leaks documentPath
  // =========================================================================
  describe("#5 — lattice-tool getStats should not leak documentPath", () => {
    it("should not include raw documentPath in stats response", () => {
      const source = readFileSync("src/tool/lattice-tool.ts", "utf-8");
      // Find the private getStats method definition and its return block
      const statsIdx = source.indexOf("private getStats()");
      expect(statsIdx).toBeGreaterThan(-1);
      const statsBlock = source.slice(statsIdx, statsIdx + 300);
      // Should NOT include documentPath in the returned data
      expect(statsBlock).not.toMatch(/documentPath/);
    });
  });

});
