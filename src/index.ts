#!/usr/bin/env node
/**
 * RLM CLI Entry Point
 *
 * Provides command-line access to the Recursive Language Model.
 */

import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { runRLM } from "./rlm.js";
import { loadConfig } from "./config.js";
import { CONFIG_FILE } from "./config/paths.js";
import { createLLMClient } from "./llm/index.js";
import { resolveAdapter, getAvailableAdapters } from "./adapters/index.js";
import {
  parseSimpleType,
  parseConstraintJSON,
  type SynthesisConstraint,
} from "./constraints/index.js";
import { getVersion } from "./version.js";

interface CLIOptions {
  query: string;
  file: string;
  maxTurns: number;
  model: string;
  provider: string;
  adapter: string;
  outputType: string;
  constraints: string;
  verbose: boolean;
  dryRun: boolean;
  config: string;
}

function showHelp(): void {
  console.log(`
Usage: rlm <query> <file> [options]

Arguments:
  query       The question or task to perform on the document
  file        Path to the document file to analyze

Options:
  --max-turns <n>    Maximum number of turns (default: 10)
  --model <name>     Override the LLM model name
  --provider <name>  Override the LLM provider (ollama, deepseek, openai)
  --adapter <name>   Override the model adapter (qwen, deepseek, base)
  --output-type <t>  Expected output type: number, string, boolean, array, object
  --constraints <j>  Output constraints as JSON (e.g., '{"type":"number","min":0}')
  --config <path>    Path to config file (default: ./config.json or ~/.config/matryoshka/config.json)
  --verbose          Enable verbose output
  --dry-run          Show configuration without running
  -v, --version      Show version number
  --help             Show this help message

Examples:
  rlm "Summarize this document" ./document.txt
  rlm "Find total sales" ./data.txt --output-type number
  rlm "Extract errors" ./logs.txt --constraints '{"type":"array","items":{"type":"string"}}'
  rlm "Find all mentions of 'whale'" ./moby-dick.txt --max-turns 15
  rlm "Count the words" ./file.txt --model llama3 --verbose
  rlm "List all section headings" ./README.md
`);
}

