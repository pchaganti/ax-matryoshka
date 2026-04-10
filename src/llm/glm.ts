import type { LLMProvider, LLMConfig, ProviderConfig } from "./types.js";
import { fetchWithRetry } from "./retry.js";

interface ChatCompletionResponse {
  choices: Array<{
    message: {
      content: string;
    };
  }>;
}

export function createGLMProvider(config: ProviderConfig): LLMProvider {
  return {
    name: "glm",

    async query(prompt: string, llmConfig: LLMConfig): Promise<string> {
      if (!config.apiKey) {
        throw new Error("GLM API key not configured (set ZHIPU_API_KEY)");
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
          `GLM error: ${response.status} ${response.statusText}${errorBody ? ` - ${errorBody.slice(0, 200)}` : ""}`
        );
      }

      let data: ChatCompletionResponse;
      try {
        data = (await response.json()) as ChatCompletionResponse;
      } catch {
        throw new Error("GLM returned invalid JSON response");
      }
      if (!data.choices || data.choices.length === 0) {
        throw new Error("GLM returned empty response (no choices)");
      }
      const content = data.choices[0]?.message?.content;
      if (content === undefined || content === null) {
        throw new Error("GLM response missing message content");
      }
      return content;
    },
  };
}
