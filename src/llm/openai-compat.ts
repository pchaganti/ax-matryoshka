import type { LLMProvider, LLMConfig, ProviderConfig } from "./types.js";
import { fetchWithRetry } from "./retry.js";

interface ChatCompletionResponse {
  choices: Array<{
    message: {
      content: string;
    };
  }>;
}

interface OpenAICompatOptions {
  name: string;
  requireApiKey?: boolean;
  apiKeyEnvVar?: string;
}

export function createOpenAICompatProvider(
  config: ProviderConfig,
  opts: OpenAICompatOptions
): LLMProvider {
  return {
    name: opts.name,

    async query(prompt: string, llmConfig: LLMConfig): Promise<string> {
      if (opts.requireApiKey && !config.apiKey) {
        const hint = opts.apiKeyEnvVar
          ? ` (set ${opts.apiKeyEnvVar})`
          : "";
        throw new Error(`${opts.name} API key not configured${hint}`);
      }

      const requestBody: Record<string, unknown> = {
        model: llmConfig.model,
        messages: [{ role: "user", content: prompt }],
        temperature: llmConfig.options?.temperature ?? 0.2,
        max_tokens: llmConfig.options?.max_tokens ?? 4096,
      };

      if (llmConfig.options?.format === "json") {
        requestBody.response_format = { type: "json_object" };
      }

      const headers: Record<string, string> = {
        "Content-Type": "application/json",
      };
      if (config.apiKey) {
        headers.Authorization = `Bearer ${config.apiKey}`;
      }

      const response = await fetchWithRetry(config.url, {
        method: "POST",
        headers,
        body: JSON.stringify(requestBody),
      });

      if (!response.ok) {
        let errorBody = "";
        try { errorBody = await response.text(); } catch { /* ignore */ }
        throw new Error(
          `${opts.name} error: ${response.status} ${response.statusText}${errorBody ? ` - ${errorBody.slice(0, 200)}` : ""}`
        );
      }

      let data: ChatCompletionResponse;
      try {
        data = (await response.json()) as ChatCompletionResponse;
      } catch {
        throw new Error(`${opts.name} returned invalid JSON response`);
      }
      if (!data.choices || data.choices.length === 0) {
        throw new Error(`${opts.name} returned empty response (no choices)`);
      }
      const content = data.choices[0]?.message?.content;
      if (content === undefined || content === null) {
        throw new Error(`${opts.name} response missing message content`);
      }
      return content;
    },
  };
}
