/**
 * Audit #50 — TDD tests for 10 issues
 * These tests should FAIL before the fixes and PASS after.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";

describe("Audit #50", () => {
  // =========================================================================
  // #1 HIGH — evalo/evalo.ts: match group missing Number.isInteger
  // #2 removed: exclusively tested src/sandbox.ts (deleted with JS-sandbox retirement).

  // =========================================================================
  // #5 MEDIUM — evolutionary.ts: blocklist missing arguments pattern
  // =========================================================================
  describe("#5 — evolutionary blocklist should include arguments", () => {
    it("should block arguments keyword", () => {
      const source = readFileSync("src/synthesis/evolutionary.ts", "utf-8");
      const blocklist = source.match(/DANGEROUS_PATTERNS[\s\S]*?for \(const pattern/);
      expect(blocklist).not.toBeNull();
      expect(blocklist![0]).toMatch(/arguments/);
    });
  });

  // =========================================================================
  // #6 MEDIUM — session-db.ts: FTS5 sanitization missing hyphen/pipe
  // =========================================================================
  describe("#6 — session-db FTS5 sanitization should escape hyphens and pipes", () => {
    it("should include hyphen and pipe in sanitization regex", () => {
      const source = readFileSync("src/persistence/session-db.ts", "utf-8");
      const sanitize = source.match(/sanitized = query\.replace\(\/\[[^\]]*\]/);
      expect(sanitize).not.toBeNull();
      // Should include hyphen and pipe in the character class
      expect(sanitize![0]).toMatch(/-/);
      expect(sanitize![0]).toMatch(/\|/);

    });
  });

  // #8 removed: exclusively tested src/sandbox.ts (deleted with JS-sandbox retirement).

  // =========================================================================
  // #9 MEDIUM — nucleus.ts: group index not clamped in S-expression
  // =========================================================================
  describe("#9 — nucleus jsonToSexp should clamp group index", () => {
    it("should clamp group to a reasonable maximum", () => {
      const source = readFileSync("src/adapters/nucleus.ts", "utf-8");
      const groupLine = source.match(/obj\.group[\s\S]*?group >= 0[\s\S]*?escapeForSexp/);
      expect(groupLine).not.toBeNull();
      expect(groupLine![0]).toMatch(/Math\.min|group\s*>\s*\d|MAX_GROUP/);
    });
  });

  // =========================================================================
  // #10 MEDIUM — evolutionary.ts: missing template literal/bracket blocks
  // =========================================================================
  describe("#10 — evolutionary blocklist should block template literals and bracket notation", () => {
    it("should check for template literals and bracket notation with strings", () => {
      const source = readFileSync("src/synthesis/evolutionary.ts", "utf-8");
      const validateFn = source.match(/validateSolution[\s\S]*?new Function/);
      expect(validateFn).not.toBeNull();
      expect(validateFn![0]).toMatch(/`|template/i);
      expect(validateFn![0]).toMatch(/\\\[.*['"]|bracket/i);
    });
  });
});
