/**
 * Audit #67 — TDD tests for 10 issues
 * These tests should FAIL before the fixes and PASS after.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";

describe("Audit #67", () => {
  // =========================================================================
  // #1 HIGH — compile.ts compileToFunction no code length cap before new Function()
  // =========================================================================
  describe("#1 — compileToFunction should cap generated code length", () => {
    it("should check code length before new Function()", () => {
      const source = readFileSync("src/synthesis/evalo/compile.ts", "utf-8");
      const fnStart = source.indexOf("function compileToFunction(");
      expect(fnStart).toBeGreaterThan(-1);
      const block = source.slice(fnStart, fnStart + 400);
      expect(block).toMatch(/MAX_CODE_LENGTH|code\.length\s*>/i);
    });
  });

  // =========================================================================
  // #2 HIGH — session-db.ts loadDocument splits content before size check
  // =========================================================================
  describe("#2 — loadDocument should cap content size before split", () => {
    it("should check content.length before split", () => {
      const source = readFileSync("src/persistence/session-db.ts", "utf-8");
      const fnStart = source.indexOf("loadDocument(content");
      expect(fnStart).toBeGreaterThan(-1);
      const block = source.slice(fnStart, fnStart + 300);
      expect(block).toMatch(/MAX_CONTENT|content\.length\s*>/i);
    });
  });

  // =========================================================================
  // #3 HIGH — grammar-config.ts loadConfig no file size check before readFileSync
  // =========================================================================
  describe("#3 — loadConfig should check file size before reading", () => {
    it("should check file size or content length before JSON.parse", () => {
      const source = readFileSync("src/config/grammar-config.ts", "utf-8");
      const fnStart = source.indexOf("function loadConfig(");
      expect(fnStart).toBeGreaterThan(-1);
      const block = source.slice(fnStart, fnStart + 500);
      expect(block).toMatch(/MAX_CONFIG|content\.length\s*>|statSync|stats\.size/i);
    });
  });

  // =========================================================================
  // #4 MEDIUM — coordinator.ts getStructure unbounded regex on large strings
  // =========================================================================
  describe("#4 — getStructure should cap input string length", () => {
    it("should limit string before regex replacements", () => {
      const source = readFileSync("src/synthesis/coordinator.ts", "utf-8");
      const fnStart = source.indexOf("getStructure(str");
      expect(fnStart).toBeGreaterThan(-1);
      const block = source.slice(fnStart, fnStart + 300);
      expect(block).toMatch(/MAX_STRUCTURE|str\.length|str\.slice|\.slice\(0/i);
    });
  });

  // =========================================================================
  // #5 MEDIUM — rlm.ts sort comparator uses parseInt subtraction (overflow)
  // =========================================================================
  describe("#5 — turnKeys sort should use safe comparator", () => {
    it("should use safe comparison instead of subtraction for sort", () => {
      const source = readFileSync("src/fsm/rlm-states.ts", "utf-8");
      const sortStart = source.indexOf("turnKeys");
      expect(sortStart).toBeGreaterThan(-1);
      const block = source.slice(sortStart, sortStart + 300);
      // Should use comparison operators (< > <=), localeCompare, or isFinite guard before subtraction
      expect(block).toMatch(/aNum\s*<\s*bNum|aNum\s*>\s*bNum|return\s*-1|return\s*1|localeCompare|isFinite/);
    });
  });

  // #6 removed: rlm.ts extractFinalAnswer helper deleted. Adapter-level result
  // formatting is tested in adapter-specific suites.

  // =========================================================================
  // #7 MEDIUM — knowledge-base.ts computeSimilarity unbounded char Set
  // =========================================================================
  describe("#7 — computeSimilarity should cap string before char splitting", () => {
    it("should limit join length before split", () => {
      const source = readFileSync("src/synthesis/knowledge-base.ts", "utf-8");
      const fnStart = source.indexOf("private computeSimilarity(");
      expect(fnStart).toBeGreaterThan(-1);
      const block = source.slice(fnStart, fnStart + 500);
      expect(block).toMatch(/MAX_CHAR|\.slice\(0|\.substring\(0/i);
    });
  });

  // =========================================================================
  // #8 MEDIUM — session-db.ts createHandle uses slug-based naming
  // =========================================================================
  describe("#8 — createHandle should use slug-based collision tracking", () => {
    it("should use slugCounts map for handle name generation", () => {
      const source = readFileSync("src/persistence/session-db.ts", "utf-8");
      const fnStart = source.indexOf("createHandle(");
      expect(fnStart).toBeGreaterThan(-1);
      const block = source.slice(fnStart, fnStart + 400);
      expect(block).toMatch(/slugCounts|commandToSlug/i);
    });
  });

  // =========================================================================
  // #9 MEDIUM — manager.ts formatHintsForPrompt no output length cap
  // =========================================================================
  describe("#9 — formatHintsForPrompt should cap total output length", () => {
    it("should limit final output size", () => {
      const source = readFileSync("src/rag/manager.ts", "utf-8");
      const fnStart = source.indexOf("formatHintsForPrompt(");
      expect(fnStart).toBeGreaterThan(-1);
      const block = source.slice(fnStart, fnStart + 1100);
      expect(block).toMatch(/MAX_PROMPT|MAX_OUTPUT|\.slice\(0|\.substring\(0/i);
    });
  });

  // =========================================================================
  // #10 MEDIUM — similarity.ts buildSearchIndex no field validation
  // =========================================================================
  describe("#10 — buildSearchIndex should validate doc fields", () => {
    it("should check doc.text is string and doc.keywords is array", () => {
      const source = readFileSync("src/rag/similarity.ts", "utf-8");
      const fnStart = source.indexOf("function buildSearchIndex(");
      expect(fnStart).toBeGreaterThan(-1);
      const block = source.slice(fnStart, fnStart + 400);
      expect(block).toMatch(/typeof.*text|Array\.isArray.*keywords|typeof.*id/i);
    });
  });
});
