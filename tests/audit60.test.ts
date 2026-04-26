/**
 * Audit #60 — TDD tests for 10 issues
 * These tests should FAIL before the fixes and PASS after.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";

describe("Audit #60", () => {
  // =========================================================================
  // #1 HIGH — compile.ts "if" truthiness mismatch vs evalo.ts
  // =========================================================================
  describe("#1 — compiled if should match evalo truthiness semantics", () => {
    it("should use custom falsy check, not JS native truthiness", () => {
      const source = readFileSync("src/synthesis/evalo/compile.ts", "utf-8");
      const ifCase = source.match(/case "if"[\s\S]*?return[^;]*;/);
      expect(ifCase).not.toBeNull();
      // Should NOT use simple ternary `(cond) ? then : else`
      // Should check for null, "", 0, false, NaN like evalo.ts
      expect(ifCase![0]).toMatch(/=== null|=== ""|=== 0|=== false|isNaN/);
    });
  });

  // =========================================================================
  // #2 MEDIUM — predicate-compiler regex doesn't exclude newlines
  // =========================================================================
  describe("#2 — predicate-compiler regex should exclude newlines", () => {
    it("should use character class that excludes newlines", () => {
      const source = readFileSync("src/persistence/predicate-compiler.ts", "utf-8");
      const fnStart = source.indexOf("toSQLCondition(");
      expect(fnStart).toBeGreaterThan(-1);
      const block = source.slice(fnStart, fnStart + 400);
      // The first equality regex should exclude newlines in its character class
      // i.e. [^'"\n] instead of just [^'"]
      expect(block).not.toMatch(/\[\^'"\]\*/);
    });
  });

  // =========================================================================
  // #3 MEDIUM — storeSymbol missing isFinite on startCol/endCol
  // =========================================================================
  describe("#3 — storeSymbol should validate startCol/endCol", () => {
    it("should check isFinite on column numbers", () => {
      const source = readFileSync("src/persistence/session-db.ts", "utf-8");
      const fnStart = source.indexOf("storeSymbol(");
      expect(fnStart).toBeGreaterThan(-1);
      const block = source.slice(fnStart, fnStart + 1200);
      expect(block).toMatch(/is(?:Finite|SafeInteger).*startCol|startCol.*is(?:Finite|SafeInteger)|is(?:Finite|SafeInteger).*Col/i);
    });
  });

  // =========================================================================
  // #4 MEDIUM — saveCheckpoint uses isInteger not isSafeInteger
  // =========================================================================
  describe("#4 — saveCheckpoint should use isSafeInteger", () => {
    it("should validate turn with isSafeInteger", () => {
      const source = readFileSync("src/persistence/session-db.ts", "utf-8");
      const fnStart = source.indexOf("saveCheckpoint(");
      expect(fnStart).toBeGreaterThan(-1);
      const block = source.slice(fnStart, fnStart + 300);
      expect(block).toMatch(/isSafeInteger\(turn\)/);
    });
  });

  // =========================================================================
  // #5 MEDIUM — evalo split() no cap on parts array length
  // =========================================================================
  describe("#5 — evalo split should cap parts length", () => {
    it("should limit split result size", () => {
      const source = readFileSync("src/synthesis/evalo/evalo.ts", "utf-8");
      const splitCase = source.match(/case "split"[\s\S]*?parts\[extractor\.index\]/);
      expect(splitCase).not.toBeNull();
      expect(splitCase![0]).toMatch(/MAX_SPLIT|parts\.length\s*>/i);
    });
  });

  // =========================================================================
  // #6 MEDIUM — regex/synthesis.ts quantifier bounds not validated
  // =========================================================================
  describe("#6 — nodeToRegex should validate quantifier bounds", () => {
    it("should cap min/max quantifier values", () => {
      const source = readFileSync("src/synthesis/regex/synthesis.ts", "utf-8");
      const quantStart = source.indexOf("node.min === node.max");
      expect(quantStart).toBeGreaterThan(-1);
      // Check the region around quantifier handling for a bounds cap
      const quantBlock = source.slice(quantStart - 300, quantStart + 200);
      expect(quantBlock).toMatch(/node\.min\s*>\s*\d+|node\.max\s*>\s*\d+|MAX_QUANTIFIER/i);
    });
  });

  // =========================================================================
  // #7 MEDIUM — sugar.ts unsweetenArray no array length cap
  // =========================================================================
  describe("#7 — unsweetenArray should limit input array length", () => {
    it("should check array length before recursing", () => {
      const source = readFileSync("src/minikanren/sugar.ts", "utf-8");
      const fnStart = source.indexOf("function unsweetenArray");
      expect(fnStart).toBeGreaterThan(-1);
      const block = source.slice(fnStart, fnStart + 300);
      expect(block).toMatch(/xs\.length\s*>|MAX_ARRAY/i);
    });
  });

  // =========================================================================
  // #8 MEDIUM — sugar.ts sweetenPair no list length cap
  // =========================================================================
  describe("#8 — sweetenPair should limit list length", () => {
    it("should track and cap accumulated list length", () => {
      const source = readFileSync("src/minikanren/sugar.ts", "utf-8");
      const fnStart = source.indexOf("function sweetenPair");
      expect(fnStart).toBeGreaterThan(-1);
      const block = source.slice(fnStart, fnStart + 400);
      expect(block).toMatch(/MAX_LIST|length\s*>|listLen/i);
    });
  });

  // =========================================================================
  // #9 MEDIUM — language-map getCustomGrammars keys not validated
  // =========================================================================
  describe("#9 — getAllLanguageConfigs should validate custom grammar keys", () => {
    it("should reject dangerous keys from custom grammars", () => {
      const source = readFileSync("src/treesitter/language-map.ts", "utf-8");
      const mergeBlock = source.match(/custom.*=.*readCustomGrammars[\s\S]*?configs\[lang\]/);
      expect(mergeBlock).not.toBeNull();
      expect(mergeBlock![0]).toMatch(/__proto__|DANGEROUS|prototype/);
    });
  });

  // =========================================================================
  // #10 MEDIUM — lc-solver find_references escaped pattern length not capped
  // =========================================================================
  describe("#10 — find_references should cap escaped pattern length", () => {
    it("should limit final pattern length after escaping", () => {
      const source = readFileSync("src/logic/lc-solver.ts", "utf-8");
      const refStart = source.indexOf('case "find_references"');
      expect(refStart).toBeGreaterThan(-1);
      const block = source.slice(refStart, refStart + 600);
      expect(block).toMatch(/pattern\.length|escaped\.length/);
    });
  });
});
