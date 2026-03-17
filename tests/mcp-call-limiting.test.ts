/**
 * Tests for call-limiting guidance in MCP tool descriptions.
 *
 * Validates that tool descriptions include guidance to prevent
 * LLM tool-calling loops and encourage efficient query patterns.
 */
import { describe, it, expect } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";

// Read the source file directly to extract TOOLS array descriptions
const serverPath = path.resolve(__dirname, "../src/lattice-mcp-server.ts");
const serverSource = fs.readFileSync(serverPath, "utf-8");

describe("MCP tool call-limiting guidance", () => {
  describe("lattice_query tool", () => {
    it("should include guidance to chain operations", () => {
      // The lattice_query description should tell agents to chain queries
      expect(serverSource).toMatch(
        /lattice_query[\s\S]*?description[\s\S]*?chain.*quer/i
      );
    });

    it("should include a maximum calls guideline", () => {
      // Should tell agents to limit the number of separate tool calls
      expect(serverSource).toMatch(
        /lattice_query[\s\S]*?description[\s\S]*?(minimize|limit|avoid|reduce)\s+(the\s+number\s+of\s+)?(separate\s+)?(tool\s+)?call/i
      );
    });
  });

  describe("lattice_load tool", () => {
    it("should recommend checking file size before loading", () => {
      expect(serverSource).toMatch(
        /lattice_load[\s\S]*?description[\s\S]*?(small|<\s*300|Read\s+directly)/i
      );
    });
  });

  describe("lattice_expand tool", () => {
    it("should recommend starting with a small limit", () => {
      expect(serverSource).toMatch(
        /lattice_expand[\s\S]*?description[\s\S]*?small\s+limit/i
      );
    });

    it("should discourage expanding without limit on large results", () => {
      expect(serverSource).toMatch(
        /lattice_expand[\s\S]*?description[\s\S]*?(avoid expanding|use.*limit|start with.*limit|preview)/i
      );
    });
  });
});
