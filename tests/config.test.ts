import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { loadConfig } from "../src/config.js";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";

describe("Config", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "config-test-"));
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true });
  });

  describe("env var resolution", () => {
    it("should throw on missing env vars", async () => {
      const configPath = path.join(tempDir, "config.json");
      fs.writeFileSync(configPath, JSON.stringify({
        llm: { provider: "test" },
        providers: {
          test: { baseUrl: "${NONEXISTENT_VAR_FOR_TEST_12345}" }
        }
      }));

      await expect(loadConfig(configPath)).rejects.toThrow("NONEXISTENT_VAR_FOR_TEST_12345");
      await expect(loadConfig(configPath)).rejects.toThrow("not set");
    });

    it("should resolve existing env vars", async () => {
      const envKey = "TEST_CONFIG_VAR_" + Date.now();
      process.env[envKey] = "http://resolved-url";

      const configPath = path.join(tempDir, "config.json");
      fs.writeFileSync(configPath, JSON.stringify({
        llm: { provider: "test" },
        providers: {
          test: { baseUrl: `\${${envKey}}` }
        }
      }));

      const config = await loadConfig(configPath);
      expect(config.providers.test.baseUrl).toBe("http://resolved-url");

      delete process.env[envKey];
    });

    it("should pass through strings without env vars unchanged", async () => {
      const configPath = path.join(tempDir, "config.json");
      fs.writeFileSync(configPath, JSON.stringify({
        llm: { provider: "ollama" },
        providers: {
          ollama: { baseUrl: "http://localhost:11434" }
        }
      }));

      const config = await loadConfig(configPath);
      expect(config.providers.ollama.baseUrl).toBe("http://localhost:11434");
    });
  });

  describe("error handling", () => {
    it("should return defaults for missing config file", async () => {
      const config = await loadConfig(path.join(tempDir, "nonexistent.json"));
      expect(config.llm.provider).toBe("ollama");
    });

    it("should throw clear error for invalid JSON", async () => {
      const configPath = path.join(tempDir, "bad.json");
      fs.writeFileSync(configPath, "{invalid json}");

      await expect(loadConfig(configPath)).rejects.toThrow("Invalid JSON");
      await expect(loadConfig(configPath)).rejects.toThrow(configPath);
    });
  });

  describe("numeric env var coercion", () => {
    it("should coerce numeric string env vars to numbers", async () => {
      const originalEnv = process.env.TEST_NUM_CTX;
      process.env.TEST_NUM_CTX = "8192";

      try {
        const configPath = path.join(tempDir, "config.json");
        fs.writeFileSync(
          configPath,
          JSON.stringify({
            llm: { provider: "ollama" },
            providers: {
              ollama: {
                baseUrl: "http://localhost:11434",
                options: { num_ctx: "${TEST_NUM_CTX}" },
              },
            },
          })
        );

        const config = await loadConfig(configPath);
        expect(config.providers.ollama.options?.num_ctx).toBe(8192);
        expect(typeof config.providers.ollama.options?.num_ctx).toBe("number");
      } finally {
        if (originalEnv === undefined) {
          delete process.env.TEST_NUM_CTX;
        } else {
          process.env.TEST_NUM_CTX = originalEnv;
        }
      }
    });
  });
});
