import type { LLMProvider, LLMConfig, ProviderConfig } from "./types.js";
import { fetchWithRetry } from "./retry.js";

interface ChatCompletionResponse {
  choices: Array<{
    message: {
      content: string;
    };
  }>;
}

export function createDeepSeekProvider(config: ProviderConfig): LLMProvider {
  return {
    name: "deepseek",

    async query(prompt: string, llmConfig: LLMConfig): Promise<string> {
      if (!config.apiKey) {
        throw new Error("DeepSeek API key not configured");
      }

      const requestBody: Record<string, unknown> = {
        model: llmConfig.model,
        messages: [{ role: "user", content: prompt }],
        temperature: llmConfig.options?.temperature ?? 0.2,
        max_tokens: llmConfig.options?.max_tokens ?? 4096,
      };

      // Add JSON format if specified (OpenAI-compatible API)
      if (llmConfig.options?.format === "json") {
        requestBody.response_format = { type: "json_object" };
      }

      const response = await fetchWithRetry(
        `${config.baseUrl}/chat/completions`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${config.apiKey}`,
          },
          body: JSON.stringify(requestBody),
        }
      );

      if (!response.ok) {
        let errorBody = "";
        try { errorBody = await response.text(); } catch { /* ignore */ }
        throw new Error(
          `DeepSeek error: ${response.status} ${response.statusText}${errorBody ? ` - ${errorBody.slice(0, 200)}` : ""}`
        );
      }

      let data: ChatCompletionResponse;
      try {
        data = (await response.json()) as ChatCompletionResponse;
      } catch {
        throw new Error("DeepSeek returned invalid JSON response");
      }
      if (!data.choices || data.choices.length === 0) {
        throw new Error("DeepSeek returned empty response (no choices)");
      }
      const content = data.choices[0]?.message?.content;
      if (content === undefined || content === null) {
        throw new Error("DeepSeek response missing message content");
      }
      return content;
    },
  };
}
