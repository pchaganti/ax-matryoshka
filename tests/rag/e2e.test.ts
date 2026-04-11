/**
 * End-to-end tests for RAG integration with RLM
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { runRLM } from "../../src/rlm.js";
import { getRAGManager } from "../../src/rag/manager.js";
import { createQwenAdapter } from "../../src/adapters/qwen.js";
import { writeFile, unlink, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

describe("RAG E2E Tests", () => {
  let testFile: string;
  let testDir: string;

  beforeEach(async () => {
    testDir = join(tmpdir(), `rag-test-${Date.now()}`);
    await mkdir(testDir, { recursive: true });
    testFile = join(testDir, "test-data.txt");

    // Create test file with sales data
    await writeFile(testFile, `
# Test Sales Report

Region A Sales:
SALES_DATA_A: $1,000,000
Notes: Good quarter

Region B Sales:
SALES_DATA_B: $2,500,000
Notes: Record sales

Region C Sales:
SALES_DATA_C: $1,500,000
Notes: Steady growth

Total regions: 3
    `.trim());
  });

  afterEach(async () => {
    try {
      await unlink(testFile);
    } catch {
      // Ignore cleanup errors
    }
  });

  describe("Hint injection", () => {
    it("should inject hints for currency-related queries", async () => {
      const promptsSeen: string[] = [];

      const mockLLM = async (prompt: string) => {
        promptsSeen.push(prompt);

        // First turn: search
        if (promptsSeen.length === 1) {
          return `\`\`\`javascript
const hits = grep("SALES_DATA");
console.log(JSON.stringify(hits, null, 2));
\`\`\``;
        }

        // Second turn: compute
        if (promptsSeen.length === 2) {
          return `\`\`\`javascript
let total = 0;
for (const hit of hits) {
  const match = hit.line.match(/\\$([\\d,]+)/);
  if (match) {
    total += parseFloat(match[1].replace(/,/g, ""));
  }
}
console.log("Total:", total);
\`\`\`
<<<FINAL>>>
Total: $5,000,000
<<<END>>>`;
        }

        return `<<<FINAL>>>Done<<<END>>>`;
      };

      await runRLM("What is the total sales?", testFile, {
        llmClient: mockLLM,
        adapter: createQwenAdapter(),
        ragEnabled: true,
        maxTurns: 5,
      });

      // Verify RAG hints were injected into the system prompt
      expect(promptsSeen[0]).toContain("RELEVANT PATTERNS");
    });

    it("should include pitfall warnings for sum queries", async () => {
      const promptsSeen: string[] = [];

      const mockLLM = async (prompt: string) => {
        promptsSeen.push(prompt);
        return `\`\`\`javascript
console.log("done");
\`\`\`
<<<FINAL>>>Test<<<END>>>`;
      };

      await runRLM("sum up all the dollar values", testFile, {
        llmClient: mockLLM,
        ragEnabled: true,
        maxTurns: 2,
      });

      // Should have hints about currency parsing
      const systemPrompt = promptsSeen[0];
      expect(
        systemPrompt.includes("RELEVANT PATTERNS") ||
        systemPrompt.includes("Suggested Pattern")
      ).toBe(true);
    });
  });

  describe("[object Object] detection", () => {
    // [object Object] feedback-generation test removed: the bug class only
    // exists when the LLM emits plain JS `console.log(obj)` in a code
    // block and the sandbox runs it. The nucleus adapter parses
    // S-expressions and LC results JSON-serialize cleanly. The related
    // "should not accept final answer" test below still guards the
    // terminate-after-garbage path and remains valid.

    it("should not accept final answer immediately after [object Object] output", async () => {
      let turnCount = 0;
      let lastResponse = "";

      const mockLLM = async (prompt: string) => {
        turnCount++;

        if (turnCount === 1) {
          // Bad first turn: log objects without stringify AND try to answer
          return `\`\`\`javascript
const hits = grep("SALES");
console.log(hits);
\`\`\`
<<<FINAL>>>
The total is $5,000,000
<<<END>>>`;
        }

        if (turnCount === 2) {
          // Should be asked to continue since previous output was unhelpful
          // Now do it correctly
          return `\`\`\`javascript
let total = 0;
for (const hit of hits) {
  const m = hit.line.match(/\\$([\\d,]+)/);
  if (m) total += parseFloat(m[1].replace(/,/g, ""));
}
console.log("Total:", total);
\`\`\`
<<<FINAL>>>
The total sales are $5,000,000
<<<END>>>`;
        }

        lastResponse = prompt;
        return `<<<FINAL>>>Done<<<END>>>`;
      };

      const result = await runRLM("sum sales", testFile, {
        llmClient: mockLLM,
        maxTurns: 5,
        ragEnabled: false,
      });

      // Should have required at least 2 turns due to [object Object]
      expect(turnCount).toBeGreaterThanOrEqual(2);
    });
  });

  // Self-correction feedback test removed:
  //   1. Wrong feature model. It expected turn-level self-correction
  //      (turn 1 error → turn 2 prompt contains RAG feedback). In reality
  //      generateSelfCorrectionFeedback is called once at the start of a
  //      run (rlm.ts:330), reading failure memory from *prior runs* with
  //      the same sessionId — it's a cross-run feature, not cross-turn.
  //   2. Wrong error source. The mock emitted JS code blocks expecting
  //      runtime errors in a JS sandbox that no longer runs. Under
  //      nucleus, only LC solver errors flow through recordFailure
  //      (rlm-states.ts:421); parse and type errors go straight to
  //      history feedback.
  // The RAG self-correction pipeline is covered directly by unit tests in
  // tests/rag/manager.test.ts (20+ assertions on recordFailure /
  // generateSelfCorrectionFeedback) and by tests/rag/integration.test.ts
  // (which populates failure memory and asserts the self-correction text
  // output). A cross-run self-correction e2e test would be a reasonable
  // future addition but would require two sequential runRLM calls with
  // shared sessionId, which is orthogonal to this file's focus.

  describe("Hint relevance", () => {
    it("should retrieve aggregation hints for sum queries", async () => {
      const manager = getRAGManager();
      const hints = manager.getHints("sum up the total values", 3);

      expect(hints.length).toBeGreaterThan(0);
      expect(hints.some(h =>
        h.content.toLowerCase().includes("total") ||
        h.content.toLowerCase().includes("sum")
      )).toBe(true);
    });

    it("should retrieve search hints for find queries", async () => {
      const manager = getRAGManager();
      const hints = manager.getHints("find all error messages", 3);

      expect(hints.length).toBeGreaterThan(0);
      expect(hints.some(h => h.content.includes("grep"))).toBe(true);
    });

    it("should retrieve extraction hints for parse queries", async () => {
      const manager = getRAGManager();
      const hints = manager.getHints("extract the date values", 3);

      expect(hints.length).toBeGreaterThan(0);
      expect(hints.some(h =>
        h.content.includes("match") ||
        h.content.includes("extract")
      )).toBe(true);
    });
  });
});

describe("RAG hint formatting", () => {
  it("should format hints with code blocks", () => {
    const manager = getRAGManager();
    const hints = manager.getHints("count items", 2);
    const formatted = manager.formatHintsForPrompt(hints);

    if (hints.length > 0) {
      expect(formatted).toContain("```javascript");
      expect(formatted).toContain("```");
    }
  });

  it("should include rationale in hints", () => {
    const manager = getRAGManager();
    const hints = manager.getHints("sum currency values", 2);
    const formatted = manager.formatHintsForPrompt(hints);

    if (hints.length > 0) {
      expect(formatted).toContain("Why this works");
    }
  });
});
