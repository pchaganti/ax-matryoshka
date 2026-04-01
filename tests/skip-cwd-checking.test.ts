/**
 * Tests for --dangerously-skip-cwd-checking flag
 *
 * Verifies that:
 * 1. LatticeTool constructor option bypasses CWD path restriction
 * 2. Default behavior (no flag) still rejects paths outside CWD
 * 3. Security baselines survive even when CWD checking is skipped
 * 4. mcp-server.ts validateFilePath respects the flag via process.argv
 * 5. lattice-mcp-server.ts guards are properly conditional
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";

import { LatticeTool } from "../src/tool/lattice-tool.js";

describe("--dangerously-skip-cwd-checking", () => {
  let tempDir: string;
  let outsideFile: string;

  beforeEach(() => {
    // Create a temp file outside CWD (in /tmp)
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "lattice-cwd-test-"));
    outsideFile = path.join(tempDir, "outside.txt");
    fs.writeFileSync(outsideFile, "line1\nline2\nline3\nERROR: something broke\nline5");
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true });
  });

  // =========================================================================
  // LatticeTool — constructor option
  // =========================================================================
  describe("LatticeTool({ skipCwdChecking })", () => {
    describe("default (skipCwdChecking: false)", () => {
      it("should reject absolute paths outside CWD", async () => {
        const tool = new LatticeTool();
        const result = await tool.loadAsync(outsideFile);

        expect(result.success).toBe(false);
        expect(result.error).toMatch(/path|outside|not allowed/i);
      });

      it("should still accept files inside CWD", async () => {
        const tool = new LatticeTool();
        // test-fixtures/small.txt is known to exist inside the repo
        const result = await tool.loadAsync("./test-fixtures/small.txt");

        expect(result.success).toBe(true);
      });
    });

    describe("skipCwdChecking: true", () => {
      it("should allow absolute paths outside CWD", async () => {
        const tool = new LatticeTool({ skipCwdChecking: true });
        const result = await tool.loadAsync(outsideFile);

        expect(result.success).toBe(true);
        expect(result.message).toContain("5 lines");
      });

      it("should still allow files inside CWD", async () => {
        const tool = new LatticeTool({ skipCwdChecking: true });
        const result = await tool.loadAsync("./test-fixtures/small.txt");

        expect(result.success).toBe(true);
      });

      it("should still reject null bytes (security baseline)", async () => {
        const tool = new LatticeTool({ skipCwdChecking: true });
        const result = await tool.loadAsync("/tmp/safe\0/evil");

        expect(result.success).toBe(false);
        expect(result.error).toMatch(/null/i);
      });

      it("should still reject non-existent files", async () => {
        const tool = new LatticeTool({ skipCwdChecking: true });
        const result = await tool.loadAsync("/tmp/this-file-definitely-does-not-exist-12345.txt");

        expect(result.success).toBe(false);
        expect(result.error).toMatch(/cannot resolve|not found|no such/i);
      });

      it("should allow querying after loading outside-CWD file", async () => {
        const tool = new LatticeTool({ skipCwdChecking: true });
        await tool.loadAsync(outsideFile);

        const result = tool.execute({ type: "query", command: '(grep "ERROR")' });

        expect(result.success).toBe(true);
        expect(result.message).toContain("Found 1 result");
      });
    });

    describe("constructor default matches false", () => {
      it("should default to skipCwdChecking=false when no options given", async () => {
        const toolDefault = new LatticeTool();
        const toolExplicitFalse = new LatticeTool({ skipCwdChecking: false });

        const resultDefault = await toolDefault.loadAsync(outsideFile);
        const resultExplicit = await toolExplicitFalse.loadAsync(outsideFile);

        // Both should reject
        expect(resultDefault.success).toBe(false);
        expect(resultExplicit.success).toBe(false);
      });
    });
  });

  // =========================================================================
  // mcp-server.ts — validateFilePath via process.argv
  // =========================================================================
  describe("mcp-server validateFilePath (process.argv integration)", () => {
    afterEach(() => {
      vi.resetModules();
      // Clean up argv if we added the flag
      const idx = process.argv.indexOf("--dangerously-skip-cwd-checking");
      if (idx !== -1) {
        process.argv.splice(idx, 1);
      }
    });

    it("should reject outside-CWD path for nucleus_execute by default", async () => {
      vi.resetModules();
      const { createMCPServer } = await import("../src/mcp-server.js");
      const server = createMCPServer();

      const result = await server.callTool("nucleus_execute", {
        command: '(grep "test")',
        filePath: outsideFile,
      });

      expect(result.content[0].text).toMatch(/error.*path|not allowed/i);
    });

    it("should reject outside-CWD path for analyze_document by default", async () => {
      vi.resetModules();
      const { createMCPServer } = await import("../src/mcp-server.js");
      const server = createMCPServer();

      const result = await server.callTool("analyze_document", {
        query: "test",
        filePath: outsideFile,
      });

      expect(result.content[0].text).toMatch(/error.*path|not allowed/i);
    });

    it("should allow outside-CWD path when --dangerously-skip-cwd-checking is in argv", async () => {
      process.argv.push("--dangerously-skip-cwd-checking");
      vi.resetModules();
      const { createMCPServer } = await import("../src/mcp-server.js");
      const server = createMCPServer();

      const result = await server.callTool("nucleus_execute", {
        command: '(grep "line")',
        filePath: outsideFile,
      });

      // Should NOT contain path error — should succeed or fail for other reasons
      expect(result.content[0].text).not.toMatch(/path outside|not allowed/i);
      expect(result.content[0].text).toContain("results");
    });

    it("should still reject path traversal (..) when flag is NOT set", async () => {
      vi.resetModules();
      const { createMCPServer } = await import("../src/mcp-server.js");
      const server = createMCPServer();

      const result = await server.callTool("nucleus_execute", {
        command: '(grep "test")',
        filePath: "../../etc/passwd",
      });

      expect(result.content[0].text).toMatch(/error.*traversal|not allowed/i);
    });

    it("should allow path traversal (..) when flag IS set", async () => {
      process.argv.push("--dangerously-skip-cwd-checking");
      vi.resetModules();
      const { createMCPServer } = await import("../src/mcp-server.js");
      const server = createMCPServer();

      // ../../etc/passwd won't exist or will fail to load, but it should NOT
      // be rejected by the path validation itself
      const result = await server.callTool("nucleus_execute", {
        command: '(grep "test")',
        filePath: "../../etc/passwd",
      });

      // Should not be a path-validation error — it'll be a file-not-found or similar
      expect(result.content[0].text).not.toMatch(/traversal.*not allowed/i);
    });
  });

  // =========================================================================
  // lattice-mcp-server.ts — source-level verification
  // The handleToolCall function is not exported, so we verify the source
  // structure ensures the guard is properly conditional on skipCwdChecking.
  // =========================================================================
  describe("lattice-mcp-server source structure", () => {
    const serverSource = fs.readFileSync(
      path.resolve(__dirname, "../src/lattice-mcp-server.ts"),
      "utf-8"
    );

    it("should parse --dangerously-skip-cwd-checking from process.argv", () => {
      expect(serverSource).toContain('process.argv.includes("--dangerously-skip-cwd-checking")');
    });

    it("should wrap CWD check in skipCwdChecking conditional", () => {
      // The path validation block should be inside an if (!skipCwdChecking) guard
      expect(serverSource).toMatch(/if\s*\(\s*!skipCwdChecking\s*\)/);
    });

    it("should still contain the original path-outside-CWD error message", () => {
      // The error message should still exist (just conditionally reached)
      expect(serverSource).toContain("Path outside working directory is not allowed");
    });

    it("should still contain the path traversal error message", () => {
      expect(serverSource).toContain("Path traversal (..) is not allowed");
    });

    it("should log a warning when CWD checking is disabled", () => {
      expect(serverSource).toMatch(/WARNING.*CWD.*checking.*DISABLED|CWD.*path.*checking.*DISABLED/i);
    });
  });
});
