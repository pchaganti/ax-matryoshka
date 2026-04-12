import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { SessionDB, commandToSlug } from "../../src/persistence/session-db.js";

describe("SessionDB", () => {
  let db: SessionDB;

  beforeEach(() => {
    db = new SessionDB();
  });

  afterEach(() => {
    db.close();
  });

  describe("initialization", () => {
    it("should create an in-memory database", () => {
      expect(db.isOpen()).toBe(true);
    });

    it("should create required tables on init", () => {
      const tables = db.getTables();
      expect(tables).toContain("document_lines");
      expect(tables).toContain("handles");
      expect(tables).toContain("handle_data");
      expect(tables).toContain("checkpoints");
    });

    it("should create FTS5 virtual table for document lines", () => {
      const ftsTable = db.hasFTS5();
      expect(ftsTable).toBe(true);
    });
  });

  describe("document operations", () => {
    const sampleDoc = `Line 1: Hello world
Line 2: Error occurred
Line 3: Success message
Line 4: Another error here
Line 5: Final line`;

    it("should load document lines into database", () => {
      const count = db.loadDocument(sampleDoc);
      expect(count).toBe(5);
    });

    it("should store line numbers correctly", () => {
      db.loadDocument(sampleDoc);
      const lines = db.getLines(1, 3);
      expect(lines).toHaveLength(3);
      expect(lines[0].lineNum).toBe(1);
      expect(lines[0].content).toBe("Line 1: Hello world");
      expect(lines[2].lineNum).toBe(3);
    });

    it("should clear previous document on new load", () => {
      db.loadDocument("First doc");
      db.loadDocument(sampleDoc);
      const count = db.getLineCount();
      expect(count).toBe(5);
    });

    it("should search document lines with FTS5", () => {
      db.loadDocument(sampleDoc);
      const results = db.search("error");
      expect(results).toHaveLength(2);
      expect(results[0].content).toContain("Error");
    });

    it("should support FTS5 phrase queries", () => {
      db.loadDocument(sampleDoc);
      const results = db.search('"Hello world"');
      expect(results).toHaveLength(1);
    });
  });

  describe("handle storage", () => {
    it("should create a handle for data array", () => {
      const data = [
        { line: "Error 1", lineNum: 1 },
        { line: "Error 2", lineNum: 5 },
      ];
      const handle = db.createHandle(data);
      expect(handle).toMatch(/^\$[a-z0-9_]+$/);
    });

    it("should derive descriptive name from command", () => {
      const data = [{ line: "Error 1", lineNum: 1 }];
      const handle = db.createHandle(data, '(grep "ERROR")');
      expect(handle).toBe("$grep_error");
    });

    it("should store handle metadata", () => {
      const data = [{ line: "Test", lineNum: 1 }];
      const handle = db.createHandle(data);
      const meta = db.getHandleMetadata(handle);

      expect(meta).not.toBeNull();
      expect(meta!.count).toBe(1);
      expect(meta!.type).toBe("array");
    });

    it("should retrieve data by handle", () => {
      const data = [
        { line: "Error 1", lineNum: 1 },
        { line: "Error 2", lineNum: 5 },
      ];
      const handle = db.createHandle(data);
      const retrieved = db.getHandleData(handle);

      expect(retrieved).toHaveLength(2);
      expect(retrieved[0].line).toBe("Error 1");
    });

    it("should disambiguate repeated slugs with numeric suffix", () => {
      const h1 = db.createHandle([{ a: 1 }]);
      const h2 = db.createHandle([{ b: 2 }]);
      const h3 = db.createHandle([{ c: 3 }]);

      // All called without command → slug is "res"
      expect(h1).toBe("$res");
      expect(h2).toBe("$res_2");
      expect(h3).toBe("$res_3");
    });

    it("should disambiguate repeated commands", () => {
      const h1 = db.createHandle([{ a: 1 }], '(grep "ERROR")');
      const h2 = db.createHandle([{ b: 2 }], '(grep "ERROR")');

      expect(h1).toBe("$grep_error");
      expect(h2).toBe("$grep_error_2");
    });

    it("should delete handle and its data", () => {
      const data = [{ line: "Test", lineNum: 1 }];
      const handle = db.createHandle(data);
      db.deleteHandle(handle);

      const meta = db.getHandleMetadata(handle);
      expect(meta).toBeNull();
    });
  });

  describe("checkpoint operations", () => {
    it("should save checkpoint with bindings", () => {
      const bindings = new Map<string, string>([
        ["RESULTS", "$res1"],
        ["_1", "$res1"],
      ]);
      db.saveCheckpoint(1, bindings);

      const restored = db.getCheckpoint(1);
      expect(restored).not.toBeNull();
      expect(restored!.get("RESULTS")).toBe("$res1");
    });

    it("should overwrite checkpoint for same turn", () => {
      const bindings1 = new Map<string, string>([["RESULTS", "$res1"]]);
      const bindings2 = new Map<string, string>([["RESULTS", "$res2"]]);

      db.saveCheckpoint(1, bindings1);
      db.saveCheckpoint(1, bindings2);

      const restored = db.getCheckpoint(1);
      expect(restored!.get("RESULTS")).toBe("$res2");
    });

    it("should list available checkpoints", () => {
      db.saveCheckpoint(1, new Map([["a", "b"]]));
      db.saveCheckpoint(3, new Map([["c", "d"]]));
      db.saveCheckpoint(5, new Map([["e", "f"]]));

      const turns = db.getCheckpointTurns();
      expect(turns).toEqual([1, 3, 5]);
    });
  });

  describe("corrupted JSON resilience", () => {
    it("should return empty array for corrupted handle data JSON", () => {
      // Create a handle normally
      const handle = db.createHandle([{ line: "Test", lineNum: 1 }]);

      // Corrupt the stored JSON directly
      (db as unknown as { db: { prepare: (sql: string) => { run: (...args: unknown[]) => void } } }).db
        .prepare("UPDATE handle_data SET data = 'not{valid}json' WHERE handle = ?")
        .run(handle);

      // Should return null for corrupted item, not crash
      const data = db.getHandleData(handle);
      expect(data).toEqual([null]);
    });

    it("should return null for corrupted checkpoint JSON", () => {
      // Save a valid checkpoint
      db.saveCheckpoint(1, new Map([["RESULTS", "$res1"]]));

      // Corrupt the stored JSON directly
      (db as unknown as { db: { prepare: (sql: string) => { run: (...args: unknown[]) => void } } }).db
        .prepare("UPDATE checkpoints SET bindings = 'corrupted{json' WHERE turn = ?")
        .run(1);

      // Should return null, not crash
      const checkpoint = db.getCheckpoint(1);
      expect(checkpoint).toBeNull();
    });

    it("should still return valid handle data normally", () => {
      const data = [
        { line: "Error 1", lineNum: 1 },
        { line: "Error 2", lineNum: 5 },
      ];
      const handle = db.createHandle(data);
      const retrieved = db.getHandleData(handle);

      expect(retrieved).toHaveLength(2);
      expect(retrieved[0]).toEqual({ line: "Error 1", lineNum: 1 });
    });

    it("should return null for corrupted items but keep valid ones", () => {
      const handle = db.createHandle([{ a: 1 }, { b: 2 }, { c: 3 }]);

      // Corrupt only the middle entry
      (db as unknown as { db: { prepare: (sql: string) => { run: (...args: unknown[]) => void } } }).db
        .prepare("UPDATE handle_data SET data = 'bad' WHERE handle = ? AND idx = 1")
        .run(handle);

      const data = db.getHandleData(handle);
      expect(data).toHaveLength(3);
      expect(data[0]).toEqual({ a: 1 });
      expect(data[1]).toBeNull();
      expect(data[2]).toEqual({ c: 3 });
    });
  });

  describe("getHandleDataSlice", () => {
    it("should return only the requested number of items", () => {
      const data = [{ a: 1 }, { b: 2 }, { c: 3 }, { d: 4 }, { e: 5 }];
      const handle = db.createHandle(data);
      const slice = db.getHandleDataSlice(handle, 2);

      expect(slice).toHaveLength(2);
      expect(slice[0]).toEqual({ a: 1 });
      expect(slice[1]).toEqual({ b: 2 });
    });

    it("should return empty array for unknown handle", () => {
      const slice = db.getHandleDataSlice("$unknown", 5);
      expect(slice).toEqual([]);
    });

    it("should return all items when limit exceeds count", () => {
      const data = [{ a: 1 }, { b: 2 }];
      const handle = db.createHandle(data);
      const slice = db.getHandleDataSlice(handle, 100);

      expect(slice).toHaveLength(2);
    });
  });

  describe("FTS5 search error logging", () => {
    it("should return empty array for invalid FTS5 queries", () => {
      db.loadDocument("test line");
      // Invalid FTS5 syntax should not crash
      const results = db.search("AND OR NOT");
      expect(results).toEqual([]);
    });
  });

  describe("cleanup", () => {
    it("should close database connection", () => {
      db.close();
      expect(db.isOpen()).toBe(false);
    });

    it("should clear all data", () => {
      db.loadDocument("Test line");
      db.createHandle([{ data: 1 }]);
      db.saveCheckpoint(1, new Map([["a", "b"]]));

      db.clearAll();

      expect(db.getLineCount()).toBe(0);
      expect(db.getCheckpointTurns()).toHaveLength(0);
    });
  });

  describe("getLines range validation", () => {
    it("should clamp start < 1 to 1", () => {
      db.loadDocument("line1\nline2\nline3");
      const lines = db.getLines(0, 2);
      expect(lines.length).toBe(2);
      expect(lines[0].lineNum).toBe(1);
    });

    it("should return empty array for inverted range (start > end)", () => {
      db.loadDocument("line1\nline2\nline3");
      const lines = db.getLines(5, 3);
      expect(lines).toEqual([]);
    });
  });

  describe("descriptive handle naming", () => {
    it("should produce descriptive names from commands", () => {
      db.loadDocument("test content");
      const h1 = db.createHandle(["a", "b"], '(grep "ERROR")');
      const h2 = db.createHandle(["c", "d"], '(bm25 "database timeout" 10)');
      const h3 = db.createHandle(["e", "f"], '(list_symbols "function")');

      expect(h1).toBe("$grep_error");
      expect(h2).toBe("$bm25_database_timeout");
      expect(h3).toBe("$list_symbols_function");
    });

    it("should fall back to $res when no command provided", () => {
      db.loadDocument("test content");
      const h1 = db.createHandle(["a", "b"]);
      expect(h1).toBe("$res");
    });

    it("should use sequential suffixes for same slug", () => {
      db.loadDocument("test content");
      const h1 = db.createHandle(["a"], '(grep "ERROR")');
      const h2 = db.createHandle(["b"], '(grep "ERROR")');
      const h3 = db.createHandle(["c"], '(grep "ERROR")');

      expect(h1).toBe("$grep_error");
      expect(h2).toBe("$grep_error_2");
      expect(h3).toBe("$grep_error_3");
    });

    it("should handle different commands with unique slugs", () => {
      db.loadDocument("test content");
      const h1 = db.createHandle(["a"], '(grep "ERROR")');
      const h2 = db.createHandle(["b"], '(grep "WARN")');
      const h3 = db.createHandle(["c"], '(filter RESULTS (lambda x (match x "test" 0)))');

      expect(h1).toBe("$grep_error");
      expect(h2).toBe("$grep_warn");
      // filter picks up "test" from the nested match string
      expect(h3).toBe("$filter_test");
    });

    it("should not collide when a suffixed name matches another slug's base", () => {
      // Slug "grep_error_2" (first use) → $grep_error_2
      // Slug "grep_error" (second use) → would naively produce $grep_error_2
      // Must detect the collision and skip to a safe name
      db.loadDocument("test content");
      const h1 = db.createHandle(["a"], '(grep "error_2")');
      const h2 = db.createHandle(["b"], '(grep "error")');
      const h3 = db.createHandle(["c"], '(grep "error")');

      expect(h1).toBe("$grep_error_2");
      // h2 must NOT be "$grep_error_2" — that's taken by h1
      expect(h2).toBe("$grep_error");
      // h3 is the second "grep_error" slug — but _2 is taken, so must skip to _3
      expect(h3).not.toBe("$grep_error_2");
      // All three must be unique
      const names = new Set([h1, h2, h3]);
      expect(names.size).toBe(3);
    });

    it("should not collide across query and memo handles", () => {
      db.loadDocument("test content");
      const h1 = db.createHandle(["a"], '(grep "error")');
      const m1 = db.createMemoHandle(["b"], "grep error");

      expect(h1).not.toBe(m1);
      // Both should be valid
      expect(db.getHandleMetadata(h1)).not.toBeNull();
      expect(db.getHandleMetadata(m1)).not.toBeNull();
    });
  });

  describe("foreign key cascade", () => {
    it("should cascade delete handle_data when handle is deleted", () => {
      db.loadDocument("test");
      const handle = db.createHandle([1, 2, 3]);
      expect(db.getHandleData(handle)).toHaveLength(3);
      db.deleteHandle(handle);
      // After delete, data should be gone too (cascade)
      expect(db.getHandleData(handle)).toHaveLength(0);
    });
  });

  describe("null value preservation in handles", () => {
    it("should preserve null values in handle data", () => {
      db.loadDocument("test");
      const handle = db.createHandle([1, null, 3]);
      const data = db.getHandleData(handle);
      expect(data).toHaveLength(3);
      expect(data[0]).toBe(1);
      expect(data[1]).toBeNull();
      expect(data[2]).toBe(3);
    });

    it("should preserve null values in handle data slice", () => {
      db.loadDocument("test");
      const handle = db.createHandle([null, 2, null]);
      const data = db.getHandleDataSlice(handle, 10);
      expect(data).toHaveLength(3);
      expect(data[0]).toBeNull();
      expect(data[1]).toBe(2);
      expect(data[2]).toBeNull();
    });
  });
});

