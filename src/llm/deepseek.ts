import type { LLMProvider, LLMConfig, ProviderConfig } from "./types.js";

interface ChatCompletionResponse {
  choices: Array<{
    message: {
      content: string;
    };
  }>;
}

const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 1000;

async function fetchWithRetry(
  url: string,
  options: RequestInit,
  retries = MAX_RETRIES
): Promise<Response> {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const response = await fetch(url, options);
      return response;
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : String(error);
      if (attempt === retries) {
        console.error(`Final fetch attempt failed: ${errMsg}`);
        console.error(`URL: ${url}`);
        throw error;
      }
      console.error(
        `Fetch attempt ${attempt}/${retries} failed (${errMsg}), retrying in ${RETRY_DELAY_MS}ms...`
      );
      await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY_MS));
    }
  }
  throw new Error("Unreachable");
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
        throw new Error(
          `DeepSeek error: ${response.status} ${response.statusText}`
        );
      }

      const data = (await response.json()) as ChatCompletionResponse;
      if (!data.choices || data.choices.length === 0) {
        throw new Error("DeepSeek returned empty response (no choices)");
      }
      return data.choices[0].message.content;
    },
  };
}
