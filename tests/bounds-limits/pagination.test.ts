/** Bounds & limits: bounds-limits/pagination — migrated from audit rounds 38, 48, 56, 58, 63. */
import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";

describe("Bounds & limits: pagination", () => {
  // from audit#38
  describe("#5 — expand should have a default limit cap", () => {
    it("should cap the default limit to a reasonable maximum", () => {
      const source = readFileSync("src/engine/handle-session.ts", "utf-8");
      // Should have MAX_DEFAULT_LIMIT or Math.min to cap default
      const expandFn = source.match(/const limit = Math\.(max|min)\(.*?\);/);
      expect(expandFn).not.toBeNull();
      // Should cap the default: Math.min(total, MAX) or similar
      expect(expandFn![0]).toMatch(/Math\.min|MAX_DEFAULT|MAX_EXPAND/);
    });
  });

  // from audit#48
  describe("#9 — handle-ops preview and sample should bound n", () => {
    it("should clamp n to a maximum value in preview", () => {
      const source = readFileSync("src/persistence/handle-ops.ts", "utf-8");
      const previewFn = source.match(/preview\(handle[\s\S]*?getHandleDataSlice|MAX_PREVIEW/);
      expect(previewFn).not.toBeNull();
      expect(previewFn![0]).toMatch(/MAX_PREVIEW|Math\.min|10000/);
    });
    it("should clamp n to a maximum value in sample", () => {
      const source = readFileSync("src/persistence/handle-ops.ts", "utf-8");
      const sampleFn = source.match(/sample\(handle[\s\S]*?data\.length <= n/);
      expect(sampleFn).not.toBeNull();
      expect(sampleFn![0]).toMatch(/MAX_SAMPLE|Math\.min|10000/);
    });
  });

  // from audit#56
  describe("#7 — rlm fuzzy_search should validate limit parameter", () => {
    it("should clamp limit to a valid positive integer", () => {
      const source = readFileSync("src/rlm.ts", "utf-8");
      const fuzzyBlock = source.match(/fuzzy_search:\s*\(query.*?limit.*?\)\s*=>\s*\{[\s\S]*?slice\(0,\s*\w+\)/);
      expect(fuzzyBlock).not.toBeNull();
      expect(fuzzyBlock![0]).toMatch(/Math\.max|Math\.min|Math\.floor|clamp/i);
    });
  });

  // from audit#58
  describe("#3 — getHandleDataSlice should cap limit", () => {
    it("should enforce a maximum limit value", () => {
      const source = readFileSync("src/persistence/session-db.ts", "utf-8");
      const fnStart = source.indexOf("getHandleDataSlice(");
      expect(fnStart).toBeGreaterThan(-1);
      const block = source.slice(fnStart, fnStart + 400);
      expect(block).toMatch(/MAX_SLICE|Math\.min.*limit/i);
    });
  });

  // from audit#63
  describe("#7 — searchIndex should bound topK parameter", () => {
    it("should cap topK to a maximum", () => {
      const source = readFileSync("src/rag/similarity.ts", "utf-8");
      const fnStart = source.indexOf("function searchIndex(");
      if (fnStart === -1) {
        const altStart = source.indexOf("export function searchIndex(");
        expect(altStart).toBeGreaterThan(-1);
        const block = source.slice(altStart, altStart + 400);
        expect(block).toMatch(/MAX_TOP_K|Math\.min.*topK|topK.*Math\.min/i);
      } else {
        const block = source.slice(fnStart, fnStart + 400);
        expect(block).toMatch(/MAX_TOP_K|Math\.min.*topK|topK.*Math\.min/i);
      }
    });
  });
});