function parseArgs(args: string[]): CLIOptions {
  const options: CLIOptions = {
    query: "",
    file: "",
    maxTurns: 10,
    model: "",
    provider: "",
    adapter: "",
    outputType: "",
    constraints: "",
    verbose: false,
    dryRun: false,
    config: CONFIG_FILE,
  };

  const positional: string[] = [];

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];

    if (arg === "--help" || arg === "-h") {
      showHelp();
      process.exit(0);
    } else if (arg === "--version" || arg === "-v") {
      console.log(`rlm v${getVersion()}`);
      process.exit(0);
    } else if (arg === "--max-turns") {
      if (i + 1 >= args.length) throw new Error("--max-turns requires a value");
      const val = parseInt(args[++i], 10);
      if (isNaN(val) || val < 1) throw new Error("--max-turns requires a positive integer");
      options.maxTurns = val;
    } else if (arg === "--model") {
      if (i + 1 >= args.length) throw new Error("--model requires a value");
      options.model = args[++i];
    } else if (arg === "--provider") {
      if (i + 1 >= args.length) throw new Error("--provider requires a value");
      options.provider = args[++i];
    } else if (arg === "--adapter") {
      if (i + 1 >= args.length) throw new Error("--adapter requires a value");
      options.adapter = args[++i];
    } else if (arg === "--output-type") {
      if (i + 1 >= args.length) throw new Error("--output-type requires a value");
      options.outputType = args[++i];
    } else if (arg === "--constraints") {
      if (i + 1 >= args.length) throw new Error("--constraints requires a value");
      options.constraints = args[++i];
    } else if (arg === "--config") {
      if (i + 1 >= args.length) throw new Error("--config requires a value");
      options.config = args[++i];
    } else if (arg === "--verbose") {
      options.verbose = true;
    } else if (arg === "--dry-run") {
      options.dryRun = true;
    } else if (!arg.startsWith("-")) {
      positional.push(arg);
    } else {
      throw new Error(`Unknown option: ${arg}. Run --help for usage.`);
    }
  }

  if (positional.length >= 1) {
    options.query = positional[0];
  }
  if (positional.length >= 2) {
    options.file = positional[1];
  }

  return options;
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const options = parseArgs(args);

  // Validate required arguments
  if (!options.query || !options.file) {
    console.error("Error: Missing required arguments.");
    console.error("Usage: rlm <query> <file> [options]");
    console.error("Use --help for more information.");
    process.exit(1);
  }

  // Resolve file path
  const filePath = resolve(options.file);

  // Check file exists
  if (!existsSync(filePath)) {
    console.error(`Error: File does not exist: ${filePath}`);
    process.exit(1);
  }

  // Dry run mode - show configuration
  if (options.dryRun) {
    console.log("Dry run - Configuration:");
    console.log(`Query: ${options.query}`);
    console.log(`File: ${filePath}`);
    console.log(`Max turns: ${options.maxTurns}`);
    console.log(`Model: ${options.model || "(from config)"}`);
    console.log(`Provider: ${options.provider || "(from config)"}`);
    console.log(`Adapter: ${options.adapter || "(auto-detect)"}`);
    console.log(`Output type: ${options.outputType || "(none)"}`);
    console.log(`Constraints: ${options.constraints || "(none)"}`);
    console.log(`Available adapters: ${getAvailableAdapters().join(", ")}`);
    console.log(`Verbose: ${options.verbose}`);
    return;
  }

  // Load configuration
  let config;
  try {
    config = await loadConfig(options.config);
  } catch (err) {
    console.error(
      `Error loading config: ${err instanceof Error ? err.message : err}`
    );
    process.exit(1);
  }

  // Get provider config
  const providerName = options.provider || config.llm.provider;
  const providerConfig = config.providers[providerName];

  if (!providerConfig) {
    console.error(`Error: Unknown provider: ${providerName}`);
    console.error(
      `Available providers: ${Object.keys(config.providers).join(", ")}`
    );
    process.exit(1);
  }

  // Build overrides from CLI options
  const overrides = options.model ? { model: options.model } : undefined;
  const effectiveModel = options.model || providerConfig.model || "default";

  // Resolve adapter: CLI option > config option > auto-detect from model name
  const explicitAdapter = options.adapter || providerConfig.adapter;
  const adapter = resolveAdapter(effectiveModel, explicitAdapter);

  // Parse output constraints
  let constraint: SynthesisConstraint | undefined;
  if (options.constraints) {
    constraint = parseConstraintJSON(options.constraints) ?? undefined;
    if (!constraint) {
      console.error(`Error: Invalid constraints JSON: ${options.constraints}`);
      process.exit(1);
    }
  } else if (options.outputType) {
    const outputConstraint = parseSimpleType(options.outputType);
    if (!outputConstraint) {
      console.error(`Error: Invalid output type: ${options.outputType}`);
      console.error("Valid types: number, string, boolean, array, object, null");
      process.exit(1);
    }
    constraint = { output: outputConstraint };
  }

  if (options.verbose) {
    console.log("Configuration:");
    console.log(`  Provider: ${providerName}`);
    console.log(`  Model: ${effectiveModel}`);
    console.log(`  Adapter: ${adapter.name}${explicitAdapter ? "" : " (auto-detected)"}`);
    console.log(`  Max turns: ${options.maxTurns}`);
    if (constraint) {
      console.log(`  Output constraint: ${JSON.stringify(constraint.output)}`);
    }
    console.log("");
  }

  // Create LLM client
  const llmClient = createLLMClient(providerName, providerConfig, overrides);

  // Run RLM
  if (options.verbose) {
    console.log(`Processing: ${filePath}`);
    console.log(`Query: ${options.query}`);
    console.log("");
  }

  try {
    const result = await runRLM(options.query, filePath, {
      llmClient,
      adapter,
      maxTurns: options.maxTurns,
      verbose: options.verbose,
      constraint,
    });

    // Output result
    if (typeof result === "string") {
      console.log(result);
    } else {
      console.log(JSON.stringify(result, null, 2));
    }
  } catch (err) {
    console.error(`Error: ${err instanceof Error ? err.message : err}`);
    process.exit(1);
  }
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
