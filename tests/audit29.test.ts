/**
 * Audit #29 — TDD tests (remaining issues not covered by audit #30)
 *
 * 4 issues: 3 High, 1 Medium
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";

describe("Audit #29", () => {
  // =============================================
  // Issue #2 — High: nucleus.ts S-expression injection via collection
  // =============================================
  describe("#2 — nucleus S-expression injection", () => {
    it("should validate collection name to prevent injection", () => {
      const source = readFileSync("src/adapters/nucleus.ts", "utf-8");
      // The collection variable comes from untrusted LLM JSON
      // After fix, it should be validated against allowed patterns
      // Find the filter case collection assignment
      const filterSection = source.match(/case "filter":[\s\S]*?break;/);
      expect(filterSection).not.toBeNull();
      // Should validate collection is a safe identifier (RESULTS, _\d+, etc.)
      expect(filterSection![0]).toMatch(/test\(collection\)|validat|\/\^/);
    });

    it("should validate collection in map/extract case too", () => {
      const source = readFileSync("src/adapters/nucleus.ts", "utf-8");
      const mapSection = source.match(/case "map":[\s\S]*?break;\s*\}/);
      expect(mapSection).not.toBeNull();
      expect(mapSection![0]).toMatch(/test\(collection\)|validat|\/\^/);
    });
  });

  // =============================================
  // Issue #3 — High: pipe.ts JSON cast without field validation
  // =============================================
  describe("#3 — pipe.ts JSON field validation", () => {
    it("should validate filePath exists for load commands", () => {
      const source = readFileSync("src/tool/adapters/pipe.ts", "utf-8");
      // The private handleJSON method should validate filePath before executeAsync
      const handleJSON = source.match(/private async handleJSON[\s\S]*?^\s{2}\}/m);
      expect(handleJSON).not.toBeNull();
      expect(handleJSON![0]).toMatch(/filePath/);
    });

    it("should validate command field exists for query commands", () => {
      const source = readFileSync("src/tool/adapters/pipe.ts", "utf-8");
      // Should validate query command has a command field
      const queryBlock = source.match(/command\.type === "query"\)[\s\S]*?\}/);
      expect(queryBlock).not.toBeNull();
      expect(queryBlock![0]).toMatch(/\.command/);
    });
  });

  // =============================================
  // Issue #4 — High: knowledge-base.ts regex without validateRegex
  // =============================================
  describe("#4 — knowledge-base regex validation", () => {
    it("should validate regex before new RegExp in findComposable", () => {
      const source = readFileSync("src/synthesis/knowledge-base.ts", "utf-8");
      // Find the findComposable method
      const findSection = source.match(/findComposable[\s\S]*?return this\.findCoveringCompositions/);
      expect(findSection).not.toBeNull();
      // Should validate pattern before creating new RegExp
      expect(findSection![0]).toMatch(/validateRegex|validation\.valid/);
    });
  });

  // =============================================
  // Issue #8 — Medium: extractor String(null) → "null"
  // =============================================
  describe("#8 — extractor String(null) false positive", () => {
    it("should filter null/undefined outputs before pattern matching", () => {
      const source = readFileSync("src/synthesis/extractor/synthesis.ts", "utf-8");
      // Find the tryPrefixSuffixExtraction function
      const fnMatch = source.match(/function tryPrefixSuffixExtraction[\s\S]*?^}/m);
      expect(fnMatch).not.toBeNull();
      // Should filter out null/undefined examples before processing
      expect(fnMatch![0]).toMatch(/\.filter\(/);
      expect(fnMatch![0]).toMatch(/!= null|!== null|!== undefined/);
    });
  });
});
