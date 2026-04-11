import { readFile } from "fs/promises";
import { resolve } from "path";
import { hasTraversalSegment } from "./utils/path-safety.js";

/**
 * Configuration file types
 *
 * Note: These types mirror some types in llm/types.ts but serve different purposes:
 * - These types represent the JSON config file structure (fields may be optional)
 * - llm/types.ts types represent runtime API contracts (required fields for operation)
 */

export interface LLMOptions {
  temperature?: number;
  num_ctx?: number;
  max_tokens?: number;
}

export interface LLMConfig {
  provider: string;
  /** For tiered mode: name of the large/orchestrator provider */
  large?: string;
  /** For tiered mode: name of the small/worker provider */
  small?: string;
  model?: string;
  options?: LLMOptions;
}

export interface ProviderConfig {
  baseUrl: string;
  apiKey?: string;
  model?: string;
  /** Adapter name for model-specific prompting (e.g., "qwen", "deepseek"). Auto-detected from model name if not specified. */
  adapter?: string;
  options?: LLMOptions;
}

export interface RLMConfig {
  maxTurns: number;
}

export interface Config {
  llm: LLMConfig;
  providers: Record<string, ProviderConfig>;
  rlm: RLMConfig;
}

/**
 * Recursively resolve environment variables in config values.
 * Supports ${VAR_NAME} syntax in string values.
 */
const MAX_ENV_DEPTH = 20;
function resolveEnvVars(obj: unknown, depth: number = 0): unknown {
  if (depth > MAX_ENV_DEPTH) return obj;
  if (typeof obj === "string") {
    const DANGEROUS_VAR_NAMES = ["__proto__", "constructor", "prototype", "__defineGetter__", "__defineSetter__", "__lookupGetter__", "__lookupSetter__"];
    return obj.replace(/\$\{([^}]+)\}/g, (_, varName: string) => {
      if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(varName) || DANGEROUS_VAR_NAMES.includes(varName)) {
        throw new Error(`Invalid environment variable name: ${varName}`);
      }
      const resolved = process.env[varName];
      if (resolved === undefined) {
        return ""; // Unset env vars resolve to empty string (non-fatal)
      }
      return resolved;
    });
  }
  const MAX_ARRAY_SIZE = 10_000;
  if (Array.isArray(obj)) {
    if (obj.length > MAX_ARRAY_SIZE) return obj;
    return obj.map(item => resolveEnvVars(item, depth + 1));
  }
  if (obj && typeof obj === "object") {
    const DANGEROUS_OBJ_KEYS = new Set(["__proto__", "constructor", "prototype"]);
    const result: Record<string, unknown> = Object.create(null);
    for (const [key, value] of Object.entries(obj)) {
      if (DANGEROUS_OBJ_KEYS.has(key)) continue;
      result[key] = resolveEnvVars(value, depth + 1);
    }
    return result;
  }
  return obj;
}

const DEFAULT_CONFIG: Config = {
  llm: {
    provider: "ollama",
  },
  providers: {
    ollama: {
      baseUrl: "http://localhost:11434",
      model: "qwen3-coder:30b",
      options: {
        temperature: 0.2,
        num_ctx: 8192,
      },
    },
  },
  rlm: {
    maxTurns: 10,
  },
};

const MAX_NUMERIC_COERCE_LENGTH = 15; // Don't coerce strings longer than this (API keys, tokens)
const MAX_CONFIG_DEPTH = 20;
function coerceConfigTypes(obj: unknown, depth: number = 0): unknown {
  if (depth > MAX_CONFIG_DEPTH) return obj;
  if (typeof obj === "string") {
    if (obj.length <= MAX_NUMERIC_COERCE_LENGTH && /^-?\d+(\.\d+)?([eE][+-]?\d+)?$/.test(obj) && !isNaN(Number(obj))) {
      const num = Number(obj);
      if (!Number.isFinite(num)) return obj;
      return num;
    }
    if (obj === "true") return true;
    if (obj === "false") return false;
    return obj;
  }
  if (Array.isArray(obj)) return obj.map(item => coerceConfigTypes(item, depth + 1));
  if (obj && typeof obj === "object") {
    const result: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(obj)) {
      result[k] = coerceConfigTypes(v, depth + 1);
    }
    return result;
  }
  return obj;
}

export async function loadConfig(configPath?: string): Promise<Config> {
  const path = configPath || resolve(process.cwd(), "config.json");

  // Validate custom config path — block path traversal sequences (segment-aware
  // so legitimate filenames like `local..config.json` are allowed)
  if (configPath && hasTraversalSegment(configPath)) {
    throw new Error("Config path traversal (..) is not allowed");
  }

  try {
    const content = await readFile(path, "utf-8");
    const rawConfig = JSON.parse(content) as Partial<Config>;
    const userConfig = coerceConfigTypes(resolveEnvVars(rawConfig)) as Partial<Config>;

    // Deep merge with defaults
    return {
      llm: { ...DEFAULT_CONFIG.llm, ...userConfig.llm },
      providers: { ...DEFAULT_CONFIG.providers, ...userConfig.providers },
      rlm: { ...DEFAULT_CONFIG.rlm, ...userConfig.rlm },
    };
  } catch (error) {
    if (error instanceof SyntaxError) {
      throw new Error(`Invalid JSON in config file ${path}: ${error.message}`);
    }
    if (error instanceof Error && "code" in error && (error as NodeJS.ErrnoException).code === "ENOENT") {
      // Config file not found, use defaults
      return DEFAULT_CONFIG;
    }
    throw error;
  }
}

