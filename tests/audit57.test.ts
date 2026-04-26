/**
 * Audit #57 — TDD tests for 10 issues
 * These tests should FAIL before the fixes and PASS after.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";

describe("Audit #57", () => {

  // =========================================================================
  // #2 MEDIUM — compile.ts replace missing typeof string guard
  // =========================================================================
  describe("#2 — compiled replace should guard typeof string", () => {
    it("should check typeof before calling .replace()", () => {
      const source = readFileSync("src/synthesis/evalo/compile.ts", "utf-8");
      const caseStart = source.indexOf('case "replace"');
      expect(caseStart).toBeGreaterThan(-1);
      const block = source.slice(caseStart, caseStart + 500);
      // The generated code template should include a typeof string guard
      expect(block).toMatch(/typeof.*!==?\s*"string"|typeof.*string/);
    });
  });

  // =========================================================================
  // #3 MEDIUM — sandbox-tools grep pattern null check
  // =========================================================================
  describe("#3 — sandbox-tools grep should check pattern is valid", () => {
    it("should guard against null/undefined pattern", () => {
      const source = readFileSync("node_modules/repl-sandbox/dist/builtins/grep.js", "utf-8");
      const grepFn = source.match(/function grep\(pattern[\s\S]*?pattern\.length/);
      expect(grepFn).not.toBeNull();
      expect(grepFn![0]).toMatch(/!pattern|typeof pattern|pattern\s*==\s*null/);
    });
  });

  // =========================================================================
  // #4 MEDIUM — session-db searchRaw leaks query in error
  // =========================================================================
  describe("#4 — session-db searchRaw should not leak query in error", () => {
    it("should not include ftsQuery in error output", () => {
      const source = readFileSync("src/persistence/session-db.ts", "utf-8");
      const searchRawStart = source.indexOf("searchRaw(");
      expect(searchRawStart).toBeGreaterThan(-1);
      const block = source.slice(searchRawStart, searchRawStart + 400);
      // Should NOT include the raw query in the error/log output
      expect(block).not.toMatch(/ftsQuery/);
    });
  });

  // =========================================================================
  // #5 MEDIUM — session-db loadDocument no line count limit
  // =========================================================================
  describe("#5 — session-db loadDocument should limit line count", () => {
    it("should enforce a max line count", () => {
      const source = readFileSync("src/persistence/session-db.ts", "utf-8");
      const loadDocStart = source.indexOf("loadDocument(");
      expect(loadDocStart).toBeGreaterThan(-1);
      const block = source.slice(loadDocStart, loadDocStart + 1500);
      expect(block).toMatch(/MAX_LINES|MAX_DOCUMENT|lines\.length\s*>/i);
    });
  });

  // =========================================================================
  // #6 MEDIUM — lc-parser number token unbounded length
  // =========================================================================
  describe("#6 — lc-parser number tokenization should limit length", () => {
    it("should limit numeric string accumulation length", () => {
      const source = readFileSync("src/logic/lc-parser.ts", "utf-8");
      // Find the number accumulation loop
      const numLoop = source.match(/while \(i < input\.length && \/\[\\d\.\]\/[\s\S]*?num \+= input\[i\]/);
      expect(numLoop).not.toBeNull();
      // Should limit the length of the numeric string being accumulated
      expect(numLoop![0]).toMatch(/num\.length|MAX_NUM/i);
    });
  });

  // =========================================================================
  // #7 MEDIUM — parser-registry grammarModule null check
  // =========================================================================
  describe("#7 — parser-registry should validate grammarModule", () => {
    it("should check grammarModule is not null after require", () => {
      const source = readFileSync("src/treesitter/parser-registry.ts", "utf-8");
      const requireBlock = source.match(/grammarModule = require[\s\S]*?moduleExport/);
      expect(requireBlock).not.toBeNull();
      expect(requireBlock![0]).toMatch(/!grammarModule|grammarModule\s*==\s*null|typeof grammarModule/);
    });
  });

  // =========================================================================
  // #8 MEDIUM — symbol-extractor getNodeName missing node null check
  // =========================================================================
  describe("#8 — getNodeName should guard against null node", () => {
    it("should check node before accessing properties", () => {
      const source = readFileSync("src/treesitter/symbol-extractor.ts", "utf-8");
      const fnStart = source.indexOf("private getNodeName");
      expect(fnStart).toBeGreaterThan(-1);
      const block = source.slice(fnStart, fnStart + 200);
      expect(block).toMatch(/!node|node\s*==\s*null|node\?\./);
    });
  });

  // =========================================================================
  // #9 MEDIUM — lc-parser constraints uses {} not Object.create(null)
  // =========================================================================
  // #10 MEDIUM — compile.ts slice missing typeof string guard
  // =========================================================================
  describe("#10 — compiled slice should guard typeof string", () => {
    it("should check typeof before calling .slice()", () => {
      const source = readFileSync("src/synthesis/evalo/compile.ts", "utf-8");
      const sliceCase = source.match(/case "slice"[\s\S]*?\.slice\(/);
      expect(sliceCase).not.toBeNull();
      expect(sliceCase![0]).toMatch(/typeof.*string|String\(/);
    });
  });
});
