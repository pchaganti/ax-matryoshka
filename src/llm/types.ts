export interface LLMOptions {
  temperature?: number;
  num_ctx?: number;
  max_tokens?: number;
  format?: "json" | "text";
}

export interface LLMQueryOptions {
  format?: "json" | "text";
}

export interface LLMConfig {
  provider: string;
  model: string;
  options?: LLMOptions;
}

export interface ProviderConfig {
  url: string;
  apiKey?: string;
  model?: string;
  options?: LLMOptions;
}

export interface LLMProvider {
  name: string;
  query(prompt: string, config: LLMConfig): Promise<string>;
  stream?(
    prompt: string,
    config: LLMConfig,
    onChunk: (chunk: string) => void
  ): Promise<string>;
}

export type LLMQueryFn = (prompt: string, options?: LLMQueryOptions) => Promise<string>;
