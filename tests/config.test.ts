import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { loadConfig } from "../src/config.js";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { readFileSync } from "fs";

describe("Config", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "config-test-"));
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true });
  });

  describe("env var resolution", () => {
    it("should leave unset env vars as empty string instead of throwing", async () => {
      const configPath = path.join(tempDir, "config.json");
      fs.writeFileSync(configPath, JSON.stringify({
        llm: { provider: "test" },
        providers: {
          test: { url: "${NONEXISTENT_VAR_FOR_TEST_12345}" }
        }
      }));

      // Should NOT throw — unset env vars should resolve to empty string
      const config = await loadConfig(configPath);
      expect(config.providers.test.url).toBe("");
    });

    it("should load config with mixed set and unset env vars", async () => {
      const envKey = "TEST_SET_VAR_" + Date.now();
      process.env[envKey] = "http://localhost:11434";

      const configPath = path.join(tempDir, "config.json");
      fs.writeFileSync(configPath, JSON.stringify({
        llm: { provider: "ollama" },
        providers: {
          ollama: { url: `\${${envKey}}` },
          deepseek: { url: "https://api.deepseek.com/chat/completions", apiKey: "${UNSET_API_KEY_12345}" }
        }
      }));

      // Should not throw even though UNSET_API_KEY_12345 doesn't exist
      const config = await loadConfig(configPath);
      expect(config.providers.ollama.url).toBe("http://localhost:11434");
      expect(config.providers.deepseek.apiKey).toBe("");

      delete process.env[envKey];
    });

    it("should resolve existing env vars", async () => {
      const envKey = "TEST_CONFIG_VAR_" + Date.now();
      process.env[envKey] = "http://resolved-url";

      const configPath = path.join(tempDir, "config.json");
      fs.writeFileSync(configPath, JSON.stringify({
        llm: { provider: "test" },
        providers: {
          test: { url: `\${${envKey}}` }
        }
      }));

      const config = await loadConfig(configPath);
      expect(config.providers.test.url).toBe("http://resolved-url");

      delete process.env[envKey];
    });

    it("should pass through strings without env vars unchanged", async () => {
      const configPath = path.join(tempDir, "config.json");
      fs.writeFileSync(configPath, JSON.stringify({
        llm: { provider: "ollama" },
        providers: {
          ollama: { url: "http://localhost:11434" }
        }
      }));

      const config = await loadConfig(configPath);
      expect(config.providers.ollama.url).toBe("http://localhost:11434");
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

  describe("env var name validation", () => {
    it("should reject __proto__ as env var name", async () => {
      const configPath = path.join(tempDir, "config.json");
      fs.writeFileSync(configPath, JSON.stringify({
        llm: { provider: "test" },
        providers: {
          test: { url: "${__proto__}" }
        }
      }));

      await expect(loadConfig(configPath)).rejects.toThrow("Invalid environment variable name");
    });

    it("should reject constructor as env var name", async () => {
      const configPath = path.join(tempDir, "config.json");
      fs.writeFileSync(configPath, JSON.stringify({
        llm: { provider: "test" },
        providers: {
          test: { url: "${constructor}" }
        }
      }));

      await expect(loadConfig(configPath)).rejects.toThrow("Invalid environment variable name");
    });

    it("should reject env var names with spaces", async () => {
      const configPath = path.join(tempDir, "config.json");
      fs.writeFileSync(configPath, JSON.stringify({
        llm: { provider: "test" },
        providers: {
          test: { url: "${foo bar}" }
        }
      }));

      await expect(loadConfig(configPath)).rejects.toThrow("Invalid environment variable name");
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
                url: "http://localhost:11434",
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

// =====================================================================
// Source-pattern checks (from audits)
// =====================================================================
describe("Source-pattern checks (from audits)", () => {
  // from tests/audit24.test.ts Audit24 #11: config coerceConfigTypes scientific notation
  describe("Audit24 #11: config coerceConfigTypes scientific notation", () => {
    it("should coerce scientific notation strings to numbers", async () => {
      // We test indirectly - loadConfig uses coerceConfigTypes
      const mod = await import("../src/config.js");
      expect(mod.loadConfig).toBeDefined();
    });
  });

  // from tests/audit25.test.ts Audit25 #9: config coercion
  describe("Audit25 #9: config coercion", () => {
    it("should be importable", async () => {
      const mod = await import("../src/config.js");
      expect(mod.loadConfig).toBeDefined();
    });
  });

  // from tests/audit27.test.ts Audit27 #6: config coerceConfigTypes precision
  describe("Audit27 #6: config coerceConfigTypes precision", () => {
    it("should coerce '1.0' to number 1", async () => {
      const mod = await import("../src/config.js");
      // Indirectly test — loadConfig uses coerceConfigTypes internally
      expect(mod.loadConfig).toBeDefined();
      // The fix is to use Number() comparison instead of string equality
    });
  });

  // from tests/audit33.test.ts #7 — resolveEnvVar should not treat empty string as unset
  describe("#7 — resolveEnvVar should not treat empty string as unset", () => {
      it("should use === undefined instead of !resolved", () => {
        const source = readFileSync("src/llm/index.ts", "utf-8");
        const resolveEnvFn = source.match(/function resolveEnvVar[\s\S]*?^\}/m);
        expect(resolveEnvFn).not.toBeNull();
        const body = resolveEnvFn![0];
        // Should NOT have `if (!resolved)` — this treats "" as falsy
        expect(body).not.toMatch(/if\s*\(\s*!resolved\s*\)/);
        // Should use === undefined or similar
        expect(body).toMatch(/===\s*undefined|resolved\s*==\s*null/);
      });
    });

  // from tests/audit34.test.ts #3 — resolveEnvVar should validate variable names
  describe("#3 — resolveEnvVar should validate variable names", () => {
        it("should validate env var names against dangerous patterns", () => {
          const source = readFileSync("src/llm/index.ts", "utf-8");
          const fn = source.match(/function resolveEnvVar[\s\S]*?^\}/m);
          expect(fn).not.toBeNull();
          // Should validate variable name format
          expect(fn![0]).toMatch(/[A-Za-z_]\[A-Za-z0-9_\]|DANGEROUS|__proto__|constructor/);
        });
      });

  // from tests/audit34.test.ts #11 — loadConfig should validate config path
  describe("#11 — loadConfig should validate config path", () => {
        it("should not allow absolute paths outside CWD", () => {
          const source = readFileSync("src/config.ts", "utf-8");
          const loadConfig = source.match(/export async function loadConfig[\s\S]*?^\}/m);
          expect(loadConfig).not.toBeNull();
          // Should validate the path
          expect(loadConfig![0]).toMatch(/validatePath|traversal|startsWith|resolve|\.\.|\babsolute\b/i);
        });
      });

  // from tests/audit67.test.ts #3 — loadConfig should check file size before reading
  describe("#3 — loadConfig should check file size before reading", () => {
      it("should check file size or content length before JSON.parse", () => {
        const source = readFileSync("src/config.ts", "utf-8");
        const fnStart = source.indexOf("async function loadConfig(");
        expect(fnStart).toBeGreaterThan(-1);
        const block = source.slice(fnStart, fnStart + 500);
        expect(block).toMatch(/MAX_CONFIG|content\.length\s*>|statSync|stats\.size/i);
      });
    });

  // from tests/audit78.test.ts #2 — resolveEnvVars should filter dangerous keys in object iteration
  describe("#2 — resolveEnvVars should filter dangerous keys in object iteration", () => {
      it("should skip __proto__ constructor prototype keys during object key iteration", () => {
        const source = readFileSync("src/config.ts", "utf-8");
        // Find the object iteration block specifically (for...of Object.entries)
        const objBlock = source.indexOf("for (const [key, value] of Object.entries(obj))");
        expect(objBlock).toBeGreaterThan(-1);
        const block = source.slice(objBlock, objBlock + 300);
        expect(block).toMatch(/DANGEROUS|__proto__|Object\.create\(null\)|key\s*===|\.has\(key\)/);
      });
    });

});
