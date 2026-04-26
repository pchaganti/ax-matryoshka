import { describe, it, expect, beforeEach } from "vitest";
import {
  ClaudeCodeAdapter,
  createClaudeCodeAdapter,
  generateMCPConfig,
} from "../../src/tool/adapters/claude-code.js";

describe("ClaudeCodeAdapter", () => {
  let adapter: ClaudeCodeAdapter;

  beforeEach(() => {
    adapter = new ClaudeCodeAdapter();
  });

  describe("getToolDefinitions", () => {
    it("should return all tool definitions", () => {
      const tools = adapter.getToolDefinitions();

      expect(tools).toHaveLength(6);
      expect(tools.map((t) => t.name)).toEqual([
        "lattice_load",
        "lattice_query",
        "lattice_bindings",
        "lattice_reset",
        "lattice_stats",
        "lattice_help",
      ]);
    });

    it("should have valid schemas", () => {
      const tools = adapter.getToolDefinitions();

      for (const tool of tools) {
        expect(tool.name).toBeTruthy();
        expect(tool.description).toBeTruthy();
        expect(tool.inputSchema.type).toBe("object");
        expect(tool.inputSchema.properties).toBeDefined();
        expect(tool.inputSchema.required).toBeDefined();
      }
    });
  });

  describe("callTool", () => {
    it("should handle lattice_help", async () => {
      const result = await adapter.callTool("lattice_help", {});

      expect(result.content).toHaveLength(1);
      expect(result.content[0].type).toBe("text");
      expect(result.content[0].text).toContain("grep");
    });

    it("should handle lattice_bindings when empty", async () => {
      const result = await adapter.callTool("lattice_bindings", {});

      expect(result.content[0].text).toContain("No bindings");
    });

    it("should handle lattice_query without document", async () => {
      const result = await adapter.callTool("lattice_query", { command: '(grep "test")' });

      expect(result.content[0].text).toContain("Error");
      expect(result.content[0].text).toContain("No document loaded");
    });

    it("should handle unknown tool", async () => {
      const result = await adapter.callTool("unknown_tool", {});

      expect(result.content[0].text).toContain("Error");
      expect(result.content[0].text).toContain("Unknown tool");
    });

    it("should support full workflow", async () => {
      // Load content via the underlying tool
      adapter.getTool().execute({
        type: "loadContent",
        content: "line with error\nline ok\nanother error",
        name: "test",
      });

      // Query
      const queryResult = await adapter.callTool("lattice_query", {
        command: '(grep "error")',
      });
      expect(queryResult.content[0].text).toContain("2 results");

      // Bindings
      const bindingsResult = await adapter.callTool("lattice_bindings", {});
      expect(bindingsResult.content[0].text).toContain("RESULTS");

      // Stats
      const statsResult = await adapter.callTool("lattice_stats", {});
      expect(statsResult.content[0].text).toContain("test");

      // Reset
      const resetResult = await adapter.callTool("lattice_reset", {});
      expect(resetResult.content[0].text).toContain("reset");

      // Verify bindings cleared
      const afterReset = await adapter.callTool("lattice_bindings", {});
      expect(afterReset.content[0].text).toContain("No bindings");
    });
  });

  describe("getTool", () => {
    it("should return underlying LatticeTool", () => {
      const tool = adapter.getTool();
      expect(tool).toBeDefined();
      expect(typeof tool.execute).toBe("function");
    });
  });
});

describe("createClaudeCodeAdapter", () => {
  it("should create new adapter instance", () => {
    const adapter = createClaudeCodeAdapter();
    expect(adapter).toBeInstanceOf(ClaudeCodeAdapter);
  });
});

describe("generateMCPConfig", () => {
  it("should generate valid JSON config", () => {
    const adapter = new ClaudeCodeAdapter();
    const config = generateMCPConfig(adapter);

    const parsed = JSON.parse(config);
    expect(parsed.tools).toHaveLength(6);
    expect(parsed.tools[0].name).toBe("lattice_load");
    expect(parsed.tools[0].input_schema).toBeDefined();
  });
});

// =====================================================================
// Source-pattern checks (from audits)
// =====================================================================
describe("Source-pattern checks (from audits)", () => {
  // from tests/audit24.test.ts Audit24 #10: claude-code adapter type safety
  describe("Audit24 #10: claude-code adapter type safety", () => {
    it("should be importable and constructable", async () => {
      const { ClaudeCodeAdapter } = await import(
        "../../src/tool/adapters/claude-code.js"
      );
      const adapter = new ClaudeCodeAdapter();
      expect(adapter.callTool).toBeDefined();
    });
  });

  // from tests/audit27.test.ts Audit27 #9: claude-code adapter type validation
  describe("Audit27 #9: claude-code adapter type validation", () => {
    it("should be importable", async () => {
      const { ClaudeCodeAdapter } = await import(
        "../../src/tool/adapters/claude-code.js"
      );
      expect(ClaudeCodeAdapter).toBeDefined();
    });
  });

});
