/**
 * Configuration management for matryoshka
 *
 * Loads and manages configuration from ~/.config/matryoshka/config.json
 */

export {
  loadConfig,
  saveConfig,
  ensureConfigDir,
  resolveConfigPath,
  type Config,
  type GrammarConfig,
  type LLMConfig,
  type LLMOptions,
  type ProviderConfig,
  type RLMConfig,
} from "../config.js";

export {
  getCustomGrammars,
  addCustomGrammar,
  removeCustomGrammar,
  EXAMPLE_CONFIG,
} from "./grammar-config.js";

export { CONFIG_DIR, CONFIG_FILE } from "./paths.js";
