#!/usr/bin/env npx tsx
/**
 * Test script for Barliman-style synthesis with verbose logging
 *
 * Usage:
 *   npx tsx scripts/test-barliman.ts
 *
 * This script demonstrates the Barliman workflow:
 * 1. LLM searches the document
 * 2. LLM provides constraints (input/output examples)
 * 3. Synthesizer builds a function from examples
 * 4. If synthesis fails, LLM gets feedback and refines constraints
 */

import { runRLM } from "../src/rlm.js";
import { createQwenBarlimanAdapter } from "../src/adapters/qwen-barliman.js";
import { createOllamaClient } from "../src/llm/ollama.js";
import { resolve } from "path";

async function main() {
  // Configuration
  const model = process.env.RLM_MODEL || "qwen2.5-coder:7b";
  const baseUrl = process.env.OLLAMA_URL || "http://localhost:11434";
  const testFile = resolve(process.cwd(), "test-fixtures/scattered-data.txt");
  const query = "What is the total of all SALES_DATA values?";

  console.log("\n" + "=".repeat(70));
  console.log("  BARLIMAN-STYLE SYNTHESIS TEST");
  console.log("=".repeat(70));
  console.log(`  Model: ${model}`);
  console.log(`  Base URL: ${baseUrl}`);
  console.log(`  Test file: ${testFile}`);
  console.log(`  Query: ${query}`);
  console.log("=".repeat(70) + "\n");

  // Create adapter and LLM client
  const adapter = createQwenBarlimanAdapter();
  const llmClient = createOllamaClient({
    baseUrl,
    model,
    options: {
      temperature: 0.1,
      num_predict: 2000,
    },
  });

  console.log("[Setup] Adapter name:", adapter.name);
  console.log("[Setup] Testing LLM connection...");

  try {
    // Quick test of LLM connection
    const testResponse = await llmClient("Say 'hello' in one word.");
    console.log("[Setup] LLM responded:", testResponse.slice(0, 50) + "...");
  } catch (err) {
    console.error("[Setup] ERROR: Could not connect to Ollama");
    console.error("[Setup] Make sure Ollama is running at", baseUrl);
    console.error("[Setup] Error:", err instanceof Error ? err.message : err);
    process.exit(1);
  }

  console.log("\n" + "-".repeat(70));
  console.log("  STARTING RLM WITH BARLIMAN ADAPTER");
  console.log("-".repeat(70) + "\n");

  try {
    const result = await runRLM(query, testFile, {
      llmClient,
      adapter,
      maxTurns: 10,
      turnTimeoutMs: 60000,
      verbose: true, // Enable verbose logging
    });

    console.log("\n" + "=".repeat(70));
    console.log("  FINAL RESULT");
    console.log("=".repeat(70));
    console.log(typeof result === "string" ? result : JSON.stringify(result, null, 2));
    console.log("=".repeat(70) + "\n");
  } catch (err) {
    console.error("\n[Error]", err instanceof Error ? err.message : err);
    process.exit(1);
  }
}

main();
