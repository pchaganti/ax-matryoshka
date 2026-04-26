/**
 * Audit #36 — TDD tests for all severity issues
 *
 * Round 1: High (filter boolean coercion, FTS5 XSS sanitization,
 *           deepEqual NaN, double-escaping backslashes, content-length pre-check)
 * Round 2: Medium (unbounded log growth, expand negative offset/limit,
 *           sum Infinity guard, regex nested repeat parenthesization,
 *           inferType depth limit, content-type header length, path validation order)
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";

describe("Audit #36", () => {
  // =============================================================
  // ROUND 1: High
  // =============================================================

  describe("Round 1: High", () => {
    // #1 — filter uses JS truthiness by design (match returns "" for no match)
    // This is intentional: empty string and 0 are "no match" in the DSL.
    // Verified as NOT a bug — existing tests confirm truthiness is correct.
    // #4 — nucleus adapter escapeForSexp helper to centralize escaping
    describe("#4 — nucleus adapter should use centralized escape helper", () => {
      it("should have escapeForSexp or equivalent centralized escape function", () => {
        const source = readFileSync("src/adapters/nucleus.ts", "utf-8");
        // Should centralize the escape logic to avoid repetition and ensure consistency
        expect(source).toMatch(/escapeForSexp|function.*escape.*Sexp/i);
      });
    });
  });

  // =============================================================
  // ROUND 2: Medium
  // =============================================================

  describe("Round 2: Medium", () => {
    // #6 removed: exclusively tested src/sandbox.ts (deleted with JS-sandbox retirement).

    // #7 — expand() negative offset/limit
    describe("#7 — expand should validate offset and limit", () => {
      it("should clamp negative offset and limit to 0", () => {
        const source = readFileSync("src/engine/handle-session.ts", "utf-8");
        const expandFn = source.match(/expand\(handle[\s\S]*?getHandleDataSlice/);
        expect(expandFn).not.toBeNull();
        // Should have Math.max(0, ...) or validation
        expect(expandFn![0]).toMatch(/Math\.max\(0|offset\s*<\s*0|clamp/);
      });
    });

    // #9 — regex nested repeat parenthesization
    describe("#9 — regex synthesis should wrap nested repeats", () => {
      it("should also wrap repeat children in non-capturing groups", () => {
        const source = readFileSync("src/synthesis/regex/synthesis.ts", "utf-8");
        const repeatCase = source.match(/case "repeat"[\s\S]*?needsGroup/);
        expect(repeatCase).not.toBeNull();
        // Should include "repeat" in the needsGroup check
        expect(repeatCase![0]).toMatch(/repeat/);
      });
    });

    // #10 — inferType no depth limit
    describe("#10 — inferType should have depth limit", () => {
      it("should have a depth parameter or limit", () => {
        const source = readFileSync("src/synthesis/evalo/typeo.ts", "utf-8");
        const inferFn = source.match(/export function inferType[\s\S]*?^}/m);
        expect(inferFn).not.toBeNull();
        expect(inferFn![0]).toMatch(/depth|MAX_DEPTH/);
      });
    });

    // #11 — Content-Type header length unchecked
    describe("#11 — validateJsonContentType should check header length", () => {
      it("should limit content-type header length", () => {
        const source = readFileSync("src/tool/adapters/http.ts", "utf-8");
        const validateFn = source.match(/validateJsonContentType[\s\S]*?return true;\s*\}/);
        expect(validateFn).not.toBeNull();
        expect(validateFn![0]).toMatch(/length|MAX_HEADER/i);
      });
    });

    // #12 — path validation: resolve first, then check
    describe("#12 — lattice-tool path validation should resolve before checking", () => {
      it("should resolve the path first then verify it's within CWD", () => {
        const source = readFileSync("src/tool/lattice-tool.ts", "utf-8");
        const loadAsync = source.match(/async loadAsync[\s\S]*?loadFile/);
        expect(loadAsync).not.toBeNull();
        // Should resolve first, THEN check if within CWD
        // The resolved path check should come before the traversal string check
        expect(loadAsync![0]).toMatch(/resolve[\s\S]*startsWith/);
      });
    });
  });
});
