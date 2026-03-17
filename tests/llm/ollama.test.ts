/**
 * Tests for Ollama provider retry behavior.
 *
 * Validates that the Ollama provider retries on transient failures
 * using the shared fetchWithRetry utility.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createOllamaProvider } from "../../src/llm/ollama.js";

describe("Ollama provider", () => {
  let originalFetch: typeof globalThis.fetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
    vi.useFakeTimers({ shouldAdvanceTime: true });
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.useRealTimers();
  });

  it("should retry on transient network failure", async () => {
    const successResponse = new Response(
      JSON.stringify({ response: "Hello world" }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );

    globalThis.fetch = vi.fn()
      .mockRejectedValueOnce(new Error("ECONNREFUSED"))
      .mockResolvedValue(successResponse);

    const provider = createOllamaProvider({
      baseUrl: "http://localhost:11434",
    });

    const result = await provider.query("test prompt", {
      provider: "ollama",
      model: "test-model",
      options: { temperature: 0.2 },
    });

    expect(result).toBe("Hello world");
    expect(globalThis.fetch).toHaveBeenCalledTimes(2);
  });

  it("should throw after exhausting retries", async () => {
    globalThis.fetch = vi.fn().mockRejectedValue(new Error("ECONNREFUSED"));

    const provider = createOllamaProvider({
      baseUrl: "http://localhost:11434",
    });

    await expect(
      provider.query("test prompt", {
        provider: "ollama",
        model: "test-model",
        options: { temperature: 0.2 },
      })
    ).rejects.toThrow("ECONNREFUSED");

    // Should have retried 3 times
    expect(globalThis.fetch).toHaveBeenCalledTimes(3);
  });
});
