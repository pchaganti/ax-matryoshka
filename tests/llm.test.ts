import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  createLLMClient,
  createOllamaProvider,
  createDeepSeekProvider,
  getAvailableProviders,
  createTieredClients,
} from "../src/llm/index.js";
import { loadConfig } from "../src/config.js";

describe("LLM Provider System", () => {
  describe("Provider Registry", () => {
    it("should list available providers", () => {
      const providers = getAvailableProviders();
      expect(providers).toContain("ollama");
      expect(providers).toContain("deepseek");
    });

    it("should create Ollama client from config", () => {
      const query = createLLMClient(
        "ollama",
        { url: "http://localhost:11434" },
        { provider: "ollama", model: "qwen3-coder:30b" }
      );
      expect(typeof query).toBe("function");
    });

    it("should create DeepSeek client from config", () => {
      const query = createLLMClient(
        "deepseek",
        { url: "https://api.deepseek.com", apiKey: "test-key" },
        { provider: "deepseek", model: "deepseek-coder" }
      );
      expect(typeof query).toBe("function");
    });

    it("should throw for unknown provider", () => {
      expect(() =>
        createLLMClient(
          "unknown-provider",
          { url: "http://localhost" },
          { provider: "unknown", model: "test" }
        )
      ).toThrow(/unknown.*provider/i);
    });

    it("should resolve environment variables in apiKey", () => {
      process.env.TEST_API_KEY = "resolved-key";

      const query = createLLMClient(
        "deepseek",
        { url: "https://api.deepseek.com", apiKey: "${TEST_API_KEY}" },
        { provider: "deepseek", model: "deepseek-coder" }
      );
      expect(typeof query).toBe("function");

      delete process.env.TEST_API_KEY;
    });

    it("should throw when env var not set", () => {
      delete process.env.MISSING_KEY;

      expect(() =>
        createLLMClient(
          "deepseek",
          { url: "https://api.deepseek.com", apiKey: "${MISSING_KEY}" },
          { provider: "deepseek", model: "deepseek-coder" }
        )
      ).toThrow(/environment variable.*not set/i);
    });

    it("should resolve embedded env vars like 'Bearer ${TOKEN}'", () => {
      process.env.TEST_EMBEDDED_TOKEN = "my-secret-token";

      const query = createLLMClient(
        "deepseek",
        { url: "https://api.deepseek.com", apiKey: "Bearer ${TEST_EMBEDDED_TOKEN}" },
        { provider: "deepseek", model: "deepseek-coder" }
      );
      expect(typeof query).toBe("function");

      delete process.env.TEST_EMBEDDED_TOKEN;
    });

    it("should pass through strings without ${} unchanged", () => {
      const query = createLLMClient(
        "deepseek",
        { url: "https://api.deepseek.com", apiKey: "plain-api-key" },
        { provider: "deepseek", model: "deepseek-coder" }
      );
      expect(typeof query).toBe("function");
    });
  });

  describe("Ollama Provider", () => {
    let fetchSpy: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
      fetchSpy = vi.spyOn(global, "fetch");
    });

    afterEach(() => {
      fetchSpy.mockRestore();
    });

    it("should format request correctly", async () => {
      fetchSpy.mockResolvedValue({
        ok: true,
        json: async () => ({ response: "test response" }),
      } as Response);

      const provider = createOllamaProvider({
        url: "http://localhost:11434/api/generate",
      });
      const result = await provider.query("test prompt", {
        provider: "ollama",
        model: "qwen3-coder:30b",
      });

      expect(fetchSpy).toHaveBeenCalledWith(
        "http://localhost:11434/api/generate",
        expect.objectContaining({
          method: "POST",
          body: expect.stringContaining('"model":"qwen3-coder:30b"'),
        })
      );
      expect(result).toBe("test response");
    });

    it("should include prompt in request body", async () => {
      fetchSpy.mockResolvedValue({
        ok: true,
        json: async () => ({ response: "response" }),
      } as Response);

      const provider = createOllamaProvider({
        url: "http://localhost:11434/api/generate",
      });
      await provider.query("my test prompt", {
        provider: "ollama",
        model: "test",
      });

      expect(fetchSpy).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          body: expect.stringContaining('"prompt":"my test prompt"'),
        })
      );
    });

    it("should handle errors", async () => {
      fetchSpy.mockResolvedValue({
        ok: false,
        status: 500,
        statusText: "Internal Server Error",
      } as Response);

      const provider = createOllamaProvider({
        url: "http://localhost:11434/api/generate",
      });

      await expect(
        provider.query("test", { provider: "ollama", model: "test" })
      ).rejects.toThrow(/ollama error.*500/i);
    });
  });

  describe("DeepSeek Provider", () => {
    let fetchSpy: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
      fetchSpy = vi.spyOn(global, "fetch");
    });

    afterEach(() => {
      fetchSpy.mockRestore();
    });

    it("should use chat completions API format", async () => {
      fetchSpy.mockResolvedValue({
        ok: true,
        json: async () => ({ choices: [{ message: { content: "response" } }] }),
      } as Response);

      const provider = createDeepSeekProvider({
        url: "https://api.deepseek.com/chat/completions",
        apiKey: "test-key",
      });
      const result = await provider.query("test", {
        provider: "deepseek",
        model: "deepseek-coder",
      });

      expect(fetchSpy).toHaveBeenCalledWith(
        "https://api.deepseek.com/chat/completions",
        expect.objectContaining({
          headers: expect.objectContaining({
            Authorization: "Bearer test-key",
          }),
          body: expect.stringContaining('"messages"'),
        })
      );
      expect(result).toBe("response");
    });

    it("should throw if apiKey not provided", async () => {
      const provider = createDeepSeekProvider({
        url: "https://api.deepseek.com/chat/completions",
      });

      await expect(
        provider.query("test", { provider: "deepseek", model: "test" })
      ).rejects.toThrow(/api key not configured/i);
    });
  });

  describe("Malformed response handling", () => {
    let fetchSpy: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
      fetchSpy = vi.spyOn(global, "fetch");
    });

    afterEach(() => {
      fetchSpy.mockRestore();
    });

    it("should throw descriptive error when DeepSeek returns invalid JSON", async () => {
      fetchSpy.mockResolvedValue({
        ok: true,
        json: async () => { throw new SyntaxError("Unexpected token"); },
      } as unknown as Response);

      const provider = createDeepSeekProvider({
        url: "https://api.deepseek.com/chat/completions",
        apiKey: "test-key",
      });

      await expect(
        provider.query("test", { provider: "deepseek", model: "test" })
      ).rejects.toThrow(/invalid JSON/i);
    });

    it("should throw when DeepSeek choices[0].message.content is missing", async () => {
      fetchSpy.mockResolvedValue({
        ok: true,
        json: async () => ({ choices: [{ message: {} }] }),
      } as unknown as Response);

      const provider = createDeepSeekProvider({
        url: "https://api.deepseek.com/chat/completions",
        apiKey: "test-key",
      });

      await expect(
        provider.query("test", { provider: "deepseek", model: "test" })
      ).rejects.toThrow(/missing message content/i);
    });

    it("should throw descriptive error when Ollama returns invalid JSON", async () => {
      fetchSpy.mockResolvedValue({
        ok: true,
        json: async () => { throw new SyntaxError("Unexpected token"); },
      } as unknown as Response);

      const provider = createOllamaProvider({
        url: "http://localhost:11434/api/generate",
      });

      await expect(
        provider.query("test", { provider: "ollama", model: "test" })
      ).rejects.toThrow(/invalid JSON/i);
    });

    it("should include response body text in DeepSeek HTTP error", async () => {
      fetchSpy.mockResolvedValue({
        ok: false,
        status: 429,
        statusText: "Too Many Requests",
        text: async () => '{"error":"rate_limit_exceeded"}',
      } as unknown as Response);

      const provider = createDeepSeekProvider({
        url: "https://api.deepseek.com/chat/completions",
        apiKey: "test-key",
      });

      await expect(
        provider.query("test", { provider: "deepseek", model: "test" })
      ).rejects.toThrow(/rate_limit_exceeded/);
    });

    it("should include response body text in Ollama HTTP error", async () => {
      fetchSpy.mockResolvedValue({
        ok: false,
        status: 500,
        statusText: "Internal Server Error",
        text: async () => "model not found",
      } as unknown as Response);

      const provider = createOllamaProvider({
        url: "http://localhost:11434/api/generate",
      });

      await expect(
        provider.query("test", { provider: "ollama", model: "test" })
      ).rejects.toThrow(/model not found/);
    });
  });

  describe("JSON Format Mode", () => {
    let fetchSpy: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
      fetchSpy = vi.spyOn(global, "fetch");
    });

    afterEach(() => {
      fetchSpy.mockRestore();
    });

    it("should pass format: json to Ollama provider", async () => {
      fetchSpy.mockResolvedValue({
        ok: true,
        json: async () => ({ response: '{"key": "value"}' }),
      } as Response);

      const provider = createOllamaProvider({
        url: "http://localhost:11434/api/generate",
      });
      await provider.query("test", {
        provider: "ollama",
        model: "test",
        options: { format: "json" },
      });

      expect(fetchSpy).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          body: expect.stringContaining('"format":"json"'),
        })
      );
    });

    it("should pass response_format to DeepSeek provider", async () => {
      fetchSpy.mockResolvedValue({
        ok: true,
        json: async () => ({ choices: [{ message: { content: '{"key": "value"}' } }] }),
      } as Response);

      const provider = createDeepSeekProvider({
        url: "https://api.deepseek.com/chat/completions",
        apiKey: "test-key",
      });
      await provider.query("test", {
        provider: "deepseek",
        model: "test",
        options: { format: "json" },
      });

      expect(fetchSpy).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          body: expect.stringContaining('"response_format"'),
        })
      );
    });

    it("should not include format when not specified", async () => {
      fetchSpy.mockResolvedValue({
        ok: true,
        json: async () => ({ response: "test" }),
      } as Response);

      const provider = createOllamaProvider({
        url: "http://localhost:11434/api/generate",
      });
      await provider.query("test", {
        provider: "ollama",
        model: "test",
      });

      const callBody = fetchSpy.mock.calls[0][1]?.body as string;
      expect(callBody).not.toContain('"format"');
    });
  });

  describe("Fetch Timeout", () => {
    let fetchSpy: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
      fetchSpy = vi.spyOn(global, "fetch");
    });

    afterEach(() => {
      fetchSpy.mockRestore();
    });

    it("should pass AbortController signal to Ollama fetch", async () => {
      fetchSpy.mockResolvedValue({
        ok: true,
        json: async () => ({ response: "test response" }),
      } as Response);

      const provider = createOllamaProvider({
        url: "http://localhost:11434/api/generate",
      });
      await provider.query("test", { provider: "ollama", model: "test" });

      // Verify signal was passed
      const fetchOptions = fetchSpy.mock.calls[0][1] as RequestInit;
      expect(fetchOptions.signal).toBeInstanceOf(AbortSignal);
    });

    it("should pass AbortController signal to DeepSeek fetch", async () => {
      fetchSpy.mockResolvedValue({
        ok: true,
        json: async () => ({ choices: [{ message: { content: "response" } }] }),
      } as Response);

      const provider = createDeepSeekProvider({
        url: "https://api.deepseek.com/chat/completions",
        apiKey: "test-key",
      });
      await provider.query("test", { provider: "deepseek", model: "test" });

      // Verify signal was passed
      const fetchOptions = fetchSpy.mock.calls[0][1] as RequestInit;
      expect(fetchOptions.signal).toBeInstanceOf(AbortSignal);
    });
  });

  describe("Config Options", () => {
    let fetchSpy: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
      fetchSpy = vi.spyOn(global, "fetch");
    });

    afterEach(() => {
      fetchSpy.mockRestore();
    });

    it("should pass temperature to provider", async () => {
      fetchSpy.mockResolvedValue({
        ok: true,
        json: async () => ({ response: "test" }),
      } as Response);

      const provider = createOllamaProvider({
        url: "http://localhost:11434/api/generate",
      });
      await provider.query("test", {
        provider: "ollama",
        model: "test",
        options: { temperature: 0.7 },
      });

      expect(fetchSpy).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          body: expect.stringContaining('"temperature":0.7'),
        })
      );
    });

    it("should use default temperature when not specified", async () => {
      fetchSpy.mockResolvedValue({
        ok: true,
        json: async () => ({ response: "test" }),
      } as Response);

      const provider = createOllamaProvider({
        url: "http://localhost:11434/api/generate",
      });
      await provider.query("test", { provider: "ollama", model: "test" });

      expect(fetchSpy).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          body: expect.stringContaining('"temperature":0.2'),
        })
      );
    });

    it("should pass num_ctx to Ollama", async () => {
      fetchSpy.mockResolvedValue({
        ok: true,
        json: async () => ({ response: "test" }),
      } as Response);

      const provider = createOllamaProvider({
        url: "http://localhost:11434/api/generate",
      });
      await provider.query("test", {
        provider: "ollama",
        model: "test",
        options: { num_ctx: 16384 },
      });

      expect(fetchSpy).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          body: expect.stringContaining('"num_ctx":16384'),
        })
      );
    });

  });

  describe("Model Tiering", () => {
    it("should support tiered provider config", async () => {
      const config = await loadConfig("./config.json");

      // Tiered config should have providers.large and providers.small
      // or fall back to single provider
      expect(config.llm).toBeDefined();
      expect(config.providers).toBeDefined();
    });

    it("should create separate clients for orchestrator and worker", () => {
      // Create orchestrator client (large model)
      const orchestratorClient = createLLMClient(
        "deepseek",
        { url: "https://api.deepseek.com", apiKey: "test-key" },
        { model: "deepseek-chat" }
      );

      // Create worker client (small model)
      const workerClient = createLLMClient(
        "ollama",
        { url: "http://localhost:11434" },
        { model: "qwen3-coder:7b" }
      );

      expect(typeof orchestratorClient).toBe("function");
      expect(typeof workerClient).toBe("function");
    });

    it("should allow config to specify tiered providers", async () => {
      // This test documents the expected config format
      const tieredConfig = {
        llm: {
          provider: "tiered",
          large: "deepseek",
          small: "ollama",
        },
        providers: {
          deepseek: {
            url: "https://api.deepseek.com/chat/completions",
            apiKey: "test",
            model: "deepseek-chat",
          },
          ollama: {
            url: "http://localhost:11434/api/generate",
            model: "qwen3-coder:7b",
          },
        },
      };

      expect(tieredConfig.llm.large).toBe("deepseek");
      expect(tieredConfig.llm.small).toBe("ollama");
    });

    it("should create tiered clients from config with createTieredClients", () => {
      const config = {
        llm: {
          provider: "tiered",
          large: "deepseek",
          small: "ollama",
        },
        providers: {
          deepseek: {
            url: "https://api.deepseek.com/chat/completions",
            apiKey: "test-key",
            model: "deepseek-chat",
          },
          ollama: {
            url: "http://localhost:11434/api/generate",
            model: "qwen3-coder:7b",
          },
        },
      };

      const { orchestrator, worker } = createTieredClients(config as any);

      expect(typeof orchestrator).toBe("function");
      expect(typeof worker).toBe("function");
    });

    it("should fall back to single provider when not tiered", () => {
      const config = {
        llm: {
          provider: "ollama",
        },
        providers: {
          ollama: {
            url: "http://localhost:11434/api/generate",
            model: "qwen3-coder:30b",
          },
        },
      };

      const { orchestrator, worker } = createTieredClients(config as any);

      // Both should use the same provider when not tiered
      expect(typeof orchestrator).toBe("function");
      expect(typeof worker).toBe("function");
    });
  });
});

