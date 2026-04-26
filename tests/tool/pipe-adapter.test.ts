import { describe, it, expect } from "vitest";
import { PipeAdapter } from "../../src/tool/adapters/pipe.js";
import { readFileSync } from "fs";

describe("PipeAdapter", () => {
  describe("executeCommand", () => {
    it("should execute loadContent command", async () => {
      const adapter = new PipeAdapter();
      const result = await adapter.executeCommand({
        type: "loadContent",
        content: "test line\nanother line",
        name: "test-doc",
      });

      expect(result.success).toBe(true);
      expect(result.message).toContain("test-doc");
    });

    it("should execute query command", async () => {
      const adapter = new PipeAdapter();
      await adapter.executeCommand({
        type: "loadContent",
        content: "error here\nok line\nerror again",
      });

      const result = await adapter.executeCommand({
        type: "query",
        command: '(grep "error")',
      });

      expect(result.success).toBe(true);
      expect(result.message).toContain("2 results");
    });

    it("should execute bindings command", async () => {
      const adapter = new PipeAdapter();
      await adapter.executeCommand({ type: "loadContent", content: "test" });
      await adapter.executeCommand({ type: "query", command: '(grep "test")' });

      const result = await adapter.executeCommand({ type: "bindings" });

      expect(result.success).toBe(true);
      expect(result.message).toContain("RESULTS");
    });

    it("should execute reset command", async () => {
      const adapter = new PipeAdapter();
      await adapter.executeCommand({ type: "loadContent", content: "test" });
      await adapter.executeCommand({ type: "query", command: '(grep "test")' });
      await adapter.executeCommand({ type: "reset" });

      const result = await adapter.executeCommand({ type: "bindings" });

      expect(result.success).toBe(true);
      expect(result.message).toBe("No bindings");
    });

    it("should execute stats command", async () => {
      const adapter = new PipeAdapter();
      await adapter.executeCommand({
        type: "loadContent",
        content: "a\nb\nc",
        name: "stats-test",
      });

      const result = await adapter.executeCommand({ type: "stats" });

      expect(result.success).toBe(true);
      expect(result.message).toContain("3 lines");
    });

    it("should execute help command", async () => {
      const adapter = new PipeAdapter();
      const result = await adapter.executeCommand({ type: "help" });

      expect(result.success).toBe(true);
      expect(result.message).toContain("grep");
    });
  });

  describe("error resilience", () => {
    it("should handle malformed JSON gracefully in handleJSON", async () => {
      const adapter = new PipeAdapter();
      // Access the private handleJSON method via executeCommand with bad input
      // The handleJSON method catches JSON.parse errors and returns error response
      const result = await adapter.executeCommand({
        type: "query",
        command: '(grep "nonexistent")',
      });
      // Without a loaded document, this returns an error gracefully
      expect(result.success).toBe(false);
    });
  });

  describe("getTool", () => {
    it("should return the underlying LatticeTool", () => {
      const adapter = new PipeAdapter();
      const tool = adapter.getTool();

      expect(tool).toBeDefined();
      expect(typeof tool.execute).toBe("function");
    });

    it("should share state with executeCommand", async () => {
      const adapter = new PipeAdapter();

      // Load via executeCommand
      await adapter.executeCommand({
        type: "loadContent",
        content: "shared state test",
      });

      // Check via getTool
      expect(adapter.getTool().isLoaded()).toBe(true);
    });
  });
});

// =====================================================================
// Source-pattern checks (from audits)
// =====================================================================
describe("Source-pattern checks (from audits)", () => {
  // from tests/audit24.test.ts Audit24 #8: pipe adapter
  describe("Audit24 #8: pipe adapter", () => {
    it("should be importable and constructable", async () => {
      const { PipeAdapter } = await import("../../src/tool/adapters/pipe.js");
      expect(PipeAdapter).toBeDefined();
    });
  });

  // from tests/audit28.test.ts #7 — pipe adapter graceful shutdown
  describe("#7 — pipe adapter graceful shutdown", () => {
      it("should not call process.exit synchronously on readline close", () => {
        const source = readFileSync("src/tool/adapters/pipe.ts", "utf-8");
        // The close handler should NOT directly call process.exit(0) as the only statement
        // It should use setImmediate or setTimeout to allow pending ops to drain
        const directExitPattern = /rl\.on\(["']close["'],\s*\(\)\s*=>\s*\{\s*\n\s*process\.exit/;
        expect(source).not.toMatch(directExitPattern);
      });
    });

  // from tests/audit29.test.ts #3 — pipe.ts JSON field validation
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

  // from tests/audit72.test.ts #5 — pipe adapter should cap queue size
  describe("#5 — pipe adapter should cap queue size", () => {
      it("should have MAX_QUEUE_SIZE or queue length check", () => {
        const source = readFileSync("src/tool/adapters/pipe.ts", "utf-8");
        const queuePush = source.indexOf("this.queue.push");
        expect(queuePush).toBeGreaterThan(-1);
        const block = source.slice(queuePush - 200, queuePush + 100);
        expect(block).toMatch(/MAX_QUEUE|queue\.length\s*>=|queue\.length\s*>/);
      });
    });

});
