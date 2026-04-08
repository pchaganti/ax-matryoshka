/**
 * Audit #89 — 10 security issues
 *
 * 1. MEDIUM lattice-tool.ts — bindings message Object.keys().join() unbounded
 * 2. MEDIUM lattice-tool.ts — JSON.stringify(value) result unbounded in formatResult
 * 3. MEDIUM lattice-tool.ts — parseCommand split(/\s+/) unbounded
 * 4. MEDIUM session-db.ts — getCheckpoint Object.entries() unbounded key count
 * 5. MEDIUM nucleus-engine.ts — capture group counting mishandles \\(
 * 6. MEDIUM nucleus.ts — escapeForSexp doesn't escape parentheses
 * 7. MEDIUM extractor/synthesis.ts — split(delim) without limit in field extraction loop
 * 8. MEDIUM sandbox-tools.ts — grep beforeMatch uses full context instead of searchContext
 * 9. MEDIUM nucleus-engine.ts — function name regex allows hyphens (invalid JS identifiers)
 * 10. MEDIUM config.ts — resolveEnvVars no recursion depth limit
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";

describe("Audit #89", () => {
  // =========================================================================
  // #1 MEDIUM — lattice-tool.ts bindings message unbounded join
  // =========================================================================
  describe("#1 — getBindings should cap message length", () => {
    it("should cap or truncate bindings message", () => {
      const source = readFileSync("src/tool/lattice-tool.ts", "utf-8");
      const fnStart = source.indexOf("private getBindings");
      expect(fnStart).toBeGreaterThan(-1);
      const block = source.slice(fnStart, fnStart + 400);
      expect(block).toMatch(/\.slice\(0,|MAX_BINDINGS_MSG|MAX_MSG/i);
    });
  });

  // =========================================================================
  // #2 MEDIUM — lattice-tool.ts JSON.stringify result unbounded
  // =========================================================================
  describe("#2 — formatResult should cap JSON.stringify output", () => {
    it("should limit JSON.stringify result length", () => {
      const source = readFileSync("src/tool/lattice-tool.ts", "utf-8");
      const fnStart = source.indexOf("private formatResult");
      expect(fnStart).toBeGreaterThan(-1);
      const block = source.slice(fnStart, fnStart + 600);
      // Should cap JSON.stringify output with slice or length check
      expect(block).toMatch(/JSON\.stringify.*\.slice\(0,|MAX_JSON|stringify.*length/i);
    });
  });

  // =========================================================================
  // #3 MEDIUM — lattice-tool.ts parseCommand split unbounded
  // =========================================================================
  describe("#3 — parseCommand should cap split result", () => {
    it("should limit input length or split result in parseCommand", () => {
      const source = readFileSync("src/tool/lattice-tool.ts", "utf-8");
      const fnStart = source.indexOf("function parseCommand");
      expect(fnStart).toBeGreaterThan(-1);
      const block = source.slice(fnStart, fnStart + 400);
      expect(block).toMatch(/MAX_COMMAND|input\.length\s*>|trimmed\.length\s*>|\.slice\(0,/i);
    });
  });

  // =========================================================================
  // #4 MEDIUM — session-db.ts getCheckpoint unbounded Map entries
  // =========================================================================
  describe("#4 — getCheckpoint should cap Map entry count", () => {
    it("should limit Object.entries before creating Map", () => {
      const source = readFileSync("src/persistence/session-db.ts", "utf-8");
      const fnStart = source.indexOf("getCheckpoint(turn");
      expect(fnStart).toBeGreaterThan(-1);
      const block = source.slice(fnStart, fnStart + 600);
      expect(block).toMatch(/MAX_CHECKPOINT_KEYS|Object\.keys.*length|entries.*slice|MAX_ENTRIES/i);
    });
  });

  // =========================================================================
  // #5 MEDIUM — nucleus-engine.ts capture group counting mishandles \\(
  // =========================================================================
  describe("#5 — grep should correctly count unescaped parens", () => {
    it("should handle escaped backslash before paren", () => {
      const source = readFileSync("src/engine/nucleus-engine.ts", "utf-8");
      const parenCheck = source.indexOf("unescapedParens");
      expect(parenCheck).toBeGreaterThan(-1);
      const block = source.slice(parenCheck - 100, parenCheck + 200);
      // Should handle \\( (escaped backslash followed by real paren)
      expect(block).toMatch(/\\\\\\\\|lookbehind|(?:replace.*){2,}|captureGroupCount/i);
    });
  });

  // =========================================================================
  // #6 MEDIUM — nucleus.ts escapeForSexp doesn't escape parens
  // =========================================================================
  describe("#6 — escapeForSexp should escape parentheses", () => {
    it("should escape ( and ) characters", () => {
      const source = readFileSync("src/adapters/nucleus.ts", "utf-8");
      const fnStart = source.indexOf("function escapeForSexp");
      expect(fnStart).toBeGreaterThan(-1);
      const block = source.slice(fnStart, fnStart + 400);
      expect(block).toMatch(/\\(|\\)|replace.*\(.*\)/);
      // More specific: should have at least 6 replace calls (original 5 + parens)
      const replaceCount = (block.match(/\.replace\(/g) || []).length;
      expect(replaceCount).toBeGreaterThanOrEqual(6);
    });
  });

  // =========================================================================
  // #7 MEDIUM — extractor/synthesis.ts split(delim) without limit in loop
  // =========================================================================
  describe("#7 — delimiter field extraction should limit split", () => {
    it("should pass a limit to split() or cap input length", () => {
      const source = readFileSync("src/synthesis/extractor/synthesis.ts", "utf-8");
      const fieldLoop = source.indexOf("e.input.split(delim,");
      expect(fieldLoop).toBeGreaterThan(-1);
      const block = source.slice(fieldLoop - 100, fieldLoop + 200);
      // Should either pass limit to split or cap input length before split
      expect(block).toMatch(/split\(delim,\s*\d|split\(delim,\s*MAX|input\.length\s*>|input\.slice\(0,|MAX_INPUT/i);
    });
  });

  // =========================================================================
  // #8 MEDIUM — sandbox-tools.ts grep beforeMatch uses context not searchContext
  // =========================================================================
  describe("#8 — grep beforeMatch should use searchContext", () => {
    it("should use searchContext for line number calculation", () => {
      const source = readFileSync("node_modules/repl-sandbox/dist/builtins/grep.js", "utf-8");
      const beforeMatch = source.indexOf("beforeMatch");
      expect(beforeMatch).toBeGreaterThan(-1);
      const block = source.slice(beforeMatch, beforeMatch + 100);
      // Should use searchContext, not the full context
      expect(block).toMatch(/searchContext\.slice/);
    });
  });

  // =========================================================================
  // #9 MEDIUM — nucleus-engine.ts function name should block special chars
  // =========================================================================
  describe("#9 — function name should validate with regex", () => {
    it("should validate function name with safe regex", () => {
      const source = readFileSync("src/engine/nucleus-engine.ts", "utf-8");
      const fnNameCheck = source.indexOf("_fn_${fnObj.name}");
      expect(fnNameCheck).toBeGreaterThan(-1);
      const block = source.slice(fnNameCheck - 200, fnNameCheck + 50);
      // Should validate name with regex and length check
      expect(block).toMatch(/\.test\(fnObj\.name\)/);
      expect(block).toMatch(/\.length\s*<=\s*256/);
    });
  });

  // =========================================================================
  // #10 MEDIUM — config.ts resolveEnvVars no recursion depth limit
  // =========================================================================
  describe("#10 — resolveEnvVars should have depth limit", () => {
    it("should track and limit recursion depth", () => {
      const source = readFileSync("src/config.ts", "utf-8");
      const fnStart = source.indexOf("function resolveEnvVars");
      expect(fnStart).toBeGreaterThan(-1);
      const block = source.slice(fnStart, fnStart + 400);
      expect(block).toMatch(/depth|MAX_DEPTH|MAX_ENV_DEPTH/i);
    });
  });
});
