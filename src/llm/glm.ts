import type { ProviderConfig, LLMProvider } from "./types.js";
import { createOpenAICompatProvider } from "./openai-compat.js";

export function createGLMProvider(config: ProviderConfig): LLMProvider {
  return createOpenAICompatProvider(config, {
    name: "GLM",
    requireApiKey: true,
    apiKeyEnvVar: "ZHIPU_API_KEY",
  });
}
