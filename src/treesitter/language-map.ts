/**
 * Language mapping for Tree-sitter
 *
 * Manages file extension to language mappings, combining:
 * 1. Built-in grammars shipped with matryoshka
 * 2. Custom grammars from ~/.matryoshka/config.json
 */

import { createRequire } from "node:module";
import type { SupportedLanguage, LanguageConfig, SymbolKind } from "./types.js";
import { BUILTIN_GRAMMARS, type BuiltinGrammar } from "./builtin-grammars.js";
import { getCustomGrammars, type GrammarConfig } from "../config/grammar-config.js";

// Use createRequire for checking if packages are installed
const require = createRequire(import.meta.url);

/**
 * Convert a BuiltinGrammar to LanguageConfig
 */
function builtinToConfig(language: string, builtin: BuiltinGrammar): LanguageConfig {
  return {
    language,
    extensions: builtin.extensions,
    package: builtin.package,
    moduleExport: builtin.moduleExport,
    symbols: builtin.symbols,
  };
}

/**
 * Convert a GrammarConfig to LanguageConfig
 */
function customToConfig(language: string, custom: GrammarConfig): LanguageConfig {
  return {
    language,
    extensions: custom.extensions,
    package: custom.package,
    moduleExport: custom.moduleExport,
    symbols: custom.symbols,
  };
}

/**
 * Get all language configurations (built-in + custom)
 * Custom configs override built-in ones with the same name
 */
const DANGEROUS_LANG_KEYS = new Set(["__proto__", "constructor", "prototype", "__defineGetter__", "__defineSetter__", "__lookupGetter__", "__lookupSetter__", "hasOwnProperty", "toString", "valueOf", "toLocaleString", "isPrototypeOf", "propertyIsEnumerable"]);

export function getAllLanguageConfigs(): Record<string, LanguageConfig> {
  const configs: Record<string, LanguageConfig> = {};

  // Add built-in grammars
  for (const [lang, builtin] of Object.entries(BUILTIN_GRAMMARS)) {
    if (DANGEROUS_LANG_KEYS.has(lang)) continue;
    configs[lang] = builtinToConfig(lang, builtin);
  }

  // Merge custom grammars (overrides built-in)
  try {
    const custom = getCustomGrammars();
    for (const [lang, grammar] of Object.entries(custom)) {
      if (DANGEROUS_LANG_KEYS.has(lang)) continue;
      configs[lang] = customToConfig(lang, grammar);
    }
  } catch {
    // Config file may not exist or be invalid - that's okay
  }

  return configs;
}

/**
 * Build extension to language mapping
 */
function buildExtensionMap(): Map<string, string> {
  const map = new Map<string, string>();
  const configs = getAllLanguageConfigs();

  for (const [lang, config] of Object.entries(configs)) {
    for (const ext of config.extensions) {
      if (typeof ext !== "string") continue;
      map.set(ext.toLowerCase(), lang);
    }
  }

  return map;
}

// Cache the extension map (rebuilt on demand)
let extensionMapCache: Map<string, string> | null = null;

/**
 * Get the extension map (cached)
 */
function getExtensionMap(): Map<string, string> {
  if (!extensionMapCache) {
    extensionMapCache = buildExtensionMap();
  }
  return extensionMapCache;
}

/**
 * Clear the extension map cache (call when config changes)
 */
export function clearLanguageCache(): void {
  extensionMapCache = null;
}

/**
 * Get the language for a file extension
 * @param ext File extension (including dot, e.g., ".ts")
 */
export function getLanguageForExtension(ext: string): SupportedLanguage | null {
  return getExtensionMap().get(ext.toLowerCase()) ?? null;
}

/**
 * Get the language configuration for a language
 */
const DANGEROUS_CONFIG_KEYS = new Set(["__proto__", "constructor", "prototype", "__defineGetter__", "__defineSetter__", "__lookupGetter__", "__lookupSetter__"]);

export function getLanguageConfig(language: string): LanguageConfig | null {
  if (DANGEROUS_CONFIG_KEYS.has(language)) return null;
  const configs = getAllLanguageConfigs();
  return Object.hasOwn(configs, language) ? configs[language] : null;
}

/**
 * Get symbol mappings for a language
 */
export function getSymbolMappings(language: string): Record<string, SymbolKind> | null {
  const config = getLanguageConfig(language);
  return config?.symbols ?? null;
}

/**
 * Check if an extension is supported
 */
export function isExtensionSupported(ext: string): boolean {
  return getExtensionMap().has(ext.toLowerCase());
}

/**
 * Get all supported extensions
 */
export function getSupportedExtensions(): string[] {
  return [...getExtensionMap().keys()];
}

/**
 * Get all supported languages
 */
export function getSupportedLanguages(): SupportedLanguage[] {
  return Object.keys(getAllLanguageConfigs());
}

/**
 * Check if a language is available (has npm package installed)
 */
export function isLanguageAvailable(language: string): boolean {
  const config = getLanguageConfig(language);
  if (!config) return false;

  try {
    require.resolve(config.package);
    return true;
  } catch {
    return false;
  }
}

/**
 * Get list of available languages (with packages installed)
 */
export function getAvailableLanguages(): string[] {
  return getSupportedLanguages().filter(isLanguageAvailable);
}

// Legacy exports for backward compatibility
export const LANGUAGE_CONFIGS = getAllLanguageConfigs();

export function getWasmFile(language: SupportedLanguage): string {
  // No longer used - kept for compatibility
  return `tree-sitter-${language}.wasm`;
}
