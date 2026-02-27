import type { LLMProvider, LLMConfig, ProviderConfig, LLMQueryFn, LLMQueryOptions } from "./types.js";
import { createOllamaProvider } from "./ollama.js";
import { createDeepSeekProvider } from "./deepseek.js";

export type { LLMProvider, LLMConfig, ProviderConfig, LLMQueryFn, LLMQueryOptions } from "./types.js";

type ProviderFactory = (config: ProviderConfig) => LLMProvider;

const providerFactories: Record<string, ProviderFactory> = {
  ollama: createOllamaProvider,
  deepseek: createDeepSeekProvider,
};

/**
 * Register a custom LLM provider
 */
export function registerProvider(name: string, factory: ProviderFactory): void {
  providerFactories[name] = factory;
}

/**
 * Get list of available provider names
 */
export function getAvailableProviders(): string[] {
  return Object.keys(providerFactories);
}

/**
 * Resolve environment variables in a string
 * e.g., "${API_KEY}" -> actual value from process.env.API_KEY
 */
function resolveEnvVar(value: string | undefined): string | undefined {
  if (!value) return value;

  return value.replace(/\$\{([^}]+)\}/g, (_, varName) => {
    // Validate variable name format
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(varName)) {
      throw new Error(`Invalid environment variable name: ${varName}`);
    }
    const DANGEROUS_VAR_NAMES = ["__proto__", "constructor", "prototype"];
    if (DANGEROUS_VAR_NAMES.includes(varName)) {
      throw new Error(`Dangerous environment variable name: ${varName}`);
    }
    const resolved = process.env[varName];
    if (resolved === undefined) {
      throw new Error(
        `Environment variable ${varName} not set`
      );
    }
    return resolved;
  });
}

/**
 * Create an LLM query function from configuration
 *
 * @param providerName - Name of the provider (ollama, deepseek, etc.)
 * @param providerConfig - Provider-specific configuration (baseUrl, apiKey, model, options)
 * @param overrides - Optional overrides for model/options
 * @returns A function that takes a prompt and returns a response
 */
export function createLLMClient(
  providerName: string,
  providerConfig: ProviderConfig,
  overrides?: { model?: string; options?: Record<string, unknown> }
): LLMQueryFn {
  const factory = providerFactories[providerName];
  if (!factory) {
    throw new Error(
      `Unknown LLM provider: ${providerName}. Available: ${Object.keys(providerFactories).join(", ")}`
    );
  }

  // Resolve environment variables in apiKey
  const resolvedConfig: ProviderConfig = {
    ...providerConfig,
    apiKey: resolveEnvVar(providerConfig.apiKey),
  };

  const provider = factory(resolvedConfig);

  // Build base LLMConfig from provider config + overrides
  const baseLlmConfig: LLMConfig = {
    provider: providerName,
    model: overrides?.model || providerConfig.model || "default",
    options: { ...providerConfig.options, ...overrides?.options },
  };

  // Return a query function that accepts optional format override
  return (prompt: string, queryOptions?: LLMQueryOptions) => {
    // Merge query-time options (like format) with base config
    const llmConfig: LLMConfig = queryOptions
      ? {
          ...baseLlmConfig,
          options: { ...baseLlmConfig.options, ...queryOptions },
        }
      : baseLlmConfig;
    return provider.query(prompt, llmConfig);
  };
}

export { createOllamaProvider } from "./ollama.js";
export { createDeepSeekProvider } from "./deepseek.js";

/**
 * Configuration interface for tiered clients
 */
interface TieredConfig {
  llm: {
    provider: string;
    large?: string;
    small?: string;
  };
  providers: Record<string, ProviderConfig>;
}

/**
 * Result of creating tiered clients
 */
export interface TieredClients {
  /** Client for the orchestrator (main loop) - uses large model */
  orchestrator: LLMQueryFn;
  /** Client for sub-queries (llm_query in sandbox) - uses small model */
  worker: LLMQueryFn;
}

/**
 * Create tiered LLM clients from configuration
 *
 * Supports two modes:
 * 1. Tiered mode (provider: "tiered"): Uses different providers for orchestrator and worker
 *    - llm.large: provider name for orchestrator
 *    - llm.small: provider name for worker
 * 2. Single mode (provider: "ollama" etc): Uses same provider for both
 *
 * @example
 * // Tiered config
 * {
 *   llm: { provider: "tiered", large: "deepseek", small: "ollama" },
 *   providers: {
 *     deepseek: { baseUrl: "...", apiKey: "...", model: "deepseek-chat" },
 *     ollama: { baseUrl: "...", model: "qwen3-coder:7b" }
 *   }
 * }
 */
export function createTieredClients(config: TieredConfig): TieredClients {
  const { llm, providers } = config;

  if (llm.provider === "tiered") {
    // Tiered mode: separate providers for orchestrator and worker
    const largeName = llm.large;
    const smallName = llm.small;

    if (!largeName || !smallName) {
      throw new Error(
        "Tiered mode requires llm.large and llm.small provider names"
      );
    }

    const largeConfig = providers[largeName];
    const smallConfig = providers[smallName];

    if (!largeConfig) {
      throw new Error(`Provider not found: ${largeName}`);
    }
    if (!smallConfig) {
      throw new Error(`Provider not found: ${smallName}`);
    }

    const orchestrator = createLLMClient(largeName, largeConfig, {
      model: largeConfig.model,
    });
    const worker = createLLMClient(smallName, smallConfig, {
      model: smallConfig.model,
    });

    return { orchestrator, worker };
  }

  // Single mode: same provider for both
  const providerName = llm.provider;
  const providerConfig = providers[providerName];

  if (!providerConfig) {
    throw new Error(`Provider not found: ${providerName}`);
  }

  const client = createLLMClient(providerName, providerConfig, {
    model: providerConfig.model,
  });

  // Both use the same client
  return { orchestrator: client, worker: client };
}
