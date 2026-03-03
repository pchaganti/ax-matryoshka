/**
 * Audit #85 — 10 security issues
 *
 * 1. HIGH   session-db.ts — getSymbolsByKind missing LIMIT
 * 2. HIGH   session-db.ts — getSymbolsAtLine missing LIMIT
 * 3. HIGH   session-db.ts — getHandleData missing LIMIT
 * 4. MEDIUM session-db.ts — searchRaw FTS5 missing LIMIT
 * 5. MEDIUM predicate-compiler.ts — missing backslash escaping in LIKE
 * 6. MEDIUM relational/interpreter.ts — sub missing overflow guard
 * 7. MEDIUM relational/interpreter.ts — mul missing overflow guard
 * 8. MEDIUM coordinator.ts — request.description not truncated
 * 9. MEDIUM session-db.ts — listHandles missing LIMIT
 * 10. MEDIUM relational/interpreter.ts — div not checking zero divisor
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";

describe("Audit #85", () => {
  // =========================================================================
  // #1 HIGH — session-db.ts getSymbolsByKind missing LIMIT
  // =========================================================================
  describe("#1 — getSymbolsByKind should have LIMIT", () => {
    it("should include LIMIT in query", () => {
      const source = readFileSync("src/persistence/session-db.ts", "utf-8");
      const fnStart = source.indexOf("getSymbolsByKind");
      expect(fnStart).toBeGreaterThan(-1);
      const block = source.slice(fnStart, fnStart + 300);
      expect(block).toMatch(/LIMIT\s+\?|MAX_SYMBOLS/i);
    });
  });

  // =========================================================================
  // #2 HIGH — session-db.ts getSymbolsAtLine missing LIMIT
  // =========================================================================
  describe("#2 — getSymbolsAtLine should have LIMIT", () => {
    it("should include LIMIT in query", () => {
      const source = readFileSync("src/persistence/session-db.ts", "utf-8");
      const fnStart = source.indexOf("getSymbolsAtLine");
      expect(fnStart).toBeGreaterThan(-1);
      const block = source.slice(fnStart, fnStart + 400);
      expect(block).toMatch(/LIMIT\s+\?|MAX_SYMBOLS/i);
    });
  });

  // =========================================================================
  // #3 HIGH — session-db.ts getHandleData missing LIMIT
  // =========================================================================
  describe("#3 — getHandleData should have LIMIT", () => {
    it("should include LIMIT in query", () => {
      const source = readFileSync("src/persistence/session-db.ts", "utf-8");
      // Find the standalone getHandleData (not getHandleDataSlice)
      const sliceEnd = source.indexOf("getHandleDataSlice");
      const fnStart = source.indexOf("getHandleData(handle:", sliceEnd + 20);
      expect(fnStart).toBeGreaterThan(-1);
      const block = source.slice(fnStart, fnStart + 400);
      expect(block).toMatch(/LIMIT\s+\?|MAX_HANDLE_ITEMS|MAX_ITEMS/i);
    });
  });

  // =========================================================================
  // #4 MEDIUM — session-db.ts searchRaw FTS5 missing LIMIT
  // =========================================================================
  describe("#4 — searchRaw should have LIMIT", () => {
    it("should include LIMIT in FTS5 query", () => {
      const source = readFileSync("src/persistence/session-db.ts", "utf-8");
      const fnStart = source.indexOf("searchRaw");
      expect(fnStart).toBeGreaterThan(-1);
      const block = source.slice(fnStart, fnStart + 400);
      expect(block).toMatch(/LIMIT\s+\?|MAX_FTS|MAX_SEARCH/i);
    });
  });

  // =========================================================================
  // #5 MEDIUM — predicate-compiler.ts missing backslash escaping in LIKE
  // =========================================================================
  describe("#5 — LIKE escaping should handle backslashes", () => {
    it("should escape backslashes before % and _", () => {
      const source = readFileSync("src/persistence/predicate-compiler.ts", "utf-8");
      const escapedValue = source.indexOf("escapedValue");
      expect(escapedValue).toBeGreaterThan(-1);
      const block = source.slice(escapedValue, escapedValue + 200);
      expect(block).toMatch(/replace\(.*\\\\.*\\\\|escapeBackslash/);
    });
  });

  // =========================================================================
  // #6 MEDIUM — relational/interpreter.ts sub missing overflow guard
  // =========================================================================
  describe("#6 — exprToCode sub should have overflow guard", () => {
    it("should include isFinite check in sub", () => {
      const source = readFileSync("src/synthesis/relational/interpreter.ts", "utf-8");
      const subCase = source.indexOf('case "sub"');
      expect(subCase).toBeGreaterThan(-1);
      const block = source.slice(subCase, subCase + 200);
      expect(block).toMatch(/isFinite|Number\.isFinite/);
    });
  });

  // =========================================================================
  // #7 MEDIUM — relational/interpreter.ts mul missing overflow guard
  // =========================================================================
  describe("#7 — exprToCode mul should have overflow guard", () => {
    it("should include isFinite check in mul", () => {
      const source = readFileSync("src/synthesis/relational/interpreter.ts", "utf-8");
      const mulCase = source.indexOf('case "mul"');
      expect(mulCase).toBeGreaterThan(-1);
      const block = source.slice(mulCase, mulCase + 200);
      expect(block).toMatch(/isFinite|Number\.isFinite/);
    });
  });

  // =========================================================================
  // #8 MEDIUM — coordinator.ts request.description not truncated
  // =========================================================================
  describe("#8 — knowledge base should truncate description", () => {
    it("should truncate or validate description before storing", () => {
      const source = readFileSync("src/synthesis/coordinator.ts", "utf-8");
      const kbAdd = source.indexOf("knowledgeBase.add");
      expect(kbAdd).toBeGreaterThan(-1);
      const block = source.slice(kbAdd, kbAdd + 400);
      expect(block).toMatch(/description.*\.slice\(0,|safeDesc|truncat|MAX_DESC/);
    });
  });

  // =========================================================================
  // #9 MEDIUM — session-db.ts listHandles missing LIMIT
  // =========================================================================
  describe("#9 — listHandles should have LIMIT", () => {
    it("should include LIMIT in query", () => {
      const source = readFileSync("src/persistence/session-db.ts", "utf-8");
      const fnStart = source.indexOf("listHandles");
      expect(fnStart).toBeGreaterThan(-1);
      const block = source.slice(fnStart, fnStart + 200);
      expect(block).toMatch(/LIMIT\s+\?|MAX_HANDLES/i);
    });
  });

  // =========================================================================
  // #10 MEDIUM — relational/interpreter.ts div not checking zero divisor
  // =========================================================================
  describe("#10 — exprToCode div should check for zero divisor", () => {
    it("should guard against division by zero", () => {
      const source = readFileSync("src/synthesis/relational/interpreter.ts", "utf-8");
      const divCase = source.indexOf('case "div"');
      expect(divCase).toBeGreaterThan(-1);
      const block = source.slice(divCase, divCase + 300);
      expect(block).toMatch(/===?\s*0|_r\s*===?\s*0|divisor|zero/);
    });
  });
});
