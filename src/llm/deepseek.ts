import type { ProviderConfig, LLMProvider } from "./types.js";
import { createOpenAICompatProvider } from "./openai-compat.js";

export function createDeepSeekProvider(config: ProviderConfig): LLMProvider {
  return createOpenAICompatProvider(config, {
    name: "deepseek",
    requireApiKey: true,
  });
}
