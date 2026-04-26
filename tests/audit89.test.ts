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
});
