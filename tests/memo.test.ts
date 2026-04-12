/**
 * Tests for the memory pad (memo) feature.
 *
 * Validates:
 * - Storing memos without a loaded document
 * - Memo handles use $memo prefix with descriptive names from labels
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
    it("should store a memo and return a descriptive handle stub", async () => {
      const result = session.memo("Hello, world!\nThis is a test.", "greeting");

      expect(result.success).toBe(true);
      expect(result.handle).toBe("$memo_greeting");
      expect(result.stub).toContain("$memo_greeting");
      expect(result.stub).toContain("greeting");
      expect(result.stub).toContain("2 lines");
    });

    it("should work without a loaded document", async () => {
      // No loadFile/loadContent called
      const result = session.memo("Some context to remember", "context note");
      expect(result.success).toBe(true);
      expect(result.handle).toBe("$memo_context_note");
    });

    it("should assign descriptive memo handles from labels", async () => {
      const r1 = session.memo("First memo", "first");
      const r2 = session.memo("Second memo", "second");
      const r3 = session.memo("Third memo", "third");

      expect(r1.handle).toBe("$memo_first");
      expect(r2.handle).toBe("$memo_second");
      expect(r3.handle).toBe("$memo_third");
    });

    it("should disambiguate repeated labels with numeric suffix", async () => {
      const r1 = session.memo("Draft 1", "notes");
      const r2 = session.memo("Draft 2", "notes");

      expect(r1.handle).toBe("$memo_notes");
      expect(r2.handle).toBe("$memo_notes_2");
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
      const result = session.memo(content, "test memo");

      const expanded = session.expand(result.handle!);
      expect(expanded.success).toBe(true);
      expect(expanded.total).toBe(3);
      expect(expanded.data).toEqual(["Line 1", "Line 2", "Line 3"]);
    });

    it("should support limit and offset on memo expansion", async () => {
      const content = Array.from({ length: 20 }, (_, i) => `Line ${i + 1}`).join("\n");
      const result = session.memo(content, "numbered lines");

      const page1 = session.expand(result.handle!, { limit: 5, offset: 0 });
      expect(page1.data).toHaveLength(5);
      expect(page1.data![0]).toBe("Line 1");

      const page2 = session.expand(result.handle!, { limit: 5, offset: 5 });
      expect(page2.data).toHaveLength(5);
      expect(page2.data![0]).toBe("Line 6");
    });
  });

  describe("memo labels in bindings", () => {
    it("should show memo labels in getBindings()", async () => {
      const result = session.memo("Some architecture notes", "arch overview");

      const bindings = session.getBindings();
      expect(bindings[result.handle!]).toContain("arch overview");
    });

    it("should show both memo and query handles in bindings", async () => {
      const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "memo-test-"));
      const testFile = path.join(tempDir, "test.txt");
      fs.writeFileSync(testFile, "ERROR: something failed\nINFO: all good");

      await session.loadFile(testFile);
      const memoResult = session.memo("Analysis summary", "error analysis");
      await session.execute('(grep "ERROR")');

      const bindings = session.getBindings();
      expect(bindings[memoResult.handle!]).toContain("error analysis");
      expect(bindings["$grep_error"]).toContain("Array");

      fs.rmSync(tempDir, { recursive: true });
    });
  });

  describe("memo persistence across document loads", () => {
    it("should preserve memos when clearQueryHandles is called", async () => {
      const memoResult = session.memo("Important context", "must persist");

      const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "memo-test-"));
      const testFile = path.join(tempDir, "test.txt");
      fs.writeFileSync(testFile, "Some document content");

      await session.loadFile(testFile);
      await session.execute('(grep "content")');

      // Clear query handles (simulates document reload)
      session.clearQueryHandles();

      // Memo should still be expandable
      const expanded = session.expand(memoResult.handle!);
      expect(expanded.success).toBe(true);
      expect(expanded.data).toEqual(["Important context"]);

      // Query handle should be gone
      const queryExpanded = session.expand("$grep_content");
      expect(queryExpanded.success).toBe(false);

      // Memo label should still be in bindings
      const bindings = session.getBindings();
      expect(bindings[memoResult.handle!]).toContain("must persist");
      expect(bindings["$grep_content"]).toBeUndefined();

      fs.rmSync(tempDir, { recursive: true });
    });
  });

  describe("getMemoLabel", () => {
    it("should return label for memo handles", async () => {
      const result = session.memo("Content", "my label");
      expect(session.getMemoLabel(result.handle!)).toBe("my label");
    });

    it("should return null for non-memo handles", async () => {
      expect(session.getMemoLabel("$res")).toBeNull();
      expect(session.getMemoLabel("$memo_nonexistent")).toBeNull();
    });
  });

  describe("memo deletion", () => {
    it("should delete a memo by handle", async () => {
      const r1 = session.memo("Content A", "memo a");
      const r2 = session.memo("Content B", "memo b");

      const deleted = session.deleteMemo(r1.handle!);
      expect(deleted).toBe(true);

      const expanded = session.expand(r1.handle!);
      expect(expanded.success).toBe(false);

      // Second memo should still work
      const memo2 = session.expand(r2.handle!);
      expect(memo2.success).toBe(true);
    });

    it("should return false for non-memo handles", async () => {
      expect(session.deleteMemo("$res")).toBe(false);
      expect(session.deleteMemo("$memo_nonexistent")).toBe(false);
    });

    it("should update byte tracking on delete", async () => {
      const result = session.memo("x".repeat(1000), "big memo");
      const before = session.getMemoStats();
      expect(before.totalBytes).toBe(1000);

      session.deleteMemo(result.handle!);
      const after = session.getMemoStats();
      expect(after.totalBytes).toBe(0);
      expect(after.count).toBe(0);
    });
  });

  describe("memo eviction", () => {
    it("should evict oldest memo when count limit exceeded", async () => {
      const limit = HandleSession.MAX_MEMOS;
      // Fill to the limit — use unique labels so each gets a unique handle
      const handles: string[] = [];
      for (let i = 0; i < limit; i++) {
        const r = session.memo(`Memo ${i}`, `memo-${i}`);
        handles.push(r.handle!);
      }
      expect(session.getMemoStats().count).toBe(limit);

      // One more should evict the oldest
      session.memo("One more", "overflow");
      const stats = session.getMemoStats();
      expect(stats.count).toBe(limit);

      // Oldest (first created) should be evicted
      const oldest = session.expand(handles[0]);
      expect(oldest.success).toBe(false);

      // Latest should exist
      const latest = session.expand("$memo_overflow");
      expect(latest.success).toBe(true);
    });

    it("should evict oldest memos when byte budget exceeded", async () => {
      const maxBytes = HandleSession.MAX_MEMO_BYTES;
      const chunkSize = Math.floor(maxBytes / 3);

      // Store 3 memos that together fill the budget
      const r1 = session.memo("x".repeat(chunkSize), "chunk-1");
      session.memo("x".repeat(chunkSize), "chunk-2");
      session.memo("x".repeat(chunkSize), "chunk-3");

      // Adding another should evict the oldest to make room
      const r4 = session.memo("x".repeat(chunkSize), "chunk-4");

      // First memo should be evicted
      expect(session.expand(r1.handle!).success).toBe(false);
      // Fourth memo should exist
      expect(session.expand(r4.handle!).success).toBe(true);
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

  describe("eviction order is creation order", () => {
    it("should evict oldest by creation time, not alphabetically", async () => {
      // Create 12 memos
      const handles: string[] = [];
      for (let i = 0; i < 12; i++) {
        const r = session.memo(`Memo ${i + 1}`, `memo-${i + 1}`);
        handles.push(r.handle!);
      }

      // Delete the first manually to set up the interesting case
      session.deleteMemo(handles[0]);
      // Now second created is the oldest remaining

      // Fill to the limit
      const limit = HandleSession.MAX_MEMOS;
      const remaining = limit - 11; // 11 memos left after deleting first
      for (let i = 0; i < remaining; i++) {
        session.memo(`Filler ${i}`, `filler-${i}`);
      }
      expect(session.getMemoStats().count).toBe(limit);

      // One more triggers eviction — should evict second created (oldest remaining)
      session.memo("overflow", "overflow-final");
      expect(session.getMemoStats().count).toBe(limit);
      expect(session.expand(handles[1]).success).toBe(false);
      // Later memos should survive
      expect(session.expand(handles[9]).success).toBe(true);
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
