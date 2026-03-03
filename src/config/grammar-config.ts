/**
 * Grammar configuration loader
 *
 * Loads grammar configurations from ~/.matryoshka/config.json
 * and merges with built-in grammars.
 */

import { readFileSync, existsSync, mkdirSync, writeFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import type { SymbolKind } from "../treesitter/types.js";

/**
 * Grammar configuration for a language
 */
export interface GrammarConfig {
  /** npm package name (e.g., "tree-sitter-rust") */
  package: string;
  /** File extensions (e.g., [".rs"]) */
  extensions: string[];
  /** Map of AST node types to symbol kinds */
  symbols: Record<string, SymbolKind>;
  /** Optional: how to extract the grammar from the module */
  moduleExport?: string;
}

/**
 * Full configuration file structure
 */
export interface MatryoshkaConfig {
  /** Custom grammar configurations */
  grammars?: Record<string, GrammarConfig>;
  /** Other config options can be added here */
}

/**
 * Default config directory and file paths
 */
export const CONFIG_DIR = join(homedir(), ".matryoshka");
export const CONFIG_FILE = join(CONFIG_DIR, "config.json");

/**
 * Load configuration from ~/.matryoshka/config.json
 * Returns empty config if file doesn't exist
 */
const MAX_CONFIG_FILE_SIZE = 10_000_000; // 10MB

export function loadConfig(): MatryoshkaConfig {
  if (!existsSync(CONFIG_FILE)) {
    return {};
  }

  try {
    const stats = statSync(CONFIG_FILE);
    if (stats.size > MAX_CONFIG_FILE_SIZE) {
      console.warn(`Warning: Config file too large (${stats.size} bytes, max ${MAX_CONFIG_FILE_SIZE})`);
      return {};
    }
    const content = readFileSync(CONFIG_FILE, "utf-8");
    return JSON.parse(content) as MatryoshkaConfig;
  } catch (error) {
    console.warn(`Warning: Failed to parse ${CONFIG_FILE}: ${error}`);
    return {};
  }
}

/**
 * Ensure config directory exists
 */
export function ensureConfigDir(): void {
  if (!existsSync(CONFIG_DIR)) {
    mkdirSync(CONFIG_DIR, { recursive: true });
  }
}

/**
 * Save configuration to ~/.matryoshka/config.json
 */
export function saveConfig(config: MatryoshkaConfig): void {
  ensureConfigDir();
  writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2));
}

/**
 * Get custom grammars from config
 */
export function getCustomGrammars(): Record<string, GrammarConfig> {
  const config = loadConfig();
  return config.grammars ?? {};
}

/**
 * Add a custom grammar to config
 */
const DANGEROUS_LANG_NAMES = new Set(["__proto__", "constructor", "prototype", "__defineGetter__", "__defineSetter__", "__lookupGetter__", "__lookupSetter__", "hasOwnProperty", "toString", "valueOf", "toLocaleString", "isPrototypeOf", "propertyIsEnumerable"]);

const MAX_EXTENSIONS = 50;

const MAX_SYMBOLS = 500;

export function addCustomGrammar(language: string, grammar: GrammarConfig): void {
  if (DANGEROUS_LANG_NAMES.has(language) || !/^[a-zA-Z0-9_-]+$/.test(language)) {
    throw new Error(`Invalid language name: '${language}'`);
  }
  if (!Array.isArray(grammar.extensions) || grammar.extensions.length === 0 || grammar.extensions.length > MAX_EXTENSIONS) {
    throw new Error(`Extensions must be a non-empty array with at most ${MAX_EXTENSIONS} entries`);
  }
  for (const ext of grammar.extensions) {
    if (typeof ext !== "string" || !/^\.[a-zA-Z0-9_-]+$/.test(ext)) {
      throw new Error(`Invalid extension format: '${ext}'`);
    }
  }
  if (typeof grammar.package !== "string" || grammar.package.length === 0 || grammar.package.length > 256 || !/^[@a-zA-Z0-9][\w./@-]*$/.test(grammar.package) || grammar.package.includes("..")) {
    throw new Error(`Invalid package name: '${grammar.package}'`);
  }
  if (grammar.moduleExport !== undefined) {
    if (typeof grammar.moduleExport !== "string" || grammar.moduleExport.length === 0 || grammar.moduleExport.length > 256) {
      throw new Error(`Invalid moduleExport: '${grammar.moduleExport}'`);
    }
    if (DANGEROUS_LANG_NAMES.has(grammar.moduleExport)) {
      throw new Error(`Dangerous moduleExport name: '${grammar.moduleExport}'`);
    }
  }
  const VALID_SYMBOL_KINDS = new Set(["function", "method", "class", "interface", "type", "struct", "variable", "constant", "property", "enum", "module", "namespace", "trait"]);
  if (grammar.symbols && typeof grammar.symbols === "object" && !Array.isArray(grammar.symbols)) {
    const symbolKeys = Object.keys(grammar.symbols);
    if (symbolKeys.length > MAX_SYMBOLS) {
      throw new Error(`Too many symbol mappings: ${symbolKeys.length} (max ${MAX_SYMBOLS})`);
    }
    for (const [key, value] of Object.entries(grammar.symbols)) {
      if (typeof value !== "string" || !VALID_SYMBOL_KINDS.has(value)) {
        throw new Error(`Invalid symbol kind for '${key}': '${value}'`);
      }
    }
  }
  const config = loadConfig();
  config.grammars = config.grammars ?? {};
  config.grammars[language] = grammar;
  saveConfig(config);
}

/**
 * Remove a custom grammar from config
 */
export function removeCustomGrammar(language: string): boolean {
  const config = loadConfig();
  if (!config.grammars || !config.grammars[language]) {
    return false;
  }
  delete config.grammars[language];
  saveConfig(config);
  return true;
}

/**
 * Example config for reference
 */
export const EXAMPLE_CONFIG: MatryoshkaConfig = {
  grammars: {
    rust: {
      package: "tree-sitter-rust",
      extensions: [".rs"],
      symbols: {
        function_item: "function",
        impl_item: "method",
        struct_item: "struct",
        enum_item: "enum",
        trait_item: "interface",
        type_item: "type",
        const_item: "constant",
        static_item: "variable",
        mod_item: "module",
      },
    },
  },
};
