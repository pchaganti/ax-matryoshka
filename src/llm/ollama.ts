import type { LLMProvider, LLMConfig, ProviderConfig } from "./types.js";

const LLM_TIMEOUT_MS = 120_000; // 2 minutes

export function createOllamaProvider(config: ProviderConfig): LLMProvider {
  return {
    name: "ollama",

    async query(prompt: string, llmConfig: LLMConfig): Promise<string> {
      const requestBody: Record<string, unknown> = {
        model: llmConfig.model,
        prompt,
        stream: false,
        options: {
          temperature: llmConfig.options?.temperature ?? 0.2,
          num_ctx: llmConfig.options?.num_ctx ?? 8192,
        },
      };

      // Add JSON format if specified
      if (llmConfig.options?.format === "json") {
        requestBody.format = "json";
      }

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), LLM_TIMEOUT_MS);
      let response: Response;
      try {
        response = await fetch(`${config.baseUrl}/api/generate`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(requestBody),
          signal: controller.signal,
        });
      } finally {
        clearTimeout(timeoutId);
      }

      if (!response.ok) {
        let errorBody = "";
        try { errorBody = await response.text(); } catch { /* ignore */ }
        throw new Error(
          `Ollama error: ${response.status} ${response.statusText}${errorBody ? ` - ${errorBody.slice(0, 200)}` : ""}`
        );
      }

      let data: { response?: string };
      try {
        data = (await response.json()) as { response?: string };
      } catch {
        throw new Error("Ollama returned invalid JSON response");
      }
      if (!data.response) {
        throw new Error("Ollama returned empty response");
      }
      return data.response;
    },
  };
}
