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
      expect(handle).toMatch(/^\$res\d+$/);
    });

    it("should generate incrementing handles", () => {
      const h1 = registry.store([{ a: 1 }]);
      const h2 = registry.store([{ b: 2 }]);

      expect(h1).toBe("$res1");
      expect(h2).toBe("$res2");
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

      expect(stub).toContain("$res1");
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
      expect(context).toContain("$res1:");
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

    it("should allow reuse of deleted handle numbers", () => {
      // This tests that handles are not reused (they increment forever)
      const h1 = registry.store([{ a: 1 }]);
      registry.delete(h1);
      const h2 = registry.store([{ b: 2 }]);

      // Handle counter should continue incrementing
      expect(h2).toBe("$res2");
    });
  });

  describe("eviction", () => {
    it("should evict the oldest non-memo handle (creation order, not alphabetical)", () => {
      // Create 10 handles so we get $res1..$res10
      // Delete $res1 so the oldest remaining is $res2
      // Alphabetical order would put $res10 before $res2, but creation
      // order should evict $res2 first (the actually oldest remaining handle).
      for (let i = 1; i <= 10; i++) {
        registry.store([{ val: i }]);
      }

      // Delete $res1 — now $res2 is the oldest remaining
      registry.delete("$res1");
      expect(registry.listHandles()).toHaveLength(9);

      registry.evictOldest();

      // $res2 should be evicted (oldest by creation), NOT $res10
      const remaining = registry.listHandles();
      expect(remaining).not.toContain("$res2");
      expect(remaining).toContain("$res10");
      expect(remaining).toContain("$res3");
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
      registry.store([{ a: 1 }]);
      registry.store([{ b: 2 }]);
      registry.store([{ c: 3 }]);

      const handles = registry.listHandles();
      expect(handles).toHaveLength(3);
      expect(handles).toContain("$res1");
      expect(handles).toContain("$res2");
      expect(handles).toContain("$res3");
    });

    it("should find handles after gaps from deletion", () => {
      registry.store([{ a: 1 }]);  // $res1
      registry.store([{ b: 2 }]);  // $res2
      registry.store([{ c: 3 }]);  // $res3
      registry.store([{ d: 4 }]);  // $res4
      registry.store([{ e: 5 }]);  // $res5

      // Delete handle 3, creating a gap
      registry.delete("$res3");

      const handles = registry.listHandles();
      expect(handles).toHaveLength(4);
      expect(handles).toContain("$res1");
      expect(handles).toContain("$res2");
      expect(handles).toContain("$res4");
      expect(handles).toContain("$res5");
      expect(handles).not.toContain("$res3");
    });

    it("should find handles after many deletions at start", () => {
      // Create 15 handles
      for (let i = 0; i < 15; i++) {
        registry.store([{ val: i }]);
      }

      // Delete first 12
      for (let i = 1; i <= 12; i++) {
        registry.delete(`$res${i}`);
      }

      const handles = registry.listHandles();
      expect(handles).toHaveLength(3);
      expect(handles).toContain("$res13");
      expect(handles).toContain("$res14");
      expect(handles).toContain("$res15");
    });

    it("should get handle count info", () => {
      const data = Array.from({ length: 100 }, (_, i) => ({ line: `Line ${i}`, lineNum: i }));
      const handle = registry.store(data);

      const count = registry.getCount(handle);
      expect(count).toBe(100);
    });
  });
});
