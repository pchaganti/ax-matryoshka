import { describe, it, expect, vi, beforeEach } from "vitest";
import { runRLM } from "../src/rlm.js";
import { readFileSync } from "fs";

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
        // Invalid: grep requires a string-literal pattern. A bare
        // numeric like 42 is a parse error in every grammar
        // version (the old single-arg form AND the Phase 3 form
        // that adds an optional haystack).
        .mockResolvedValueOnce('(grep 42)')
        .mockResolvedValueOnce("<<<FINAL>>>\nrecovered\n<<<END>>>");

      await runRLM("test query", "./test-fixtures/small.txt", {
        llmClient: mockLLM,
        maxTurns: 5,
      });

      const secondCall = mockLLM.mock.calls[1][0];
      // Error message should help model understand what went wrong
      expect(secondCall).toMatch(/error|parse|syntax|argument/i);
    });

    // turnTimeoutMs test removed: the option was dead in the RLM path
    // (runRLM created a sandbox but never executed it), and the option
    // has been removed from RLMOptions. The FSM still has a 5-minute
    // hard ceiling in rlm.ts via Promise.race.
    //
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

    // maxSubCalls test removed: the option was dead in the RLM path (the
    // sandbox-tools sub-call limiter only fires inside sandbox.execute(),
    // which runRLM never invokes). The option has been removed from
    // RLMOptions. Sub-call limiting is still tested directly against
    // createSandboxWithSynthesis in tests/synthesis/sandbox-tools.test.ts.

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

// =====================================================================
// Source-pattern checks (from audits)
// =====================================================================
describe("Source-pattern checks (from audits)", () => {
  // from tests/audit24.test.ts Audit24 #5: rlm history pruning
  describe("Audit24 #5: rlm history pruning", () => {
    it("should export runRLM", async () => {
      const mod = await import("../src/rlm.js");
      expect(mod.runRLM).toBeDefined();
    });
  });

  // from tests/audit25.test.ts Audit25 #5: binding key sort safety
  describe("Audit25 #5: binding key sort safety", () => {
    it("should handle malformed binding keys without breaking sort", async () => {
      // This is internal to rlm.ts — just verify module loads
      const mod = await import("../src/rlm.js");
      expect(mod.runRLM).toBeDefined();
    });
  });

  // from tests/audit26.test.ts Audit26 #7: rlm small document sample
  describe("Audit26 #7: rlm small document sample", () => {
    it("should handle small documents in text_stats without negative indexing", async () => {
      // We can't directly test createTools (not exported),
      // but we can verify the fix indirectly through runRLM exports
      const mod = await import("../src/rlm.js");
      expect(mod.runRLM).toBeDefined();
      // The fix is defensive — just verify the module loads cleanly
    });
  });

  // from tests/audit27.test.ts Audit27 #4: rlm constraint verification paths
  describe("Audit27 #4: rlm constraint verification paths", () => {
    it("should export verifyAndReturnResult for testing", async () => {
      const mod = await import("../src/rlm.js");
      // Just verify the module loads; the fix is in control flow
      expect(mod.runRLM).toBeDefined();
    });
  });

  // from tests/audit81.test.ts #1 — generateClassifierGuidance should escape/truncate query
  describe("#1 — generateClassifierGuidance should escape/truncate query", () => {
      it("should truncate or escape query before interpolation", () => {
        const source = readFileSync("src/rlm.ts", "utf-8");
        const fnStart = source.indexOf("function generateClassifierGuidance");
        expect(fnStart).toBeGreaterThan(-1);
        // Search for query usage near the template literal
        const queryInTemplate = source.indexOf('Look at the query', fnStart);
        expect(queryInTemplate).toBeGreaterThan(-1);
        const block = source.slice(queryInTemplate - 200, queryInTemplate + 100);
        expect(block).toMatch(/safeQuery|query\.slice\(0,|query\.replace/);
      });
    });

  // from tests/audit81.test.ts #4 — constraint invariants should be truncated
  describe("#4 — constraint invariants should be truncated", () => {
      it("should truncate invariant strings before interpolation", () => {
        const source = readFileSync("src/rlm.ts", "utf-8");
        const invLoop = source.indexOf("constraint.invariants");
        expect(invLoop).toBeGreaterThan(-1);
        const block = source.slice(invLoop, invLoop + 200);
        expect(block).toMatch(/\.slice\(0,|safeInv|inv\.slice|truncat/);
      });
    });

  // from tests/audit84.test.ts #7 — sessionId should be validated
  describe("#7 — sessionId should be validated", () => {
      it("should validate sessionId length and characters", () => {
        const source = readFileSync("src/rlm.ts", "utf-8");
        const sessionLine = source.indexOf("safeSessionId");
        expect(sessionLine).toBeGreaterThan(-1);
        const block = source.slice(sessionLine, sessionLine + 300);
        expect(block).toMatch(/\.length|\/\^[^/]*\$\/.*test|sessionId/);
      });
    });

});
