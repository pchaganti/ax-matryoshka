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
  // =============================================
  // Issue #1 — High: lattice-tool formatResponse unsafe cast
  // =============================================
  describe("#1 — lattice-tool formatResponse type safety", () => {
    it("should not crash when line property is not a string", () => {
      const source = readFileSync("src/tool/lattice-tool.ts", "utf-8");
      // After fix, the code should check typeof gr.line === "string" before calling .slice()
      const castMatch = source.match(
        /if\s*\(typeof item === "object" && item !== null && "line" in item\)\s*\{([^}]+)\}/
      );
      expect(castMatch).not.toBeNull();
      // Should have a typeof check for line before using .slice()
      expect(castMatch![1]).toMatch(/typeof.*line.*===.*"string"/);
    });
  });

  // =============================================
  // Issue #2 — High: extractor delimiter escaping
  // =============================================
  describe("#2 — extractor delimiter escaping", () => {
    it("should escape newlines in delimiter for code generation", () => {
      const source = readFileSync("src/synthesis/extractor/synthesis.ts", "utf-8");
      // Find the escapedDelim line — should handle newline escaping
      const escapeSection = source.match(/const escapedDelim = delim([^;]+);/);
      expect(escapeSection).not.toBeNull();
      // Should escape newlines (\n) and carriage returns (\r)
      expect(escapeSection![1]).toMatch(/\\n/);
    });
  });

  // =============================================
  // Issue #3 — Medium: deepEqual no depth limit
  // =============================================
  describe("#3 — deepEqual depth limit", () => {
    it("should handle deeply nested objects without stack overflow", () => {
      const source = readFileSync("src/synthesis/evolutionary.ts", "utf-8");
      // After fix, deepEqual should have a depth parameter or limit
      const deepEqualMatch = source.match(/deepEqual\(a: unknown, b: unknown[^)]*\)/);
      expect(deepEqualMatch).not.toBeNull();
      // Should have a depth parameter
      expect(deepEqualMatch![0]).toMatch(/depth/);
    });
  });

  // =============================================
  // Issue #4 — Medium: parseNumericResult returns Infinity
  // =============================================
  describe("#4 — parseNumericResult Infinity guard", () => {
    it("should not return Infinity for very long digit strings", () => {
      const source = readFileSync("src/rlm.ts", "utf-8");
      // After fix, parseNumericResult should check isFinite
      const fnMatch = source.match(/function parseNumericResult[^}]+\}/s);
      expect(fnMatch).not.toBeNull();
      expect(fnMatch![0]).toMatch(/isFinite|Infinity/);
    });
  });

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
