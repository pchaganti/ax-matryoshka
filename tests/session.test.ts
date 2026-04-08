import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { SessionManager, createSessionManager } from "../src/session.js";

describe("SessionManager (Persistent Sandbox)", () => {
  let sessionManager: SessionManager;
  const mockLLM = async (prompt: string) => `Response: ${prompt}`;

  beforeEach(() => {
    sessionManager = createSessionManager();
  });

  afterEach(() => {
    sessionManager.clearAll();
  });

  describe("createSessionManager", () => {
    it("should create a session manager", () => {
      expect(sessionManager).toBeDefined();
      expect(typeof sessionManager.getOrCreate).toBe("function");
      expect(typeof sessionManager.get).toBe("function");
      expect(typeof sessionManager.clear).toBe("function");
      expect(typeof sessionManager.clearAll).toBe("function");
    });
  });

  describe("getOrCreate", () => {
    it("should create a new sandbox for new document", async () => {
      const sandbox = await sessionManager.getOrCreate(
        "/path/to/doc.txt",
        "Document content",
        mockLLM
      );

      expect(sandbox).toBeDefined();
      expect(typeof sandbox.execute).toBe("function");
    });

    it("should reuse existing sandbox for same path", async () => {
      const sandbox1 = await sessionManager.getOrCreate(
        "/path/to/doc.txt",
        "Document content",
        mockLLM
      );

      // Push something to memory
      await sandbox1.execute('memory.push("first query")');

      const sandbox2 = await sessionManager.getOrCreate(
        "/path/to/doc.txt",
        "Document content",
        mockLLM
      );

      // Should be the same sandbox with preserved memory
      const result = await sandbox2.execute("memory");
      expect(result.result).toEqual(["first query"]);
    });

    it("should recreate sandbox when content changes", async () => {
      const sandbox1 = await sessionManager.getOrCreate(
        "/path/to/doc.txt",
        "Original content",
        mockLLM
      );

      // Push something to memory
      await sandbox1.execute('memory.push("from original")');

      // Get again with CHANGED content
      const sandbox2 = await sessionManager.getOrCreate(
        "/path/to/doc.txt",
        "Updated content - different!", // Content changed
        mockLLM
      );

      // Should be a NEW sandbox with empty memory (old one disposed)
      const result = await sandbox2.execute("memory");
      expect(result.result).toEqual([]);

      // Verify the new sandbox has the updated content
      const contextResult = await sandbox2.execute("context");
      expect(contextResult.result).toBe("Updated content - different!");
    });

    it("should create different sandboxes for different paths", async () => {
      const sandbox1 = await sessionManager.getOrCreate(
        "/path/to/doc1.txt",
        "Content 1",
        mockLLM
      );
      await sandbox1.execute('memory.push("doc1")');

      const sandbox2 = await sessionManager.getOrCreate(
        "/path/to/doc2.txt",
        "Content 2",
        mockLLM
      );
      await sandbox2.execute('memory.push("doc2")');

      // Each should have their own memory
      const result1 = await sandbox1.execute("memory");
      const result2 = await sandbox2.execute("memory");

      expect(result1.result).toEqual(["doc1"]);
      expect(result2.result).toEqual(["doc2"]);
    });
  });

  describe("get", () => {
    it("should return undefined for non-existent session", () => {
      const sandbox = sessionManager.get("/nonexistent/path.txt");
      expect(sandbox).toBeUndefined();
    });

    it("should return existing sandbox", async () => {
      await sessionManager.getOrCreate("/path/to/doc.txt", "Content", mockLLM);

      const sandbox = sessionManager.get("/path/to/doc.txt");
      expect(sandbox).toBeDefined();
    });
  });

  describe("clear", () => {
    it("should clear a specific session", async () => {
      await sessionManager.getOrCreate("/path/to/doc.txt", "Content", mockLLM);

      sessionManager.clear("/path/to/doc.txt");

      const sandbox = sessionManager.get("/path/to/doc.txt");
      expect(sandbox).toBeUndefined();
    });

    it("should not affect other sessions", async () => {
      await sessionManager.getOrCreate("/path/to/doc1.txt", "Content 1", mockLLM);
      await sessionManager.getOrCreate("/path/to/doc2.txt", "Content 2", mockLLM);

      sessionManager.clear("/path/to/doc1.txt");

      expect(sessionManager.get("/path/to/doc1.txt")).toBeUndefined();
      expect(sessionManager.get("/path/to/doc2.txt")).toBeDefined();
    });
  });

  describe("clearAll", () => {
    it("should clear all sessions", async () => {
      await sessionManager.getOrCreate("/path/to/doc1.txt", "Content 1", mockLLM);
      await sessionManager.getOrCreate("/path/to/doc2.txt", "Content 2", mockLLM);

      sessionManager.clearAll();

      expect(sessionManager.get("/path/to/doc1.txt")).toBeUndefined();
      expect(sessionManager.get("/path/to/doc2.txt")).toBeUndefined();
    });
  });

  describe("session persistence across queries", () => {
    it("should preserve variables across multiple queries", async () => {
      const sandbox = await sessionManager.getOrCreate(
        "/path/to/doc.txt",
        "Line 1\nLine 2\nLine 3",
        mockLLM
      );

      // First query: search and store results
      await sandbox.execute(`
        const matches = fuzzy_search("Line 2");
        memory.push(...matches);
      `);

      // Second query: use stored results
      const result = await sandbox.execute(`
        memory.filter(m => m.lineNum === 2);
      `);

      expect(result.result).toHaveLength(1);
    });

    it("should delegate llm_query calls to the provided LLM function", async () => {
      // Sub-call counting is now in createSandboxWithSynthesis (sandbox-tools.ts),
      // not in the session manager. The session manager delegates llm_query
      // to the provided LLM function without counting.
      const calls: string[] = [];
      const trackingLLM = async (prompt: string) => {
        calls.push(prompt);
        return `Response: ${prompt}`;
      };

      const sandbox = await sessionManager.getOrCreate(
        "/path/to/doc.txt",
        "Content",
        trackingLLM
      );

      await sandbox.execute(`
        await llm_query("call 1");
        await llm_query("call 2");
      `);

      expect(calls).toHaveLength(2);
      expect(calls[0]).toBe("call 1");
      expect(calls[1]).toBe("call 2");
    });
  });

  describe("listSessions", () => {
    it("should list all active session paths", async () => {
      await sessionManager.getOrCreate("/path/to/doc1.txt", "Content 1", mockLLM);
      await sessionManager.getOrCreate("/path/to/doc2.txt", "Content 2", mockLLM);

      const sessions = sessionManager.listSessions();

      expect(sessions).toContain("/path/to/doc1.txt");
      expect(sessions).toContain("/path/to/doc2.txt");
      expect(sessions).toHaveLength(2);
    });
  });
});
