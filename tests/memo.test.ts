/**
 * Tests for the memory pad (memo) feature.
 *
 * Validates:
 * - Storing memos without a loaded document
 * - Memo handles use $memo prefix
 * - Memos persist across document loads
 * - Memos are expandable via the same expand() API
 * - Memo labels appear in bindings
 * - clearQueryHandles() preserves memos
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { HandleSession } from "../src/engine/handle-session.js";

describe("Memory Pad (Memo)", () => {
  let session: HandleSession;

  beforeEach(() => {
    session = new HandleSession();
  });

  afterEach(() => {
    session.close();
  });

  describe("basic memo storage", () => {
    it("should store a memo and return a handle stub", async () => {
      const result = session.memo("Hello, world!\nThis is a test.", "greeting");

      expect(result.success).toBe(true);
      expect(result.handle).toBe("$memo1");
      expect(result.stub).toContain("$memo1");
      expect(result.stub).toContain("greeting");
      expect(result.stub).toContain("2 lines");
    });

    it("should work without a loaded document", async () => {
      // No loadFile/loadContent called
      const result = session.memo("Some context to remember", "context note");
      expect(result.success).toBe(true);
      expect(result.handle).toBe("$memo1");
    });

    it("should assign incrementing memo handles", async () => {
      const r1 = session.memo("First memo", "first");
      const r2 = session.memo("Second memo", "second");
      const r3 = session.memo("Third memo", "third");

      expect(r1.handle).toBe("$memo1");
      expect(r2.handle).toBe("$memo2");
      expect(r3.handle).toBe("$memo3");
    });

    it("should report token savings", async () => {
      const longContent = "x".repeat(4000); // ~1000 tokens
      const result = session.memo(longContent, "big memo");

      expect(result.tokenMetadata).toBeDefined();
      expect(result.tokenMetadata!.estimatedFullTokens).toBeGreaterThan(500);
      expect(result.tokenMetadata!.stubTokens).toBeLessThan(50);
      expect(result.tokenMetadata!.savingsPercent).toBeGreaterThan(90);
    });
  });

  describe("memo expansion", () => {
    it("should expand memo content via expand()", async () => {
      const content = "Line 1\nLine 2\nLine 3";
      session.memo(content, "test memo");

      const expanded = session.expand("$memo1");
      expect(expanded.success).toBe(true);
      expect(expanded.total).toBe(3);
      expect(expanded.data).toEqual(["Line 1", "Line 2", "Line 3"]);
    });

    it("should support limit and offset on memo expansion", async () => {
      const content = Array.from({ length: 20 }, (_, i) => `Line ${i + 1}`).join("\n");
      session.memo(content, "numbered lines");

      const page1 = session.expand("$memo1", { limit: 5, offset: 0 });
      expect(page1.data).toHaveLength(5);
      expect(page1.data![0]).toBe("Line 1");

      const page2 = session.expand("$memo1", { limit: 5, offset: 5 });
      expect(page2.data).toHaveLength(5);
      expect(page2.data![0]).toBe("Line 6");
    });
  });

  describe("memo labels in bindings", () => {
    it("should show memo labels in getBindings()", async () => {
      session.memo("Some architecture notes", "arch overview");

      const bindings = session.getBindings();
      expect(bindings["$memo1"]).toContain("arch overview");
    });

    it("should show both memo and query handles in bindings", async () => {
      const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "memo-test-"));
      const testFile = path.join(tempDir, "test.txt");
      fs.writeFileSync(testFile, "ERROR: something failed\nINFO: all good");

      await session.loadFile(testFile);
      session.memo("Analysis summary", "error analysis");
      await session.execute('(grep "ERROR")');

      const bindings = session.getBindings();
      expect(bindings["$memo1"]).toContain("error analysis");
      expect(bindings["$res1"]).toContain("Array");

      fs.rmSync(tempDir, { recursive: true });
    });
  });

  describe("memo persistence across document loads", () => {
    it("should preserve memos when clearQueryHandles is called", async () => {
      session.memo("Important context", "must persist");

      const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "memo-test-"));
      const testFile = path.join(tempDir, "test.txt");
      fs.writeFileSync(testFile, "Some document content");

      await session.loadFile(testFile);
      await session.execute('(grep "content")');

      // Clear query handles (simulates document reload)
      session.clearQueryHandles();

      // Memo should still be expandable
      const expanded = session.expand("$memo1");
      expect(expanded.success).toBe(true);
      expect(expanded.data).toEqual(["Important context"]);

      // Query handle should be gone
      const queryExpanded = session.expand("$res1");
      expect(queryExpanded.success).toBe(false);

      // Memo label should still be in bindings
      const bindings = session.getBindings();
      expect(bindings["$memo1"]).toContain("must persist");
      expect(bindings["$res1"]).toBeUndefined();

      fs.rmSync(tempDir, { recursive: true });
    });
  });

  describe("getMemoLabel", () => {
    it("should return label for memo handles", async () => {
      session.memo("Content", "my label");
      expect(session.getMemoLabel("$memo1")).toBe("my label");
    });

    it("should return null for non-memo handles", async () => {
      expect(session.getMemoLabel("$res1")).toBeNull();
      expect(session.getMemoLabel("$memo999")).toBeNull();
    });
  });

  describe("memo deletion", () => {
    it("should delete a memo by handle", async () => {
      session.memo("Content A", "memo a");
      session.memo("Content B", "memo b");

      const deleted = session.deleteMemo("$memo1");
      expect(deleted).toBe(true);

      const expanded = session.expand("$memo1");
      expect(expanded.success).toBe(false);

      // $memo2 should still work
      const memo2 = session.expand("$memo2");
      expect(memo2.success).toBe(true);
    });

    it("should return false for non-memo handles", async () => {
      expect(session.deleteMemo("$res1")).toBe(false);
      expect(session.deleteMemo("$memo999")).toBe(false);
    });

    it("should update byte tracking on delete", async () => {
      session.memo("x".repeat(1000), "big memo");
      const before = session.getMemoStats();
      expect(before.totalBytes).toBe(1000);

      session.deleteMemo("$memo1");
      const after = session.getMemoStats();
      expect(after.totalBytes).toBe(0);
      expect(after.count).toBe(0);
    });
  });

  describe("memo eviction", () => {
    it("should evict oldest memo when count limit exceeded", async () => {
      const limit = HandleSession.MAX_MEMOS;
      // Fill to the limit
      for (let i = 0; i < limit; i++) {
        session.memo(`Memo ${i}`, `memo-${i}`);
      }
      expect(session.getMemoStats().count).toBe(limit);

      // One more should evict the oldest
      session.memo("One more", "overflow");
      const stats = session.getMemoStats();
      expect(stats.count).toBe(limit);

      // $memo1 should be evicted
      const oldest = session.expand("$memo1");
      expect(oldest.success).toBe(false);

      // Latest should exist
      const latest = session.expand(`$memo${limit + 1}`);
      expect(latest.success).toBe(true);
    });

    it("should evict oldest memos when byte budget exceeded", async () => {
      const maxBytes = HandleSession.MAX_MEMO_BYTES;
      const chunkSize = Math.floor(maxBytes / 3);

      // Store 3 memos that together fill the budget
      session.memo("x".repeat(chunkSize), "chunk-1");
      session.memo("x".repeat(chunkSize), "chunk-2");
      session.memo("x".repeat(chunkSize), "chunk-3");

      // Adding another should evict the oldest to make room
      session.memo("x".repeat(chunkSize), "chunk-4");

      // $memo1 should be evicted
      expect(session.expand("$memo1").success).toBe(false);
      // $memo4 should exist
      expect(session.expand("$memo4").success).toBe(true);
      // Total bytes should be within budget
      expect(session.getMemoStats().totalBytes).toBeLessThanOrEqual(maxBytes);
    });
  });

  describe("reset clears memo state", () => {
    it("should clear memo tracking on reset()", async () => {
      session.memo("x".repeat(500), "memo a");
      session.memo("x".repeat(500), "memo b");
      expect(session.getMemoStats().count).toBe(2);
      expect(session.getMemoStats().totalBytes).toBe(1000);

      session.reset();

      // Tracking should be zeroed
      expect(session.getMemoStats().count).toBe(0);
      expect(session.getMemoStats().totalBytes).toBe(0);

      // New memos should work with correct tracking
      session.memo("new", "fresh");
      expect(session.getMemoStats().count).toBe(1);
      expect(session.getMemoStats().totalBytes).toBe(3);
    });
  });

  describe("eviction order is numeric not alphabetic", () => {
    it("should evict $memo2 before $memo10", async () => {
      // Create 12 memos so we have handles crossing the single/double digit boundary
      for (let i = 0; i < 12; i++) {
        session.memo(`Memo ${i + 1}`, `memo-${i + 1}`);
      }

      // Delete $memo1 manually to set up the interesting case
      session.deleteMemo("$memo1");
      // Now oldest is $memo2, not $memo10 (alphabetically $memo10 < $memo2)

      // Fill to the limit
      const limit = HandleSession.MAX_MEMOS;
      const remaining = limit - 11; // 11 memos left after deleting $memo1
      for (let i = 0; i < remaining; i++) {
        session.memo(`Filler ${i}`, `filler-${i}`);
      }
      expect(session.getMemoStats().count).toBe(limit);

      // One more triggers eviction — should evict $memo2 (numeric oldest), not $memo10
      session.memo("overflow", "overflow");
      expect(session.getMemoStats().count).toBe(limit);
      expect(session.expand("$memo2").success).toBe(false);
      expect(session.expand("$memo10").success).toBe(true);
    });
  });

  describe("memo stats", () => {
    it("should track memo count and bytes", async () => {
      const empty = session.getMemoStats();
      expect(empty.count).toBe(0);
      expect(empty.totalBytes).toBe(0);
      expect(empty.maxCount).toBe(HandleSession.MAX_MEMOS);
      expect(empty.maxBytes).toBe(HandleSession.MAX_MEMO_BYTES);

      session.memo("Hello", "test");
      const after = session.getMemoStats();
      expect(after.count).toBe(1);
      expect(after.totalBytes).toBe(5);
    });
  });
});
