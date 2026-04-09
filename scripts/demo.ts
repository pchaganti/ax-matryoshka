#!/usr/bin/env npx tsx
/**
 * Demo script to test RLM with a mock LLM
 * Shows how the turn loop works without needing a real LLM
 */

import { runRLM } from "../src/rlm.js";

// Mock LLM that simulates a realistic multi-turn exploration
let turn = 0;
const mockLLM = async (prompt: string): Promise<string> => {
  turn++;
  console.log(`\n--- LLM Turn ${turn} ---`);

  // Show what the LLM "sees" (truncated)
  const lines = prompt.split('\n');
  console.log(`Prompt length: ${prompt.length} chars, ${lines.length} lines`);

  // Simulate different responses based on turn
  if (turn === 1) {
    console.log("LLM: Let me first explore the document structure...");
    return `I'll start by examining the document structure.

\`\`\`typescript
const stats = text_stats();
console.log("Document has", stats.lineCount, "lines and", stats.length, "characters");
console.log("Preview:", stats.sample.start.slice(0, 100));
\`\`\``;
  }

  if (turn === 2) {
    console.log("LLM: Now searching for key content...");
    return `Let me search for the main topic.

\`\`\`typescript
const matches = fuzzy_search("sleep");
console.log("Found", matches.length, "matches for 'sleep'");
memory.push({ topic: "sleep", matchCount: matches.length });
if (matches.length > 0) {
  console.log("First match:", matches[0].line);
}
\`\`\``;
  }

  if (turn === 3) {
    console.log("LLM: I have enough information to answer...");
    return `Based on my exploration, I can now provide an answer.

<<<FINAL>>>
This document is about the science of sleep. It covers:
- Different sleep stages (Light sleep, Deep sleep, REM)
- The importance of sleep for health
- Tips for better sleep

The document has multiple sections explaining sleep cycles and their functions.
<<<END>>>`;
  }

  // Fallback
  return "<<<FINAL>>>\nAnalysis complete.\n<<<END>>>";
};

async function main() {
  console.log("=== RLM Demo with Mock LLM ===");
  console.log("This demonstrates the turn-by-turn exploration loop.");

  const result = await runRLM(
    "What is this document about?",
    "./test-fixtures/short-article.txt",
    {
      llmClient: mockLLM,
      maxTurns: 5,
      turnTimeoutMs: 5000,
      verbose: true,
    }
  );

  console.log("\n=== Final Result ===");
  console.log(result);
}

main().catch(console.error);
