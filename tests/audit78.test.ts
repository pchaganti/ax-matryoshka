/**
 * Audit #78 — 10 security issues
 *
 * 1. HIGH   nucleus-engine.ts getBindings() — prototype pollution via __proto__ key
 * 2. HIGH   config.ts resolveEnvVars — no __proto__/constructor key filtering
 * 3. MEDIUM lc-parser.ts split index — allows floats, should use isSafeInteger
 * 4. MEDIUM session-db.ts getHandleDataSlice — no size check before JSON.parse
 * 5. MEDIUM session-db.ts saveCheckpoint — unbounded JSON serialization
 * 6. MEDIUM lc-interpreter.ts formatValue — typeof object true for null
 * 7. MEDIUM synthesis-integrator.ts findCommonPrefix — s[i] without bounds check
 * 8. MEDIUM sandbox-tools.ts grep flags — not type-checked
 * 9. MEDIUM lc-solver.ts define-fn — term.examples accessed without null check
 * 10. MEDIUM sandbox-tools.ts synthesize_extractor — output cast without validation
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";

describe("Audit #78", () => {
  // =========================================================================
  // #1 HIGH — nucleus-engine.ts getBindings() prototype pollution
  // =========================================================================
  describe("#1 — getBindings should filter dangerous keys", () => {
    it("should use Object.create(null) or filter __proto__", () => {
      const source = readFileSync("src/engine/nucleus-engine.ts", "utf-8");
      const fnStart = source.indexOf("getBindings()");
      expect(fnStart).toBeGreaterThan(-1);
      const block = source.slice(fnStart, fnStart + 400);
      expect(block).toMatch(/Object\.create\(null\)|__proto__|hasOwnProperty|DANGEROUS|prototype/);
    });
  });

  // =========================================================================
  // #2 HIGH — config.ts resolveEnvVars no __proto__ filtering
  // =========================================================================
  describe("#2 — resolveEnvVars should filter dangerous keys in object iteration", () => {
    it("should skip __proto__ constructor prototype keys during object key iteration", () => {
      const source = readFileSync("src/config.ts", "utf-8");
      // Find the object iteration block specifically (for...of Object.entries)
      const objBlock = source.indexOf("for (const [key, value] of Object.entries(obj))");
      expect(objBlock).toBeGreaterThan(-1);
      const block = source.slice(objBlock, objBlock + 300);
      expect(block).toMatch(/DANGEROUS|__proto__|Object\.create\(null\)|key\s*===|\.has\(key\)/);
    });
  });

  // =========================================================================
  // #3 MEDIUM — lc-parser.ts split index allows floats
  // =========================================================================
  describe("#3 — split index should validate isSafeInteger", () => {
    it("should check Number.isSafeInteger on split index", () => {
      const source = readFileSync("src/logic/lc-parser.ts", "utf-8");
      const splitCase = source.indexOf('case "split":', source.indexOf("function parseTerm"));
      expect(splitCase).toBeGreaterThan(-1);
      const block = source.slice(splitCase, splitCase + 500);
      expect(block).toMatch(/isSafeInteger|Number\.isInteger/);
    });
  });

  // =========================================================================
  // #4 MEDIUM — session-db.ts getHandleDataSlice no size check
  // =========================================================================
  describe("#4 — getHandleDataSlice should check size before JSON.parse", () => {
    it("should validate data size before parsing", () => {
      const source = readFileSync("src/persistence/session-db.ts", "utf-8");
      const fnStart = source.indexOf("getHandleDataSlice(");
      expect(fnStart).toBeGreaterThan(-1);
      const block = source.slice(fnStart, fnStart + 700);
      expect(block).toMatch(/MAX_JSON|\.length\s*>/);
    });
  });

  // =========================================================================
  // #5 MEDIUM — session-db.ts saveCheckpoint unbounded serialization
  // =========================================================================
  describe("#5 — saveCheckpoint should cap serialized size", () => {
    it("should check JSON size before storing", () => {
      const source = readFileSync("src/persistence/session-db.ts", "utf-8");
      const fnStart = source.indexOf("saveCheckpoint(");
      expect(fnStart).toBeGreaterThan(-1);
      const block = source.slice(fnStart, fnStart + 500);
      expect(block).toMatch(/MAX_CHECKPOINT|\.length\s*>/);
    });
  });

  // =========================================================================
  // #6 MEDIUM — lc-interpreter.ts formatValue typeof object for null
  // =========================================================================
  describe("#6 — formatValue should guard against null in typeof object check", () => {
    it("should have value !== null check", () => {
      const source = readFileSync("src/logic/lc-interpreter.ts", "utf-8");
      const fnStart = source.indexOf("function formatValue");
      expect(fnStart).toBeGreaterThan(-1);
      const objectCheck = source.indexOf('typeof value === "object"', fnStart);
      expect(objectCheck).toBeGreaterThan(-1);
      const block = source.slice(objectCheck, objectCheck + 100);
      expect(block).toMatch(/value\s*!==\s*null/);
    });
  });

  // =========================================================================
  // #7 MEDIUM — synthesis-integrator.ts findCommonPrefix bounds check
  // =========================================================================
  describe("#7 — findCommonPrefix should check string bounds", () => {
    it("should check i < s.length before accessing s[i]", () => {
      const source = readFileSync("src/logic/synthesis-integrator.ts", "utf-8");
      // Find the function definition, not the call site
      const fnStart = source.indexOf("private findCommonPrefix");
      expect(fnStart).toBeGreaterThan(-1);
      const block = source.slice(fnStart, fnStart + 400);
      expect(block).toMatch(/i\s*<\s*s\.length|\.charAt/);
    });
  });

  // =========================================================================
  // #8 MEDIUM — sandbox-tools.ts grep flags not type-checked
  // =========================================================================
  describe("#8 — grep should type-check flags parameter", () => {
    it("should validate typeof flags === string", () => {
      const source = readFileSync("node_modules/repl-sandbox/dist/builtins/grep.js", "utf-8");
      const grepFn = source.indexOf("function grep(pattern, flags)");
      expect(grepFn).toBeGreaterThan(-1);
      const block = source.slice(grepFn, grepFn + 400);
      expect(block).toMatch(/typeof flags\s*[!=]==?\s*['"]string['"]/);
    });
  });

  // =========================================================================
  // #9 MEDIUM — lc-solver.ts define-fn term.examples without null check
  // =========================================================================
  describe("#9 — define-fn should check term.examples before access", () => {
    it("should guard term.examples with null check", () => {
      const source = readFileSync("src/logic/lc-solver.ts", "utf-8");
      const defineFn = source.indexOf('case "define-fn":');
      expect(defineFn).toBeGreaterThan(-1);
      const block = source.slice(defineFn, defineFn + 300);
      expect(block).toMatch(/!term\.examples|term\.examples\s*&&|term\.examples\.length\s*[<>=]/);
    });
  });

  // =========================================================================
  // #10 MEDIUM — sandbox-tools.ts synthesize_extractor output type validation
  // =========================================================================
  describe("#10 — synthesize_extractor should validate output types", () => {
    it("should check typeof output before casting", () => {
      const source = readFileSync("src/synthesis/sandbox-tools.ts", "utf-8");
      const synthFn = source.indexOf("synthesize_extractor:");
      expect(synthFn).toBeGreaterThan(-1);
      const block = source.slice(synthFn, synthFn + 800);
      expect(block).toMatch(/typeof\s+.*output|output\s*===\s*null|output\s*!==\s*null/);
    });
  });
});