describe("Config Loader", () => {
  it("should load config from file", async () => {
    const config = await loadConfig("./config.json");

    expect(config.llm).toBeDefined();
    expect(config.providers).toBeDefined();
    expect(config.rlm).toBeDefined();
  });

  it("should have correct default values when config missing", async () => {
    // Test defaults by loading a nonexistent config
    const config = await loadConfig("./nonexistent-config.json");

    // Check default structure, not user-configurable values
    expect(config.llm.provider).toBe("ollama");
    expect(config.providers.ollama).toBeDefined();
    expect(config.providers.ollama.url).toBe("http://localhost:11434/api/generate");
    expect(config.providers.ollama.model).toBe("qwen3-coder:30b");
    expect(config.rlm.maxTurns).toBe(10);
  });

  it("should load user config when present", async () => {
    const config = await loadConfig("./config.json");

    // Just check structure exists, not specific user values
    expect(config.llm).toBeDefined();
    expect(config.llm.provider).toBeDefined();
    expect(config.providers).toBeDefined();
    expect(config.rlm).toBeDefined();
  });

  it("should have providers configured", async () => {
    const config = await loadConfig("./config.json");

    expect(config.providers.ollama).toBeDefined();
    expect(config.providers.ollama.url).toBeDefined();
  });
});
