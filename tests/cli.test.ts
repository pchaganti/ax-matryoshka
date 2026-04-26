import { describe, it, expect } from "vitest";
import { execSync } from "node:child_process";
import { resolve } from "node:path";
import { readFileSync } from "fs";

describe("CLI", () => {
  const cli = (args: string, options: { timeout?: number } = {}) => {
    const { timeout = 10000 } = options;
    try {
      return execSync(`npx tsx src/index.ts ${args}`, {
        cwd: resolve(import.meta.dirname, ".."),
        encoding: "utf-8",
        timeout,
      });
    } catch (e: unknown) {
      const error = e as { stdout?: string; stderr?: string; message?: string };
      return error.stdout || error.stderr || error.message || "";
    }
  };

  describe("argument parsing", () => {
    it("should show usage with --help", () => {
      const output = cli("--help");
      expect(output).toContain("Usage");
      expect(output).toContain("query");
      expect(output).toContain("file");
    });

    it("should require query and file arguments", () => {
      const output = cli("");
      expect(output).toMatch(/missing|required|usage/i);
    });

    it("should accept query and file positional args", () => {
      const output = cli('"test query" ./test-fixtures/small.txt --dry-run');
      expect(output).toContain("Query: test query");
      expect(output).toContain("File:");
      expect(output).toContain("small.txt");
    });
  });

  describe("options", () => {
    it("should accept --max-turns option", () => {
      const output = cli(
        '"query" ./test-fixtures/small.txt --max-turns 5 --dry-run'
      );
      expect(output).toContain("Max turns: 5");
    });

    // --timeout option removed: the underlying turnTimeoutMs was dead in
    // the RLM path (sandbox was created but never executed). Removed from
    // CLI, RLMOptions, and the MCP server input schema.

    it("should accept --model option", () => {
      const output = cli(
        '"query" ./test-fixtures/small.txt --model llama3 --dry-run'
      );
      expect(output).toContain("Model: llama3");
    });

    it("should accept --verbose flag", () => {
      const output = cli(
        '"query" ./test-fixtures/small.txt --verbose --dry-run'
      );
      expect(output).toContain("Verbose: true");
    });

    it("should accept --provider option", () => {
      const output = cli(
        '"query" ./test-fixtures/small.txt --provider deepseek --dry-run'
      );
      expect(output).toContain("Provider: deepseek");
    });
  });

  describe("file handling", () => {
    it("should error on non-existent file", () => {
      const output = cli('"query" ./nonexistent.txt --dry-run');
      expect(output).toMatch(/not found|no such file|ENOENT|does not exist/i);
    });

    it("should accept absolute paths", () => {
      const absPath = resolve(import.meta.dirname, "../test-fixtures/small.txt");
      const output = cli(`"query" "${absPath}" --dry-run`);
      expect(output).toContain(absPath);
    });
  });
});

// =====================================================================
// Source-pattern checks (from audits)
// =====================================================================
describe("Source-pattern checks (from audits)", () => {
  // from tests/audit33.test.ts #5 — CLI parseArgs should handle missing arg values
  describe("#5 — CLI parseArgs should handle missing arg values", () => {
      it("should not crash when --max-turns is last arg", () => {
        const source = readFileSync("src/index.ts", "utf-8");
        // Find the parseArgs function and check for bounds validation
        const parseArgsFn = source.match(/function parseArgs[\s\S]*?return options;\s*\}/);
        expect(parseArgsFn).not.toBeNull();
        // Should have bounds checking — either checking i < args.length
        // or handling undefined from args[++i]
        const body = parseArgsFn![0];
        // After fix, should validate that ++i doesn't exceed bounds
        // or handle NaN from parseInt of undefined
        expect(body).toMatch(/i\s*<\s*args\.length|i\s*\+\s*1\s*<\s*args\.length|args\[i\s*\+\s*1\]|isNaN/);
      });
    });

  // from tests/audit34.test.ts #14 — CLI should error on missing option values
  describe("#14 — CLI should error on missing option values", () => {
        it("should check bounds before reading next arg for string options", () => {
          const source = readFileSync("src/index.ts", "utf-8");
          // Should check i + 1 < args.length or similar
          const modelBlock = source.match(/--model[\s\S]*?options\.model/);
          expect(modelBlock).not.toBeNull();
          // After fix, should have bounds check
          expect(modelBlock![0]).toMatch(/i\s*\+\s*1\s*>=?\s*args\.length|args\[i\s*\+\s*1\]|throw|Error/);
        });
      });

});
