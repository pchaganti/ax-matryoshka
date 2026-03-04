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
const LLM_TIMEOUT_MS = 120_000; // 2 minutes

async function fetchWithRetry(
  url: string,
  options: RequestInit,
  retries = MAX_RETRIES
): Promise<Response> {
  for (let attempt = 1; attempt <= retries; attempt++) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), LLM_TIMEOUT_MS);
    try {
      const response = await fetch(url, { ...options, signal: controller.signal });
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
    } finally {
      clearTimeout(timeoutId);
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
