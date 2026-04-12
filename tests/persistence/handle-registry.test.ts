import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { HandleRegistry } from "../../src/persistence/handle-registry.js";
import { SessionDB } from "../../src/persistence/session-db.js";

describe("HandleRegistry", () => {
  let db: SessionDB;
  let registry: HandleRegistry;

  beforeEach(() => {
    db = new SessionDB();
    registry = new HandleRegistry(db);
  });

  afterEach(() => {
    db.close();
  });

  describe("handle creation", () => {
    it("should store array and return handle", () => {
      const data = [
        { line: "Error 1", lineNum: 1 },
        { line: "Error 2", lineNum: 2 },
      ];
      const handle = registry.store(data);
      expect(handle).toMatch(/^\$[a-z0-9_]+$/);
    });

    it("should generate descriptive handles from commands", () => {
      const h1 = registry.store([{ a: 1 }], '(grep "ERROR")');
      const h2 = registry.store([{ b: 2 }], '(bm25 "timeout")');

      expect(h1).toBe("$grep_error");
      expect(h2).toBe("$bm25_timeout");
    });

    it("should disambiguate repeated commands", () => {
      const h1 = registry.store([{ a: 1 }]);
      const h2 = registry.store([{ b: 2 }]);

      expect(h1).toBe("$res");
      expect(h2).toBe("$res_2");
    });

    it("should retrieve full data by handle", () => {
      const data = [
        { line: "Error 1", lineNum: 1 },
        { line: "Error 2", lineNum: 2 },
      ];
      const handle = registry.store(data);
      const retrieved = registry.get(handle);

      expect(retrieved).toEqual(data);
    });

    it("should return null for invalid handle", () => {
      const result = registry.get("$resNOTEXIST");
      expect(result).toBeNull();
    });
  });

  describe("metadata stubs", () => {
    it("should generate metadata stub for array handle", () => {
      const data = [
        { line: "Error 1", lineNum: 1, index: 0 },
        { line: "Error 2", lineNum: 5, index: 100 },
        { line: "Error 3", lineNum: 10, index: 200 },
      ];
      const handle = registry.store(data);
      const stub = registry.getStub(handle);

      expect(stub).toContain(handle);
      expect(stub).toContain("Array(3)");
      expect(stub).toContain("Error 1");  // Preview of first item
    });

    it("should truncate preview for long data", () => {
      const data = Array.from({ length: 1500 }, (_, i) => ({
        line: `Line ${i}`,
        lineNum: i + 1,
      }));
      const handle = registry.store(data);
      const stub = registry.getStub(handle);

      expect(stub).toContain("Array(1500)");
      expect(stub.length).toBeLessThan(200);  // Stub should be compact
    });

    it("should include type info in stub", () => {
      const data = [
        { line: "Sales: $1,000", lineNum: 1 },
      ];
      const handle = registry.store(data);
      const stub = registry.getStub(handle);

      expect(stub).toContain("Array(1)");
    });
  });

  describe("context building", () => {
    it("should build context with handle stubs only", () => {
      // Store some data
      const data1 = Array.from({ length: 1500 }, (_, i) => ({ line: `Line ${i}`, lineNum: i }));
      const data2 = [{ line: "Single item", lineNum: 1 }];

      const h1 = registry.store(data1);
      const h2 = registry.store(data2);

      const context = registry.buildContext();

      // Context should include stubs, not full data
      expect(context).toContain(h1);
      expect(context).toContain(h2);
      expect(context).toContain("Array(1500)");
      expect(context).toContain("Array(1)");
      expect(context.length).toBeLessThan(500);  // Much smaller than raw data
    });

    it("should format stubs for LLM readability", () => {
      const data = [{ line: "Error", lineNum: 1 }];
      registry.store(data);

      const context = registry.buildContext();
      expect(context).toContain("$res:");
    });
  });

  describe("RESULTS binding", () => {
    it("should track current RESULTS handle", () => {
      const data = [{ line: "Test", lineNum: 1 }];
      const handle = registry.store(data);
      registry.setResults(handle);

      expect(registry.getResults()).toBe(handle);
    });

    it("should resolve RESULTS to actual data", () => {
      const data = [{ line: "Test", lineNum: 1 }];
      const handle = registry.store(data);
      registry.setResults(handle);

      const resolved = registry.resolveResults();
      expect(resolved).toEqual(data);
    });
  });

  describe("handle deletion", () => {
    it("should delete handle and free data", () => {
      const data = [{ line: "Test", lineNum: 1 }];
      const handle = registry.store(data);
      registry.delete(handle);

      expect(registry.get(handle)).toBeNull();
    });

    it("should not reuse slug counts after deletion", () => {
      const h1 = registry.store([{ a: 1 }]);
      registry.delete(h1);
      const h2 = registry.store([{ b: 2 }]);

      // Slug counter should continue incrementing
      expect(h1).toBe("$res");
      expect(h2).toBe("$res_2");
    });
  });

  describe("eviction", () => {
    it("should evict the oldest non-memo handle (creation order)", () => {
      // Create 10 handles with distinct commands so they get unique names
      const handles: string[] = [];
      for (let i = 1; i <= 10; i++) {
        handles.push(registry.store([{ val: i }], `(grep "pattern_${i}")`));
      }

      // Delete the first handle — now the second is the oldest remaining
      registry.delete(handles[0]);
      expect(registry.listHandles()).toHaveLength(9);

      registry.evictOldest();

      // Second handle should be evicted (oldest by creation)
      const remaining = registry.listHandles();
      expect(remaining).not.toContain(handles[1]);
      expect(remaining).toContain(handles[9]); // last created
      expect(remaining).toContain(handles[2]); // third created
      expect(remaining).toHaveLength(8);
    });

    it("should not evict memo handles", () => {
      const memoData = Array.from({ length: 3 }, (_, i) => `memo line ${i}`);
      const memoHandle = db.createMemoHandle(memoData);
      const resHandle = registry.store([{ val: 1 }]);

      registry.evictOldest();

      // Memo handle should survive, query handle should be evicted
      expect(registry.get(memoHandle)).not.toBeNull();
      expect(registry.get(resHandle)).toBeNull();
    });

    it("should clear resultsHandle when the RESULTS handle is evicted", () => {
      const handle = registry.store([{ val: 1 }]);
      registry.setResults(handle);
      expect(registry.getResults()).toBe(handle);

      registry.evictOldest();

      expect(registry.getResults()).toBeNull();
    });
  });

  describe("handle inspection", () => {
    it("should list all active handles", () => {
      const h1 = registry.store([{ a: 1 }], '(grep "a")');
      const h2 = registry.store([{ b: 2 }], '(grep "b")');
      const h3 = registry.store([{ c: 3 }], '(grep "c")');

      const handles = registry.listHandles();
      expect(handles).toHaveLength(3);
      expect(handles).toContain(h1);
      expect(handles).toContain(h2);
      expect(handles).toContain(h3);
    });

    it("should find handles after gaps from deletion", () => {
      const h1 = registry.store([{ a: 1 }], '(grep "a")');
      const h2 = registry.store([{ b: 2 }], '(grep "b")');
      const h3 = registry.store([{ c: 3 }], '(grep "c")');
      const h4 = registry.store([{ d: 4 }], '(grep "d")');
      const h5 = registry.store([{ e: 5 }], '(grep "e")');

      // Delete handle 3, creating a gap
      registry.delete(h3);

      const handles = registry.listHandles();
      expect(handles).toHaveLength(4);
      expect(handles).toContain(h1);
      expect(handles).toContain(h2);
      expect(handles).toContain(h4);
      expect(handles).toContain(h5);
      expect(handles).not.toContain(h3);
    });

    it("should find handles after many deletions at start", () => {
      // Create 15 handles with unique commands
      const all: string[] = [];
      for (let i = 0; i < 15; i++) {
        all.push(registry.store([{ val: i }], `(grep "item_${i}")`));
      }

      // Delete first 12
      for (let i = 0; i < 12; i++) {
        registry.delete(all[i]);
      }

      const handles = registry.listHandles();
      expect(handles).toHaveLength(3);
      expect(handles).toContain(all[12]);
      expect(handles).toContain(all[13]);
      expect(handles).toContain(all[14]);
    });

    it("should get handle count info", () => {
      const data = Array.from({ length: 100 }, (_, i) => ({ line: `Line ${i}`, lineNum: i }));
      const handle = registry.store(data);

      const count = registry.getCount(handle);
      expect(count).toBe(100);
    });
  });
});
