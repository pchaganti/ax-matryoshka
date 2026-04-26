/**
 * Audit #87 — 10 security issues
 *
 * 1. HIGH   compile.ts — slice missing end >= 0 check
 * 2. HIGH   evalo.ts — slice missing end >= 0 check
 * 3. MEDIUM synthesis-integrator.ts — dangerousPatterns missing \bObject\b
 * 4. MEDIUM synthesis-integrator.ts — dangerousPatterns missing \.prototype\b
 * 5. MEDIUM http.ts — constructor port not validated
 * 6. MEDIUM http.ts — constructor host not validated
 * 7. MEDIUM http.ts — sendError message not truncated
 * 8. MEDIUM http.ts — path not truncated in error message
 * 9. MEDIUM relational/interpreter.ts — concat missing result length cap
 * 10. MEDIUM fts5-search.ts — searchBatch per-query length not validated
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";

describe("Audit #87", () => {
  // =========================================================================
  // #1 HIGH — compile.ts slice missing end >= 0 check
  // =========================================================================
  describe("#1 — compile.ts slice should reject negative end", () => {
    it("should validate end >= 0", () => {
      const source = readFileSync("src/synthesis/evalo/compile.ts", "utf-8");
      const sliceCase = source.indexOf('case "slice"');
      expect(sliceCase).toBeGreaterThan(-1);
      const block = source.slice(sliceCase, sliceCase + 300);
      expect(block).toMatch(/end\s*<\s*0|end\s*<\s*extractor\.start|end\s*>=?\s*0/);
    });
  });

  // =========================================================================
  // #2 HIGH — evalo.ts slice missing end >= 0 check
  // =========================================================================
  describe("#2 — evalo.ts slice should reject negative end", () => {
    it("should validate end >= 0", () => {
      const source = readFileSync("src/synthesis/evalo/evalo.ts", "utf-8");
      const sliceCase = source.indexOf('case "slice"');
      expect(sliceCase).toBeGreaterThan(-1);
      const block = source.slice(sliceCase, sliceCase + 300);
      expect(block).toMatch(/end\s*<\s*0|end\s*<\s*extractor\.start|end\s*>=?\s*0/);
    });
  });

  // =========================================================================
  // #3 MEDIUM — synthesis-integrator.ts dangerousPatterns missing \bObject\b
  // =========================================================================
  describe("#3 — dangerousPatterns should block Object", () => {
    it("should include Object in dangerous patterns", () => {
      const source = readFileSync("src/logic/synthesis-integrator.ts", "utf-8");
      const patterns = source.indexOf("dangerousPatterns", source.indexOf("synthesizeViaRelational"));
      expect(patterns).toBeGreaterThan(-1);
      const block = source.slice(patterns, patterns + 600);
      expect(block).toMatch(/\\bObject\\b/);
    });
  });

  // =========================================================================
  // #4 MEDIUM — synthesis-integrator.ts dangerousPatterns missing \.prototype
  // =========================================================================
  // #5 MEDIUM — http.ts constructor port not validated
  // =========================================================================
  // #6 MEDIUM — http.ts constructor host not validated
  // =========================================================================
  // #7 MEDIUM — http.ts sendError message not truncated
  // =========================================================================
  describe("#7 — sendError should truncate message", () => {
    it("should cap error message length", () => {
      const source = readFileSync("src/tool/adapters/http.ts", "utf-8");
      const sendError = source.indexOf("private sendError");
      expect(sendError).toBeGreaterThan(-1);
      const block = source.slice(sendError, sendError + 300);
      expect(block).toMatch(/\.slice\(0,|MAX_ERROR|truncat|message\.length/i);
    });
  });

  // =========================================================================
  // #8 MEDIUM — http.ts path not truncated before error message
  // =========================================================================
  describe("#8 — unknown endpoint error should truncate path", () => {
    it("should truncate path before including in error", () => {
      const source = readFileSync("src/tool/adapters/http.ts", "utf-8");
      const unknownEndpoint = source.indexOf("Unknown endpoint");
      expect(unknownEndpoint).toBeGreaterThan(-1);
      const block = source.slice(unknownEndpoint - 100, unknownEndpoint + 100);
      expect(block).toMatch(/safePath|path\.slice\(0,|truncat/i);
    });
  });

  // =========================================================================
  // #9 MEDIUM — relational/interpreter.ts concat missing result length cap
  // =========================================================================
  describe("#9 — exprToCode concat should cap result length", () => {
    it("should include length check in concat", () => {
      const source = readFileSync("src/synthesis/relational/interpreter.ts", "utf-8");
      const concatCase = source.indexOf('case "concat"');
      expect(concatCase).toBeGreaterThan(-1);
      const block = source.slice(concatCase, concatCase + 300);
      expect(block).toMatch(/\.length\s*>|MAX_CONCAT|_res\.length/i);
    });
  });

  // =========================================================================
  // #10 MEDIUM — fts5-search.ts searchBatch per-query length not validated
  // =========================================================================
  describe("#10 — searchBatch should validate per-query length", () => {
    it("should check individual query length", () => {
      const source = readFileSync("src/persistence/fts5-search.ts", "utf-8");
      const searchBatch = source.indexOf("searchBatch");
      expect(searchBatch).toBeGreaterThan(-1);
      const block = source.slice(searchBatch, searchBatch + 400);
      expect(block).toMatch(/query\.length|MAX_QUERY_LENGTH/i);
    });
  });
});
