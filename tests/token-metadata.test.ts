/**
 * Tests for token metadata on query results.
 *
 * Validates that handle results include token cost estimates
 * to help LLM agents make smart decisions about expansion.
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { HandleSession } from "../src/engine/handle-session.js";

describe("Token metadata on results", () => {
  let session: HandleSession;
  let tempDir: string;
  let testFile: string;

  const testContent = Array.from({ length: 100 }, (_, i) =>
    `2024-01-15 ${String(i).padStart(6, "0")} LOG: Entry number ${i} with data value=${i * 100}`
  ).join("\n");

  beforeEach(() => {
    session = new HandleSession();
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "token-test-"));
    testFile = path.join(tempDir, "test.log");
    fs.writeFileSync(testFile, testContent);
  });

  afterEach(() => {
    session.close();
    fs.rmSync(tempDir, { recursive: true });
  });

  describe("HandleResult token metadata", () => {
    beforeEach(async () => {
      await session.loadFile(testFile);
    });

    it("should include estimatedTokens on array results", () => {
      const result = session.execute('(grep "LOG")');

      expect(result.success).toBe(true);
      expect(result.tokenMetadata).toBeDefined();
      expect(result.tokenMetadata!.estimatedFullTokens).toBeGreaterThan(0);
      expect(result.tokenMetadata!.stubTokens).toBeGreaterThan(0);
    });

    it("should show significant savings ratio for large results", () => {
      const result = session.execute('(grep "LOG")');

      const meta = result.tokenMetadata!;
      expect(meta.estimatedFullTokens).toBeGreaterThan(meta.stubTokens);
      expect(meta.savingsPercent).toBeGreaterThan(90);
    });

    it("should not include tokenMetadata for scalar results", () => {
      session.execute('(grep "LOG")');
      const result = session.execute("(count RESULTS)");

      expect(result.success).toBe(true);
      expect(result.tokenMetadata).toBeUndefined();
    });

    it("should estimate tokens using ~4 chars per token heuristic", () => {
      const result = session.execute('(grep "LOG")');

      const meta = result.tokenMetadata!;
      // Stub is small, full data is much larger
      expect(meta.stubTokens).toBeLessThan(50);
      expect(meta.estimatedFullTokens).toBeGreaterThan(500);
    });
  });

  describe("ExpandResult token metadata", () => {
    beforeEach(async () => {
      await session.loadFile(testFile);
    });

    it("should include token cost on expanded results", () => {
      const query = session.execute('(grep "LOG")');
      const expanded = session.expand(query.handle!, { limit: 10 });

      expect(expanded.success).toBe(true);
      expect(expanded.tokenMetadata).toBeDefined();
      expect(expanded.tokenMetadata!.returnedTokens).toBeGreaterThan(0);
      expect(expanded.tokenMetadata!.totalTokens).toBeGreaterThan(0);
    });

    it("should show partial vs total tokens when using limit", () => {
      const query = session.execute('(grep "LOG")');
      const expanded = session.expand(query.handle!, { limit: 5 });

      const meta = expanded.tokenMetadata!;
      expect(meta.returnedTokens).toBeLessThan(meta.totalTokens);
    });
  });
});
