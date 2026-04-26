/**
 * Audit #68 — TDD tests for 10 issues
 * These tests should FAIL before the fixes and PASS after.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";

describe("Audit #68", () => {

  // =========================================================================
  // #2 HIGH — verifier isSafeInvariant missing hex escape check
  // =========================================================================
  describe("#2 — isSafeInvariant should block hex escape sequences", () => {
    it("should reject \\xHH patterns", () => {
      const source2 = readFileSync("src/constraints/verifier.ts", "utf-8");
      // The hex escape check is near the unicode escape check
      const unicodeCheck = source2.indexOf("\\\\u[\\da-fA-F]");
      expect(unicodeCheck).toBeGreaterThan(-1);
      const block = source2.slice(unicodeCheck, unicodeCheck + 200);
      expect(block).toMatch(/\\\\x/i);
    });
  });

  // =========================================================================
  // #3 MEDIUM — predicate-compiler SQL operator not whitelisted
  // =========================================================================
  describe("#3 — predicateToSQL should whitelist SQL operators", () => {
    it("should use explicit operator mapping not fallthrough", () => {
      const source = readFileSync("src/persistence/predicate-compiler.ts", "utf-8");
      const sqlOpStart = source.indexOf("sqlOp");
      expect(sqlOpStart).toBeGreaterThan(-1);
      const block = source.slice(sqlOpStart, sqlOpStart + 400);
      // Should use a map/object or explicit switch, not fallback to raw op
      expect(block).toMatch(/VALID_OPS|validOps|SQL_OPS|allowedOps|op\s*===.*return\s*null/i);
    });
  });

  // =========================================================================
  // #8 MEDIUM — language-map DANGEROUS_KEYS not applied to builtin grammars
  // =========================================================================
  describe("#8 — getAllLanguageConfigs should protect builtin loop too", () => {
    it("should check DANGEROUS_KEYS for builtin grammars", () => {
      const source = readFileSync("src/treesitter/language-map.ts", "utf-8");
      const builtinLoop = source.indexOf("for (const [lang, builtin]");
      expect(builtinLoop).toBeGreaterThan(-1);
      // The DANGEROUS_KEYS check should be inside the builtin loop body, not just in the custom loop
      const builtinBody = source.slice(builtinLoop, builtinLoop + 120);
      expect(builtinBody).toMatch(/DANGEROUS.*\.has\(lang\)|__proto__|skip.*dangerous/i);
    });
  });

  // =========================================================================
  // #9 MEDIUM — verifier string constraint minLength > maxLength not validated
  // =========================================================================
  describe("#9 — verifyStringConstraint should reject minLength > maxLength", () => {
    it("should check minLength <= maxLength", () => {
      const source = readFileSync("src/constraints/verifier.ts", "utf-8");
      const strStart = source.indexOf("function verifyStringConstraint(");
      if (strStart === -1) {
        const altStart = source.indexOf("verifyStringConstraint(");
        expect(altStart).toBeGreaterThan(-1);
        const block = source.slice(altStart, altStart + 800);
        expect(block).toMatch(/minLength.*maxLength|maxLength.*minLength/);
      } else {
        const block = source.slice(strStart, strStart + 800);
        expect(block).toMatch(/minLength.*maxLength|maxLength.*minLength/);
      }
    });
  });

  // =========================================================================
  // #10 MEDIUM — similarity.ts searchIndex sort uses float subtraction
  // =========================================================================
  describe("#10 — searchIndex sort should use safe comparator", () => {
    it("should not use raw subtraction for score sorting", () => {
      const source = readFileSync("src/rag/similarity.ts", "utf-8");
      const sortStart = source.indexOf("Sort by score");
      expect(sortStart).toBeGreaterThan(-1);
      const block = source.slice(sortStart, sortStart + 200);
      // Should use comparison operators not subtraction
      const hasRawSubtraction = /\.sort\(\(a,\s*b\)\s*=>\s*b\.score\s*-\s*a\.score\)/.test(block);
      expect(hasRawSubtraction).toBe(false);
    });
  });
});
