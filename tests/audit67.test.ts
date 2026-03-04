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
      const source = readFileSync("src/rlm.ts", "utf-8");
      const sortStart = source.indexOf("turnKeys");
      expect(sortStart).toBeGreaterThan(-1);
      const block = source.slice(sortStart, sortStart + 300);
      // Should use comparison operators (< > <=) or localeCompare, not raw subtraction
      expect(block).toMatch(/aNum\s*<\s*bNum|aNum\s*>\s*bNum|return\s*-1|return\s*1|localeCompare/);
    });
  });

  // =========================================================================
  // #6 MEDIUM — rlm.ts toLocaleString on NaN/Infinity value
  // =========================================================================
  describe("#6 — result formatting should guard toLocaleString", () => {
    it("should check isFinite before toLocaleString", () => {
      const source = readFileSync("src/rlm.ts", "utf-8");
      // Find the toLocaleString usage with value (not the contextLength one)
      const valueLocale = source.indexOf("value.toLocaleString");
      if (valueLocale === -1) {
        // If refactored to not use toLocaleString on value, that's also fine
        // Just check there's an isFinite guard near value formatting
        const valueStart = source.indexOf("parsed[foundKey]");
        expect(valueStart).toBeGreaterThan(-1);
        const block = source.slice(valueStart, valueStart + 300);
        expect(block).toMatch(/isFinite|isSafeInteger/);
      } else {
        const block = source.slice(valueLocale - 100, valueLocale + 50);
        expect(block).toMatch(/isFinite|isSafeInteger/);
      }
    });
  });

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
  // #8 MEDIUM — session-db.ts handleCounter no MAX_SAFE_INTEGER check
  // =========================================================================
  describe("#8 — createHandle should guard against handleCounter overflow", () => {
    it("should check handleCounter against MAX_SAFE_INTEGER", () => {
      const source = readFileSync("src/persistence/session-db.ts", "utf-8");
      const fnStart = source.indexOf("createHandle(");
      expect(fnStart).toBeGreaterThan(-1);
      const block = source.slice(fnStart, fnStart + 400);
      expect(block).toMatch(/MAX_SAFE_INTEGER|handleCounter\s*>=?\s*Number/i);
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
