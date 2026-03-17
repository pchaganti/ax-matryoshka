/**
 * Tests for AI SDK tool definitions.
 *
 * Validates that the ai-tools module exports typed tool definitions
 * that can be used programmatically with any AI SDK.
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import {
  createLatticeTools,
  type LatticeToolSet,
} from "../../src/tool/ai-tools.js";

describe("AI SDK tool definitions", () => {
  let tools: LatticeToolSet;
  let tempDir: string;
  let testFile: string;

  const testContent = Array.from({ length: 50 }, (_, i) =>
    `2024-01-15 ${String(i).padStart(4, "0")} LOG: Entry ${i} value=${i * 10}`
  ).join("\n");

  beforeEach(() => {
    tools = createLatticeTools();
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "ai-tools-test-"));
    testFile = path.join(tempDir, "test.log");
    fs.writeFileSync(testFile, testContent);
  });

  afterEach(async () => {
    await tools.close.execute({});
    fs.rmSync(tempDir, { recursive: true });
  });

  describe("createLatticeTools", () => {
    it("should return a tool set with all required tools", () => {
      expect(tools.load).toBeDefined();
      expect(tools.query).toBeDefined();
      expect(tools.expand).toBeDefined();
      expect(tools.close).toBeDefined();
      expect(tools.status).toBeDefined();
      expect(tools.bindings).toBeDefined();
    });

    it("should expose tool definitions with name, description, and parameters", () => {
      expect(tools.load.name).toBe("lattice_load");
      expect(tools.load.description).toBeTruthy();
      expect(tools.load.parameters).toBeDefined();
      expect(tools.load.parameters.properties.filePath).toBeDefined();

      expect(tools.query.name).toBe("lattice_query");
      expect(tools.query.parameters.properties.command).toBeDefined();

      expect(tools.expand.name).toBe("lattice_expand");
      expect(tools.expand.parameters.properties.handle).toBeDefined();
    });
  });

  describe("tool execution", () => {
    it("should load a document via execute", async () => {
      const result = await tools.load.execute({ filePath: testFile });

      expect(result.success).toBe(true);
      expect(result.message).toContain("50");
    });

    it("should query a loaded document", async () => {
      await tools.load.execute({ filePath: testFile });
      const result = await tools.query.execute({ command: '(grep "LOG")' });

      expect(result.success).toBe(true);
      expect(result.handle).toBeDefined();
      expect(result.stub).toContain("Array(50)");
    });

    it("should expand a handle", async () => {
      await tools.load.execute({ filePath: testFile });
      const queryResult = await tools.query.execute({ command: '(grep "LOG")' });
      const expandResult = await tools.expand.execute({
        handle: queryResult.handle!,
        limit: 5,
      });

      expect(expandResult.success).toBe(true);
      expect(expandResult.data).toHaveLength(5);
      expect(expandResult.total).toBe(50);
    });

    it("should return bindings", async () => {
      await tools.load.execute({ filePath: testFile });
      await tools.query.execute({ command: '(grep "LOG")' });
      const result = await tools.bindings.execute({});

      expect(result.success).toBe(true);
      expect(result.data).toBeDefined();
      expect(result.data!["$res1"]).toBeDefined();
    });

    it("should return status", async () => {
      await tools.load.execute({ filePath: testFile });
      const result = await tools.status.execute({});

      expect(result.success).toBe(true);
      expect(result.data).toBeDefined();
      expect(result.data!.documentPath).toBe(testFile);
    });

    it("should support full workflow: load -> query -> filter -> count -> expand", async () => {
      await tools.load.execute({ filePath: testFile });

      // Search
      const grep = await tools.query.execute({ command: '(grep "LOG")' });
      expect(grep.success).toBe(true);

      // Filter
      const filter = await tools.query.execute({
        command: '(filter RESULTS (lambda x (match x "value=100" 0)))',
      });
      expect(filter.success).toBe(true);

      // Count
      const count = await tools.query.execute({ command: "(count RESULTS)" });
      expect(count.success).toBe(true);
      expect(count.value).toBe(1);

      // Expand
      const expanded = await tools.expand.execute({
        handle: filter.handle!,
      });
      expect(expanded.success).toBe(true);
      expect(expanded.data!.length).toBe(1);
    });
  });

  describe("getToolDefinitions", () => {
    it("should return an array of tool definitions for SDK integration", () => {
      const defs = tools.getToolDefinitions();

      expect(Array.isArray(defs)).toBe(true);
      expect(defs.length).toBeGreaterThanOrEqual(4);

      for (const def of defs) {
        expect(def.name).toBeTruthy();
        expect(def.description).toBeTruthy();
        expect(def.parameters).toBeDefined();
        expect(typeof def.execute).toBe("function");
      }
    });
  });
});
