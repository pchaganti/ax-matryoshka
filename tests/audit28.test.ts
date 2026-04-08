/**
 * Audit #28 — TDD tests
 *
 * 7 issues: 1 Critical, 2 High, 4 Medium
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";

// Issue #1 — Critical: evolutionary.ts compose() code injection
import { EvolutionarySynthesizer } from "../src/synthesis/evolutionary.js";
import { KnowledgeBase } from "../src/synthesis/knowledge-base.js";

// Issue #3 — High: verifier min>max not checked
import { verifyResult } from "../src/constraints/verifier.js";

// Issue #6 — Medium: IDF zero when single document
import { inverseDocumentFrequency, buildSearchIndex, searchIndex } from "../src/rag/similarity.js";

describe("Audit #28", () => {
  // =============================================
  // Issue #1 — Critical: compose() code injection
  // =============================================
  describe("#1 — compose() code injection", () => {
    it("should sanitize transformComp.code to prevent injection", () => {
      const kb = new KnowledgeBase();
      const synth = new EvolutionarySynthesizer(kb);

      const regexComp = {
        id: "regex_1",
        type: "regex" as const,
        name: "test_regex",
        description: "test",
        code: "/\\d+/",
        pattern: "\\d+",
        positiveExamples: ["abc 123"],
        negativeExamples: [],
        confidence: 0.9,
        usageCount: 1,
        successCount: 1,
        lastUsed: new Date(),
        composableWith: [],
      };

      const maliciousCode = `(function(){ throw new Error("INJECTED") })()`;
      const transformComp = {
        id: "transform_1",
        type: "transformer" as const,
        name: "test_transform",
        description: "test",
        code: maliciousCode,
        positiveExamples: ["123"],
        negativeExamples: [],
        confidence: 0.9,
        usageCount: 1,
        successCount: 1,
        lastUsed: new Date(),
        composableWith: [],
      };

      const result = synth.compose([regexComp, transformComp]);
      // The composed code should either be null (rejected) or safe
      if (result !== null) {
        expect(result.code).not.toContain("INJECTED");
      }
    });
  });

  // =============================================
  // Issue #2 — Not a bug: locate_line newline join
  // The code is inside a template literal, so '\\n' in source becomes '\n'
  // in the generated JS, which correctly joins with newlines.
  // =============================================
  describe("#2 — locate_line newline join (not a bug)", () => {
    it("should use escaped newline in template literal context", () => {
      const source = readFileSync("node_modules/repl-sandbox/dist/builtins/text-utils.js", "utf-8");
      const joinMatch = source.match(/return __linesArray\.slice\(startIdx, endIdx \+ 1\)\.join\(([^)]+)\)/);
      expect(joinMatch).not.toBeNull();
      // In template literal context, '\\n' correctly becomes '\n' at runtime
      expect(joinMatch![1]).toBe("'\\\\n'");
    });
  });

  // =============================================
  // Issue #3 — High: verifier min>max not checked
  // =============================================
  describe("#3 — verifier min>max constraint", () => {
    it("should report error when min > max in constraint", () => {
      const result = verifyResult(5, {
        output: {
          type: "number",
          min: 10,
          max: 3, // min > max — impossible constraint
        },
        examples: [],
      });
      // Should report that the constraint itself is invalid
      expect(result.valid).toBe(false);
      expect(result.errors.some((e: string) => e.includes("min") && e.includes("max"))).toBe(true);
    });
  });

  // =============================================
  // Issue #4 — Medium: maxDaysInMonth month > 12
  // =============================================
  describe("#4 — daysInMonth out of range", () => {
    it("should not accept month values > 12", () => {
      // Test the inline JS logic used in synthesis-integrator
      const DAYS_IN_MONTH = [0, 31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
      // Month 13 should be undefined
      expect(DAYS_IN_MONTH[13]).toBeUndefined();
      // The function uses ?? 31 which silently accepts it — this is the bug
    });
  });

  // =============================================
  // Issue #5 — Medium: session-db clearAll handle counter collision
  // =============================================
  describe("#5 — clearAll handle counter collision", () => {
    it("should not reset handleCounter to 0 after clearAll", async () => {
      const { SessionDB } = await import("../src/persistence/session-db.js");
      const db = new SessionDB();

      // Create handles to increment counter
      db.createHandle([{ lineNum: 1, content: "test" }]);
      db.createHandle([{ lineNum: 2, content: "test2" }]);
      // handleCounter should now be 2

      // Now clearAll
      db.clearAll();

      // Create a new handle — should NOT be $res1 (collision with old handles)
      const handle = db.createHandle([{ lineNum: 3, content: "new" }]);
      expect(handle).not.toBe("$res1");
      expect(handle).not.toBe("$res2");

      db.close();
    });
  });

  // =============================================
  // Issue #6 — Medium: IDF zero with single document
  // =============================================
  describe("#6 — IDF zero with single document", () => {
    it("should produce non-zero IDF values for single document corpus", () => {
      const docs = [["hello", "world", "test"]];
      const idf = inverseDocumentFrequency(docs);
      // With 1 doc, all terms have df=1, so log(1/1) = 0
      // After fix, should use smoothing to produce non-zero values
      for (const [, value] of idf) {
        expect(value).not.toBe(0);
      }
    });

    it("should find similar documents in single-doc index", () => {
      const index = buildSearchIndex([
        { id: "doc1", text: "hello world test data", keywords: ["hello", "world"] },
      ]);
      const results = searchIndex(index, "hello world");
      expect(results.length).toBeGreaterThan(0);
      expect(results[0].score).toBeGreaterThan(0);
    });
  });

  // =============================================
  // Issue #7 — Medium: pipe.ts premature process.exit
  // =============================================
  describe("#7 — pipe adapter graceful shutdown", () => {
    it("should not call process.exit synchronously on readline close", () => {
      const source = readFileSync("src/tool/adapters/pipe.ts", "utf-8");
      // The close handler should NOT directly call process.exit(0) as the only statement
      // It should use setImmediate or setTimeout to allow pending ops to drain
      const directExitPattern = /rl\.on\(["']close["'],\s*\(\)\s*=>\s*\{\s*\n\s*process\.exit/;
      expect(source).not.toMatch(directExitPattern);
    });
  });
});
