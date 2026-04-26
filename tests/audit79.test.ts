/**
 * Audit #79 — 10 security issues
 *
 * 1. HIGH   lc-solver.ts evaluate add — missing isFinite on result
 * 2. MEDIUM synthesis-integrator.ts synthesizeClassifier — unbounded outputGroups
 * 3. MEDIUM nucleus.ts getSuccessFeedback — query not truncated in prompt
 * 4. MEDIUM base.ts getErrorFeedback — error not truncated
 * 5. MEDIUM qwen.ts getErrorFeedback — error not truncated
 * 6. MEDIUM deepseek.ts getErrorFeedback — error not truncated
 * 7. MEDIUM nucleus-engine.ts — _fn_ binding name bypasses validation
 * 8. MEDIUM lc-interpreter.ts formatValue — Object.entries on unbounded object
 * 9. MEDIUM session-db.ts getCheckpoint — no size check before JSON.parse
 * 10. MEDIUM nucleus-engine.ts fuzzy_search — no line count cap
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";

describe("Audit #79", () => {

  // =========================================================================
  // #7 MEDIUM — nucleus-engine.ts _fn_ binding name bypasses validation
  // =========================================================================
  describe("#7 — _fn_ binding should validate fnObj.name", () => {
    it("should validate fnObj.name before creating binding key", () => {
      const source = readFileSync("src/engine/nucleus-engine.ts", "utf-8");
      const fnBinding = source.indexOf("_fn_${fnObj.name}");
      expect(fnBinding).toBeGreaterThan(-1);
      // Look backwards for validation
      const block = source.slice(Math.max(0, fnBinding - 300), fnBinding + 100);
      expect(block).toMatch(/fnObj\.name.*test|fnObj\.name.*match|typeof fnObj\.name|fnObj\.name\.length/);
    });
  });
});
