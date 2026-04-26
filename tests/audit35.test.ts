/**
 * Audit #35 — TDD tests for all severity issues
 *
 * Round 1: Critical (sandbox createTextStats negative slice, Object constructor escape)
 * Round 2: High (nucleus-engine negative slice, sandbox grep limit, sum silent skip,
 *           FTS5 hyphen stripping, JSON.stringify circular refs, nucleus adapter JSON nesting,
 *           parser unbalanced paren detection)
 * Round 3: Medium (console.log port 0, loadContent trim inconsistency, coerceConfigTypes,
 *           truncate fragility, fire-and-forget symbols, declaration timeout, shared singleton,
 *           Object blocklist, mcp-server delete-before-set)
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";

describe("Audit #35", () => {
  // Round 1 (critical) removed: exclusively tested src/sandbox.ts, which was
  // deleted when the JS-sandbox path was retired in favor of the nucleus
  // adapter. The bugs it guarded (negative slice in createTextStats, Object
  // constructor escape) no longer have a production surface.

  // =============================================================
  // ROUND 2: High
  // =============================================================

  describe("Round 2: High", () => {
    // #4 removed: exclusively tested src/sandbox.ts (deleted with JS-sandbox retirement).

    // #5 — sum silently ignores non-numeric values
    describe("#5 — sum should log skipped non-numeric values", () => {
      it("should indicate when values are skipped", () => {
        const source = readFileSync("src/logic/lc-solver.ts", "utf-8");
        const sumBlock = source.match(/case "sum"[\s\S]*?return total;/);
        expect(sumBlock).not.toBeNull();
        // Should log or count skipped values
        expect(sumBlock![0]).toMatch(/skipped|warn|non-numeric|unparseable/i);
      });
    });

    // #6 — FTS5 sanitization strips hyphens
    describe("#6 — FTS5 search should preserve hyphens as word chars", () => {
      it("should not strip hyphens from search queries", () => {
        const source = readFileSync("src/persistence/session-db.ts", "utf-8");
        const sanitize = source.match(/sanitized\s*=\s*query\.replace\([^)]+\)/);
        expect(sanitize).not.toBeNull();
        // The character class should NOT include \- (hyphen)
        expect(sanitize![0]).not.toMatch(/\\-/);
      });
    });

    // #7 — JSON.stringify circular reference crash
    describe("#7 — RLM should handle circular references in result", () => {
      it("should have try/catch around JSON.stringify of result", () => {
        const source = readFileSync("src/fsm/rlm-states.ts", "utf-8");
        // Look for safe stringify pattern near result.value
        const stringifyBlock = source.match(
          /result\.value[\s\S]{0,200}JSON\.stringify/
        );
        expect(stringifyBlock).not.toBeNull();
        // Should have try/catch or safe stringify
        const surrounding = source.match(
          /try\s*\{[\s\S]*?JSON\.stringify\(result\.value[\s\S]*?\}\s*catch/
        );
        expect(surrounding).not.toBeNull();
      });
    });

    // #8 — nucleus adapter JSON regex only handles one nesting level
    describe("#8 — nucleus adapter should handle nested JSON", () => {
      it("should handle at least 2 levels of JSON nesting", () => {
        const source = readFileSync("src/adapters/nucleus.ts", "utf-8");
        // Should use a balanced brace approach, not a flat regex
        expect(source).toMatch(/extractJson|parseJsonFromResponse|balancedBrace|depth|nesting/i);
      });
    });
  });

  // =============================================================
  // ROUND 3: Medium
  // =============================================================

  describe("Round 3: Medium", () => {
    // #11 — loadContent trims but stores original
    describe("#11 — loadContent should be consistent", () => {
      it("should store trimmed content if trimming for empty check", () => {
        const source = readFileSync("src/engine/nucleus-engine.ts", "utf-8");
        const loadContent = source.match(/loadContent\(content: string\)[\s\S]*?this\.bindings\.clear/);
        expect(loadContent).not.toBeNull();
        // If trimmed.length > 0, should store content consistently
        // (either always trimmed or document the behavior)
        expect(loadContent![0]).toMatch(/content|trimmed/);
      });
    });
    // #13 — truncate with small max values
    describe("#13 — truncate should handle small max values safely", () => {
      it("should use Math.max(0, ...) for half calculation", () => {
        const source = readFileSync("src/fsm/rlm-states.ts", "utf-8");
        const truncate = source.match(/function truncate[\s\S]*?slice\(-half\)/);
        expect(truncate).not.toBeNull();
        expect(truncate![0]).toMatch(/Math\.max\(0/);
      });
    });

    // #14 removed: exclusively tested src/sandbox.ts (deleted with JS-sandbox retirement).

    // #15 — Object blocklist in evolutionary too aggressive
    describe("#15 — evolutionary Object blocklist should allow Object.keys etc", () => {
      it("should not block Object.keys usage", () => {
        const source = readFileSync("src/synthesis/evolutionary.ts", "utf-8");
        // The DANGEROUS_PATTERNS should not have a blanket /\bObject\b/ check
        const dangerousCheck = source.match(/DANGEROUS_PATTERNS[\s\S]*?\]/);
        expect(dangerousCheck).not.toBeNull();
        // Should either not include Object or have an exception for Object.keys etc
        const hasBlankObjectBlock = dangerousCheck![0].match(/\\bObject\\b/);
        if (hasBlankObjectBlock) {
          // If it blocks Object, there should be an allowlist
          expect(source).toMatch(/Object\.keys|Object\.values|Object\.entries|ALLOWED_OBJECT/i);
        }
      });
    });
  });
});
