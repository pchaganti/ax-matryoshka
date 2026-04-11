import { describe, it, expect } from "vitest";
import {
  LatticeTool,
  parseCommand,
  formatResponse,
} from "../../src/tool/lattice-tool.js";

describe("LatticeTool", () => {
  describe("loadContent", () => {
    it("should load content from string", async () => {
      const tool = new LatticeTool();
      const result = await tool.execute({
        type: "loadContent",
        content: "line1\nline2\nline3",
        name: "test-doc",
      });

      expect(result.success).toBe(true);
      expect(result.message).toContain("test-doc");
      expect(result.message).toContain("3 lines");
    });

    it("should use default name for inline document", async () => {
      const tool = new LatticeTool();
      const result = await tool.execute({
        type: "loadContent",
        content: "test data",
      });

      expect(result.success).toBe(true);
      expect(result.message).toContain("inline-document");
    });
  });

  describe("query", () => {
    it("should execute grep command", async () => {
      const tool = new LatticeTool();
      await tool.execute({ type: "loadContent", content: "error line\nok line\nerror again" });

      const result = await tool.execute({ type: "query", command: '(grep "error")' });

      expect(result.success).toBe(true);
      expect(result.message).toContain("Found 2 results");
    });

    it("should return error when no document loaded", async () => {
      const tool = new LatticeTool();
      const result = await tool.execute({ type: "query", command: '(grep "test")' });

      expect(result.success).toBe(false);
      expect(result.error).toContain("No document loaded");
    });

    it("should maintain bindings across queries", async () => {
      const tool = new LatticeTool();
      await tool.execute({ type: "loadContent", content: "a\nb\nc\nd\ne" });
      await tool.execute({ type: "query", command: '(grep "[a-z]")' }); // match all lines

      const result = await tool.execute({ type: "query", command: "(count RESULTS)" });

      expect(result.success).toBe(true);
      expect(result.data).toBe(5);
    });
  });

  describe("bindings", () => {
    it("should return current bindings", async () => {
      const tool = new LatticeTool();
      await tool.execute({ type: "loadContent", content: "test" });
      await tool.execute({ type: "query", command: '(grep "test")' });

      const result = await tool.execute({ type: "bindings" });

      expect(result.success).toBe(true);
      expect(result.message).toContain("RESULTS");
    });

    it("should report no bindings when empty", async () => {
      const tool = new LatticeTool();
      const result = await tool.execute({ type: "bindings" });

      expect(result.success).toBe(true);
      expect(result.message).toBe("No bindings");
    });
  });

  describe("reset", () => {
    it("should clear bindings", async () => {
      const tool = new LatticeTool();
      await tool.execute({ type: "loadContent", content: "test" });
      await tool.execute({ type: "query", command: '(grep "test")' });
      await tool.execute({ type: "reset" });

      const result = await tool.execute({ type: "bindings" });

      expect(result.success).toBe(true);
      expect(result.message).toBe("No bindings");
    });
  });

  describe("stats", () => {
    it("should return document statistics", async () => {
      const tool = new LatticeTool();
      await tool.execute({ type: "loadContent", content: "line1\nline2\nline3", name: "stats-test" });

      const result = await tool.execute({ type: "stats" });

      expect(result.success).toBe(true);
      expect(result.message).toContain("stats-test");
      expect(result.message).toContain("3 lines");
    });

    it("should return error when no document loaded", async () => {
      const tool = new LatticeTool();
      const result = await tool.execute({ type: "stats" });

      expect(result.success).toBe(false);
      expect(result.error).toContain("No document loaded");
    });
  });

  describe("help", () => {
    it("should return help text", async () => {
      const tool = new LatticeTool();
      const result = await tool.execute({ type: "help" });

      expect(result.success).toBe(true);
      expect(result.message).toContain("grep");
      expect(result.message).toContain("filter");
    });
  });

  describe("isLoaded", () => {
    it("should return false initially", async () => {
      const tool = new LatticeTool();
      expect(tool.isLoaded()).toBe(false);
    });

    it("should return true after loading", async () => {
      const tool = new LatticeTool();
      await tool.execute({ type: "loadContent", content: "test" });
      expect(tool.isLoaded()).toBe(true);
    });
  });

  describe("getDocumentName", () => {
    it("should return null initially", async () => {
      const tool = new LatticeTool();
      expect(tool.getDocumentName()).toBeNull();
    });

    it("should return document name after loading", async () => {
      const tool = new LatticeTool();
      await tool.execute({ type: "loadContent", content: "test", name: "my-doc" });
      expect(tool.getDocumentName()).toBe("my-doc");
    });
  });
});

