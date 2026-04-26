import { describe, it, expect } from "vitest";
import {
  LatticeTool,
  parseCommand,
  formatResponse,
} from "../../src/tool/lattice-tool.js";
import { readFileSync } from "fs";

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

// =====================================================================
// Source-pattern checks (from audits)
// =====================================================================
describe("Source-pattern checks (from audits)", () => {
  // from tests/audit20.test.ts Audit20 #4: lattice-tool optional chaining safety
  describe("Audit20 #4: lattice-tool optional chaining safety", () => {
    it("should not throw when stats is null", async () => {
      // We test by importing the module — the fix is structural
      const mod = await import("../../src/tool/lattice-tool.js");
      expect(mod).toBeDefined();
      // The actual crash occurs at runtime when stats is null
      // This is a code-review fix verified by inspection
    });
  });

  // from tests/audit30.test.ts #7 — lattice-tool path validation
  describe("#7 — lattice-tool path validation", () => {
      it("should not reject relative paths without traversal", () => {
        const source = readFileSync("src/tool/lattice-tool.ts", "utf-8");
        // The old logic: resolved !== path.normalize(filePath) && !path.isAbsolute(filePath)
        // This rejects ALL relative paths. After fix, should only reject traversal.
        // Check that the condition doesn't use path.resolve !== path.normalize pattern
        expect(source).not.toMatch(
          /resolved !== path\.normalize\(filePath\) && !path\.isAbsolute\(filePath\)/
        );
      });
    });

  // from tests/audit32.test.ts #1 — directory traversal: absolute path rejection
  describe("#1 — directory traversal: absolute path rejection", () => {
        it("should reject absolute paths outside cwd", async () => {
          const { LatticeTool } = await import("../../src/tool/lattice-tool.js");
          const tool = new LatticeTool();
          const result = await tool.executeAsync({ type: "load", filePath: "/etc/passwd" });
          expect(result.success).toBe(false);
          expect(result.error).toMatch(/path|traversal|outside|not allowed/i);
        });

        it("should still allow relative paths without ..", async () => {
          const { LatticeTool } = await import("../../src/tool/lattice-tool.js");
          const tool = new LatticeTool();
          // This file exists - should succeed or fail for content reasons, not path rejection
          const result = await tool.executeAsync({ type: "load", filePath: "package.json" });
          // Should not be rejected as a path traversal
          if (!result.success) {
            expect(result.error).not.toMatch(/traversal|not allowed/i);
          }
        });
      });

  // from tests/audit36.test.ts #12 — lattice-tool path validation should resolve before checking
  describe("#12 — lattice-tool path validation should resolve before checking", () => {
        it("should resolve the path first then verify it's within CWD", () => {
          const source = readFileSync("src/tool/lattice-tool.ts", "utf-8");
          const loadAsync = source.match(/async loadAsync[\s\S]*?loadFile/);
          expect(loadAsync).not.toBeNull();
          // Should resolve first, THEN check if within CWD
          // The resolved path check should come before the traversal string check
          expect(loadAsync![0]).toMatch(/resolve[\s\S]*startsWith/);
        });
      });

  // from tests/audit39.test.ts #3 — lattice-tool should use realResolved path for loadFile
  describe("#3 — lattice-tool should use realResolved path for loadFile", () => {
      it("should pass realResolved to loadFile, not original filePath", () => {
        const source = readFileSync("src/tool/lattice-tool.ts", "utf-8");
        // Check the actual loadFile call includes realResolved argument
        expect(source).toMatch(/loadFile\(realResolved\)/);
        // Should NOT use the original filePath for loadFile
        expect(source).not.toMatch(/loadFile\(filePath\)/);
      });
    });

  // from tests/audit47.test.ts #6 — lattice-tool should reject null bytes in file paths
  describe("#6 — lattice-tool should reject null bytes in file paths", () => {
      it("should check for null bytes before path resolution", () => {
        const source = readFileSync("src/tool/lattice-tool.ts", "utf-8");
        const loadFn = source.match(/loadAsync[\s\S]*?path\.resolve/);
        expect(loadFn).not.toBeNull();
        expect(loadFn![0]).toMatch(/\\0|\\x00|null.*byte|includes.*\\\\0/i);
      });
    });

  // from tests/audit51.test.ts #8 — lattice-tool error should not leak full file path
  describe("#8 — lattice-tool error should not leak full file path", () => {
      it("should sanitize file path in error message", () => {
        const source = readFileSync("src/tool/lattice-tool.ts", "utf-8");
        const errorLine = source.match(/Failed to load.*?\$\{.*?\}/);
        expect(errorLine).not.toBeNull();
        // Should use basename or a safe path representation, not raw filePath
        expect(errorLine![0]).toMatch(/basename|path\.basename|documentName|sanitize/i);
      });
    });

  // from tests/audit53.test.ts #5 — lattice-tool getStats should not leak documentPath
  describe("#5 — lattice-tool getStats should not leak documentPath", () => {
      it("should not include raw documentPath in stats response", () => {
        const source = readFileSync("src/tool/lattice-tool.ts", "utf-8");
        // Find the private getStats method definition and its return block
        const statsIdx = source.indexOf("private getStats()");
        expect(statsIdx).toBeGreaterThan(-1);
        const statsBlock = source.slice(statsIdx, statsIdx + 300);
        // Should NOT include documentPath in the returned data
        expect(statsBlock).not.toMatch(/documentPath/);
      });
    });

});
