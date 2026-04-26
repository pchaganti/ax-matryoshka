/** Security: security/path-safety — migrated from audit rounds 13, 14, 37. */
import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";

describe("Security: security/path-safety", () => {
  // from audit#13
  describe("Issue #14: lattice-tool path traversal check", () => {
    it("should reject path with .. traversal", async () => {
      const { LatticeTool } = await import("../../src/tool/lattice-tool.js");
      const tool = new LatticeTool();

      // Path with ../ traversal
      const result = await tool.executeAsync({ type: "load", filePath: "/tmp/../etc/passwd" });
      expect(result.success).toBe(false);
      expect(result.error).toMatch(/traversal|outside working directory/i);
    });
  });

  // from audit#14
  describe("Issue #13: lattice-tool should use path.basename", () => {
    it("should use path.basename not manual string split", async () => {
      const fs = await import("node:fs/promises");
      const source = await fs.readFile("src/tool/lattice-tool.ts", "utf-8");

      // Should use path.basename, not .split("/").pop()
      expect(source).not.toContain('.split("/").pop()');
      expect(source).toContain("path.basename");
    });
  });

  // from audit#37
  describe("#1 — lattice-tool should use realpath to prevent symlink bypass", () => {
    it("should use realpathSync or realpath in loadAsync", () => {
      const source = readFileSync("src/tool/lattice-tool.ts", "utf-8");
      const loadAsync = source.match(/async loadAsync[\s\S]*?loadFile/);
      expect(loadAsync).not.toBeNull();
      // Should use realpath to dereference symlinks before checking path
      expect(loadAsync![0]).toMatch(/realpath/i);
    });
  });

});