describe("commandToSlug", () => {
  it("should extract command name and first string arg", () => {
    expect(commandToSlug('(grep "ERROR")')).toBe("grep_error");
    expect(commandToSlug('(bm25 "database timeout" 10)')).toBe("bm25_database_timeout");
    expect(commandToSlug('(list_symbols "function")')).toBe("list_symbols_function");
  });

  it("should return command name alone when no string arg", () => {
    expect(commandToSlug("(count RESULTS)")).toBe("count");
    expect(commandToSlug("(list_symbols)")).toBe("list_symbols");
    expect(commandToSlug("(filter RESULTS (lambda x x))")).toBe("filter");
  });

  it("should return 'res' when no command provided", () => {
    expect(commandToSlug()).toBe("res");
    expect(commandToSlug("")).toBe("res");
  });

  it("should normalise to lowercase and strip special chars", () => {
    expect(commandToSlug('(grep "ERROR_MSG")')).toBe("grep_error_msg");
    expect(commandToSlug('(grep "Hello World!")')).toBe("grep_hello_world");
  });

  it("should truncate long slugs to 30 chars", () => {
    const slug = commandToSlug('(grep "this is a very long search query that should be truncated")');
    expect(slug.length).toBeLessThanOrEqual(30);
  });

  it("should pick up the first quoted string inside nested expressions", () => {
    expect(commandToSlug('(filter RESULTS (lambda x (match x "timeout" 0)))')).toBe("filter_timeout");
  });

  it("should handle empty quoted strings gracefully", () => {
    expect(commandToSlug('(grep "")')).toBe("grep");
  });

  it("should strip unicode and non-ascii characters", () => {
    expect(commandToSlug('(grep "错误")')).toBe("grep");
    expect(commandToSlug('(grep "café")')).toBe("grep_caf");
  });

  it("should only use the first quoted string", () => {
    expect(commandToSlug('(replace "from" "to")')).toBe("replace_from");
  });

  it("should prefix with q_ to prevent collision with memo namespace", () => {
    expect(commandToSlug("(memo1)")).toBe("q_memo1");
    expect(commandToSlug('(memo "note")')).toBe("q_memo_note");
    // Non-colliding names should not be prefixed
    expect(commandToSlug("(memory)")).toBe("memory");
    expect(commandToSlug('(grep "memo")')).toBe("grep_memo");
  });

  it("should handle bare words without parens", () => {
    expect(commandToSlug("justAWord")).toBe("res");
  });
});
