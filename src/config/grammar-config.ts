/**
 * Grammar configuration helpers
 *
 * Reads grammar configurations from the unified config file
 * and merges with built-in grammars.
 */

import type { SymbolKind } from "../treesitter/types.js";
import { loadConfig, saveConfig, type Config, type GrammarConfig } from "../config.js";
import { CONFIG_DIR, CONFIG_FILE } from "./paths.js";

export type { GrammarConfig } from "../config.js";
export { CONFIG_DIR, CONFIG_FILE } from "./paths.js";

export async function getCustomGrammars(): Promise<Record<string, GrammarConfig>> {
  const config = await loadConfig();
  return config.grammars ?? {};
}

const DANGEROUS_LANG_NAMES = new Set(["__proto__", "constructor", "prototype", "__defineGetter__", "__defineSetter__", "__lookupGetter__", "__lookupSetter__", "hasOwnProperty", "toString", "valueOf", "toLocaleString", "isPrototypeOf", "propertyIsEnumerable"]);

const MAX_EXTENSIONS = 50;

const MAX_SYMBOLS = 500;

export async function addCustomGrammar(language: string, grammar: GrammarConfig): Promise<void> {
  if (DANGEROUS_LANG_NAMES.has(language) || !/^[a-zA-Z0-9_-]+$/.test(language)) {
    throw new Error(`Invalid language name: '${language}'`);
  }
  if (!Array.isArray(grammar.extensions) || grammar.extensions.length === 0 || grammar.extensions.length > MAX_EXTENSIONS) {
    throw new Error(`Extensions must be a non-empty array with at most ${MAX_EXTENSIONS} entries`);
  }
  for (const ext of grammar.extensions) {
    if (typeof ext !== "string" || ext.length > 20 || !/^\.[a-zA-Z0-9_-]+$/.test(ext)) {
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
      if (key.length > 256 || typeof value !== "string" || !VALID_SYMBOL_KINDS.has(value)) {
        throw new Error(`Invalid symbol kind for '${key}': '${value}'`);
      }
    }
  }
  const config = await loadConfig();
  config.grammars = config.grammars ?? {};
  config.grammars[language] = grammar;
  await saveConfig(config);
}

export async function removeCustomGrammar(language: string): Promise<boolean> {
  const config = await loadConfig();
  if (!config.grammars || !config.grammars[language]) {
    return false;
  }
  delete config.grammars[language];
  await saveConfig(config);
  return true;
}

export const EXAMPLE_CONFIG: Config = {
  llm: { provider: "ollama" },
  providers: {
    ollama: { url: "http://localhost:11434/api/generate", model: "qwen3-coder:30b" },
  },
  rlm: { maxTurns: 10 },
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
