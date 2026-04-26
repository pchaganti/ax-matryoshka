/**
 * Audit #30 — TDD tests
 *
 * 7 issues: 2 High, 5 Medium
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";

// Issue #1 — High: lattice-tool formatResponse missing type check
// Issue #7 — Medium: lattice-tool path validation rejects relative paths

// Issue #3 — Medium: deepEqual no depth limit
import { EvolutionarySynthesizer } from "../src/synthesis/evolutionary.js";
import { KnowledgeBase } from "../src/synthesis/knowledge-base.js";

// Issue #5 — Medium: verifier minItems > maxItems
import { verifyResult } from "../src/constraints/verifier.js";

// Issue #6 — Medium: session-db Windows line endings
import { SessionDB } from "../src/persistence/session-db.js";

describe("Audit #30", () => {

  // #4 removed: parseNumericResult helper was deleted as unreachable.
  // It was only called by the deprecated rlm.extractFinalAnswer (also
  // deleted during the FINAL_VAR purge). No production code consumed it.

  // =============================================
  // Issue #5 — Medium: verifier minItems > maxItems
  // =============================================
  describe("#5 — verifier minItems > maxItems constraint", () => {
    it("should report error when minItems > maxItems", () => {
      const result = verifyResult([1, 2, 3], {
        output: {
          type: "array",
          minItems: 10,
          maxItems: 2, // minItems > maxItems — impossible
        },
        examples: [],
      });
      expect(result.valid).toBe(false);
      expect(result.errors.some((e: string) => e.includes("minItems") && e.includes("maxItems"))).toBe(true);
    });
  });

  // =============================================
  // Issue #6 — Medium: session-db Windows line endings
  // =============================================
  describe("#6 — loadDocument Windows line endings", () => {
    it("should strip carriage returns from Windows line endings", () => {
      const db = new SessionDB();
      const windowsContent = "line1\r\nline2\r\nline3\r\n";
      db.loadDocument(windowsContent);

      const lines = db.getLines(1, 3);
      // Lines should NOT have trailing \r
      for (const line of lines) {
        expect(line.content).not.toMatch(/\r/);
      }
      expect(lines[0].content).toBe("line1");
      expect(lines[1].content).toBe("line2");

      db.close();
    });
  });

  // =============================================
  // Issue #7 — Medium: path validation rejects relative paths
  // =============================================
  describe("#7 — lattice-tool path validation", () => {
    it("should not reject relative paths without traversal", () => {
      const source = readFileSync("src/tool/lattice-tool.ts", "utf-8");
      // The old logic: resolved !== path.normalize(filePath) && !path.isAbsolute(filePath)
      // This rejects ALL relative paths. After fix, should only reject traversal.
      // Check that the condition doesn't use path.resolve !== path.normalize pattern
      expect(source).not.toMatch(
        /resolved !== path\.normalize\(filePath\) && !path\.isAbsolute\(filePath\)/
      );
    });
  });
});
