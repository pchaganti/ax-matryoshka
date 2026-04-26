/**
 * Audit #74 — TDD tests for 10 issues
 * These tests should FAIL before the fixes and PASS after.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";

describe("Audit #74", () => {

  // =========================================================================
  // #2 HIGH — evalo split has no delimiter max length check
  // =========================================================================
  describe("#2 — evalo split should validate delimiter length", () => {
    it("should reject overly long delimiters", () => {
      const source = readFileSync("src/synthesis/evalo/evalo.ts", "utf-8");
      const splitCase = source.indexOf('case "split"');
      expect(splitCase).toBeGreaterThan(-1);
      const block = source.slice(splitCase, splitCase + 300);
      // Should check delimiter max length, not just empty
      expect(block).toMatch(/delim\.length\s*>\s*\d{2,}|MAX_DELIM/);
    });
  });

  // =========================================================================
  // #5 MEDIUM — rlm pruneHistory can fail to reduce if no valid pair
  // =========================================================================
  describe("#5 — rlm pruneHistory should always terminate", () => {
    it("should have break or forced removal in else branch", () => {
      const source = readFileSync("src/fsm/rlm-states.ts", "utf-8");
      const pruneStart = source.indexOf("function pruneHistory");
      expect(pruneStart).toBeGreaterThan(-1);
      const block = source.slice(pruneStart, pruneStart + 900);
      // The else branch must have a break to prevent infinite loop
      expect(block).toMatch(/else\s*\{[\s\S]*?break/);

    });
  });

  // =========================================================================
  // #8 MEDIUM — session-db JSON.parse on handle data without size check
  // =========================================================================
  describe("#8 — session-db getHandleData should validate data size", () => {
    it("should check data string length before JSON.parse", () => {
      const source = readFileSync("src/persistence/session-db.ts", "utf-8");
      const fnStart = source.indexOf("getHandleData(handle: string)");
      expect(fnStart).toBeGreaterThan(-1);
      const block = source.slice(fnStart, fnStart + 400);
      expect(block).toMatch(/MAX_JSON|r\.data\.length|data\.length\s*>/);
    });
  });

  // =========================================================================
  // #10 MEDIUM — manager recordFailure doesn't validate query length
  // =========================================================================
  describe("#10 — manager recordFailure should validate query length", () => {
    it("should cap record.query length", () => {
      const source = readFileSync("src/rag/manager.ts", "utf-8");
      const fnStart = source.indexOf("recordFailure(");
      expect(fnStart).toBeGreaterThan(-1);
      const block = source.slice(fnStart, fnStart + 500);
      expect(block).toMatch(/record\.query\.length|MAX_QUERY|query\.slice/);
    });
  });
});
