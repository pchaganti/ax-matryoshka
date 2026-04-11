import { describe, it, expect, vi, beforeEach } from "vitest";
import { runRLM } from "../src/rlm.js";

// Mock the LLM for controlled testing
const mockLLM = vi.fn();

describe("RLM Executor", () => {
  beforeEach(() => {
    mockLLM.mockReset();
  });

  // Tests for buildSystemPrompt / extractCode / extractFinalAnswer removed:
  // those were deprecated helpers in rlm.ts that duplicated adapter methods.
  // Adapters are now exclusively responsible for prompt building and response
  // parsing — tested per-adapter in tests/adapters.test.ts and
  // tests/adapters/nucleus.test.ts.

  describe("runRLM", () => {
    // NOTE: All tests now use LC syntax since RLM only accepts Lambda Calculus terms
    it("should load document and process final answer", async () => {
      // First turn: execute LC search (required before final answer is accepted)
      mockLLM
        .mockResolvedValueOnce('(grep "test")')
        .mockResolvedValueOnce("<<<FINAL>>>\ndone\n<<<END>>>");

      const result = await runRLM("test query", "./test-fixtures/small.txt", {
        llmClient: mockLLM,
        maxTurns: 5,
      });

      expect(result).toBe("done");
    });

    it("should execute code and feed results back", async () => {
      mockLLM
        .mockResolvedValueOnce('(grep "content")')
        .mockResolvedValueOnce("<<<FINAL>>>\nprocessed\n<<<END>>>");

      const result = await runRLM("test query", "./test-fixtures/small.txt", {
        llmClient: mockLLM,
        maxTurns: 5,
      });

      expect(mockLLM).toHaveBeenCalledTimes(2);
      expect(result).toBe("processed");
    });

    it("should include sandbox output in history", async () => {
      mockLLM
        .mockResolvedValueOnce('(grep "data")')
        .mockResolvedValueOnce("<<<FINAL>>>\nprocessed\n<<<END>>>");

      await runRLM("test query", "./test-fixtures/small.txt", {
        llmClient: mockLLM,
        maxTurns: 5,
      });

      // Second call should include execution output (Turn 1 Output)
      const secondCall = mockLLM.mock.calls[1][0];
      expect(secondCall).toContain("Turn 1");
    });

    it("should stop at maxTurns", async () => {
      mockLLM.mockResolvedValue('(grep "loop")');

      const result = await runRLM("test query", "./test-fixtures/small.txt", {
        llmClient: mockLLM,
        maxTurns: 3,
      });

      expect(mockLLM).toHaveBeenCalledTimes(3);
      expect(result).toContain("Max turns");
    });

    it("should handle sandbox errors gracefully", async () => {
      mockLLM
        // Turn 1: Invalid LC (parse error)
        .mockResolvedValueOnce("(grep")
        // Turn 2: Valid LC search
        .mockResolvedValueOnce('(grep "fixed")')
        // Turn 3: Final answer (accepted after successful code)
        .mockResolvedValueOnce("<<<FINAL>>>\nrecovered\n<<<END>>>");

      const result = await runRLM("test query", "./test-fixtures/small.txt", {
        llmClient: mockLLM,
        maxTurns: 5,
      });

      expect(result).toBe("recovered");
    });

    // NOTE: Now uses LC syntax since RLM requires LC terms
    it("should feed errors back for self-correction", async () => {
      mockLLM
        // Turn 1: Invalid LC syntax (unbalanced parens)
        .mockResolvedValueOnce("(grep")
        // Turn 2: Model sees error and fixes
        .mockResolvedValueOnce('(grep "test")')
        // Turn 3: Success
        .mockResolvedValueOnce("<<<FINAL>>>\nFixed and completed\n<<<END>>>");

      const result = await runRLM("test query", "./test-fixtures/small.txt", {
        llmClient: mockLLM,
        maxTurns: 5,
      });

      // Second call should include parse error message
      const secondCall = mockLLM.mock.calls[1][0];
      expect(secondCall).toMatch(/error|parse|syntax/i);

      // Model should recover
      expect(result).toBe("Fixed and completed");
    });

    // NOTE: Now uses LC syntax - tests LC parse error context
    it("should include helpful error context for model recovery", async () => {
      mockLLM
        .mockResolvedValueOnce('(grep "test" "extra_arg")')  // Invalid: grep takes one arg
        .mockResolvedValueOnce("<<<FINAL>>>\nrecovered\n<<<END>>>");

      await runRLM("test query", "./test-fixtures/small.txt", {
        llmClient: mockLLM,
        maxTurns: 5,
      });

      const secondCall = mockLLM.mock.calls[1][0];
      // Error message should help model understand what went wrong
      expect(secondCall).toMatch(/error|parse|syntax|argument/i);
    });

    // SKIP: Infinite loop timeout test requires JavaScript execution
    // LC execution doesn't support arbitrary code loops
    it.skip("should respect turnTimeoutMs", async () => {
      mockLLM.mockResolvedValueOnce("```typescript\nwhile(true){}\n```");

      const start = Date.now();
      await runRLM("test query", "./test-fixtures/small.txt", {
        llmClient: mockLLM,
        maxTurns: 1,
        turnTimeoutMs: 200,
      });
      const elapsed = Date.now() - start;

      expect(elapsed).toBeLessThan(1000);
    });

    // FINAL_VAR resolution test removed: legacy marker deleted along with the
    // JS-sandbox memory buffer. Nucleus adapter returns answers via <<<FINAL>>>
    // delimiters only.

    // NOTE: Now uses LC syntax
    it("should accumulate history across turns", async () => {
      mockLLM
        .mockResolvedValueOnce('(grep "test")')
        .mockResolvedValueOnce('(grep "another")')
        .mockResolvedValueOnce("<<<FINAL>>>\ndone\n<<<END>>>");

      await runRLM("test query", "./test-fixtures/small.txt", {
        llmClient: mockLLM,
        maxTurns: 5,
      });

      // Third call should have full history
      const thirdCall = mockLLM.mock.calls[2][0];
      expect(thirdCall).toContain("Turn"); // Should reference earlier turns
    });

    // SKIP: maxSubCalls test doesn't apply to LC execution
    // LC terms don't make sub-LLM calls - they get compiled to JS
    it.skip("should enforce maxSubCalls per turn", async () => {
      // Create a separate mock for sub-LLM calls
      let subCallCount = 0;
      const trackingLLM = vi.fn().mockImplementation((prompt: string) => {
        // First call is the main RLM turn
        if (prompt.includes("SYSTEM:")) {
          subCallCount = 0;
          return Promise.resolve(`\`\`\`typescript
          // Try to make 100 sub-calls
          for (let i = 0; i < 100; i++) {
            await llm_query("call " + i);
          }
        \`\`\``);
        }
        // Second main call (after error)
        if (prompt.includes("Turn 1 Sandbox")) {
          return Promise.resolve("<<<FINAL>>>\nlimited\n<<<END>>>");
        }
        // Sub-LLM calls
        subCallCount++;
        return Promise.resolve(`sub-response ${subCallCount}`);
      });

      await runRLM("test query", "./test-fixtures/small.txt", {
        llmClient: trackingLLM,
        maxTurns: 5,
        maxSubCalls: 5,
      });

      // Find the call that contains the error message
      const callWithError = trackingLLM.mock.calls.find(
        (call) =>
          call[0] &&
          (call[0].includes("limit") ||
            call[0].includes("exceeded") ||
            call[0].includes("Max"))
      );
      expect(callWithError).toBeDefined();
    });

    it("should handle file read errors", async () => {
      const result = await runRLM("test query", "./nonexistent-file.txt", {
        llmClient: mockLLM,
        maxTurns: 1,
      });

      expect(result).toMatch(/error|not found|ENOENT/i);
      expect(mockLLM).not.toHaveBeenCalled();
    });
  });
});