describe("parseCommand", () => {
  it("should parse :load command", async () => {
    const cmd = parseCommand(":load ./file.txt");
    expect(cmd).toEqual({ type: "load", filePath: "./file.txt" });
  });

  it("should parse :bindings command", async () => {
    expect(parseCommand(":bindings")).toEqual({ type: "bindings" });
    expect(parseCommand(":vars")).toEqual({ type: "bindings" });
  });

  it("should parse :reset command", async () => {
    expect(parseCommand(":reset")).toEqual({ type: "reset" });
    expect(parseCommand(":clear")).toEqual({ type: "reset" });
  });

  it("should parse :stats command", async () => {
    expect(parseCommand(":stats")).toEqual({ type: "stats" });
    expect(parseCommand(":info")).toEqual({ type: "stats" });
  });

  it("should parse :help command", async () => {
    expect(parseCommand(":help")).toEqual({ type: "help" });
    expect(parseCommand(":h")).toEqual({ type: "help" });
    expect(parseCommand(":?")).toEqual({ type: "help" });
  });

  it("should parse S-expression queries", async () => {
    const cmd = parseCommand('(grep "error")');
    expect(cmd).toEqual({ type: "query", command: '(grep "error")' });
  });

  it("should return null for invalid commands", async () => {
    expect(parseCommand("")).toBeNull();
    expect(parseCommand("   ")).toBeNull();
    expect(parseCommand("invalid")).toBeNull();
    expect(parseCommand(":unknown")).toBeNull();
    expect(parseCommand(":load")).toBeNull(); // missing path
  });
});

describe("formatResponse", () => {
  it("should format success message", async () => {
    const output = formatResponse({ success: true, message: "Test message" });
    expect(output).toBe("Test message");
  });

  it("should format error", async () => {
    const output = formatResponse({ success: false, error: "Something failed" });
    expect(output).toBe("Error: Something failed");
  });

  it("should format array results", async () => {
    const output = formatResponse({
      success: true,
      message: "Found 2 results",
      data: [
        { line: "error here", lineNum: 1 },
        { line: "error there", lineNum: 5 },
      ],
    });

    expect(output).toContain("Found 2 results");
    expect(output).toContain("[1]");
    expect(output).toContain("[5]");
  });

  it("should truncate long arrays", async () => {
    const items = Array.from({ length: 20 }, (_, i) => ({
      line: `line ${i}`,
      lineNum: i,
    }));

    const output = formatResponse({
      success: true,
      data: items,
    });

    expect(output).toContain("... and 10 more");
  });

  describe("path traversal prevention", () => {
    it("should reject paths with directory traversal", async () => {
      const tool = new LatticeTool();
      const result = await tool.loadAsync("../../etc/passwd");
      expect(result.success).toBe(false);
      expect(result.error).toMatch(/path|traversal|invalid/i);
    });

    it("should reject paths with embedded traversal", async () => {
      const tool = new LatticeTool();
      const result = await tool.loadAsync("/tmp/safe/../../../etc/passwd");
      expect(result.success).toBe(false);
      expect(result.error).toMatch(/path|traversal|invalid/i);
    });
  });
});
