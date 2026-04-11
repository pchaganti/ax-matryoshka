import { describe, it, expect, vi } from "vitest";
import { FSMEngine } from "../../src/fsm/engine.js";
import { buildRLMSpec, createInitialContext, type RLMContext } from "../../src/fsm/rlm-states.js";
import type { ModelAdapter } from "../../src/adapters/types.js";
import type { SolverTools } from "../../src/logic/lc-solver.js";

function makeMockAdapter(overrides?: Partial<ModelAdapter>): ModelAdapter {
  return {
    name: "mock",
    buildSystemPrompt: () => "system prompt",
    extractCode: (response: string) => {
      // Extract S-expression from response
      const match = response.match(/\([\s\S]+\)/);
      return match ? match[0] : null;
    },
    extractFinalAnswer: (response: string) => {
      const match = response.match(/<<<FINAL>>>([\s\S]*?)<<<END>>>/);
      return match ? match[1].trim() : null;
    },
    getNoCodeFeedback: () => "Please provide a Nucleus command.",
    getErrorFeedback: (error: string) => `Error: ${error}`,
    getSuccessFeedback: () => "Good progress.",
    getRepeatedCodeFeedback: () => "Don't repeat the same code.",
    ...overrides,
  };
}

function makeMockTools(content: string): SolverTools {
  const lines = content.split("\n");
  return {
    grep: (pattern: string) => {
      const regex = new RegExp(pattern, "gi");
      return lines.flatMap((line, i) => {
        const match = line.match(regex);
        return match ? [{ match: match[0], line, lineNum: i + 1, index: 0, groups: [] }] : [];
      });
    },
    fuzzy_search: () => [],
    bm25: () => [],
    semantic: () => [],
    text_stats: () => ({
      length: content.length,
      lineCount: lines.length,
      sample: { start: "", middle: "", end: "" },
    }),
    context: content,
    lines,
  };
}

const mockSandbox = {
  execute: async () => ({ result: null, logs: [] }),
  dispose: () => {},
} as any;

describe("RLM FSM States", () => {
  describe("basic query → answer flow", () => {
    it("should complete when LLM provides code then final answer", async () => {
      const document = "Total revenue: $5,000\nExpenses: $3,000\nProfit: $2,000";
      let turnNum = 0;

      const llmResponses = [
        '(grep "Total")',
        '<<<FINAL>>>Total revenue: $5,000<<<END>>>',
      ];

      const ctx = createInitialContext({
        query: "What is the total revenue?",
        adapter: makeMockAdapter(),
        llmClient: async () => llmResponses[turnNum++] || "",
        solverTools: makeMockTools(document),
        sandbox: mockSandbox,
        systemPrompt: "system",
        userMessage: "Query: What is the total revenue?",
        maxTurns: 5,
        sessionId: "test",
        log: () => {},
      });

      const engine = new FSMEngine<RLMContext>();
      const result = await engine.run(buildRLMSpec(), ctx);
      expect(result.result).not.toBeNull();
      expect(result.result).toContain("Total revenue");
    });
  });

  describe("error recovery", () => {
    it("should recover from parse errors and continue", async () => {
      const document = "value: 42";
      let turnNum = 0;

      const llmResponses = [
        '(invalid syntax here',             // parse error
        '(grep "value")',                    // valid code
        '<<<FINAL>>>value: 42<<<END>>>',    // final answer
      ];

      const ctx = createInitialContext({
        query: "What is the value?",
        adapter: makeMockAdapter(),
        llmClient: async () => llmResponses[turnNum++] || "",
        solverTools: makeMockTools(document),
        sandbox: mockSandbox,
        systemPrompt: "system",
        userMessage: "Query: What is the value?",
        maxTurns: 5,
        sessionId: "test",
        log: () => {},
      });

      const engine = new FSMEngine<RLMContext>();
      const result = await engine.run(buildRLMSpec(), ctx);
      expect(result.result).not.toBeNull();
      expect(result.result).toContain("42");
      expect(result.turn).toBe(3);
    });
  });

  describe("stuck detection", () => {
    it("should auto-terminate after repeated no-code responses", async () => {
      const document = "data: hello";
      let turnNum = 0;

      const llmResponses = [
        '(grep "data")',         // valid code, produces result
        "I found the data.",     // no code
        "The data is hello.",    // no code
        "It says hello.",        // no code — 3 in a row
      ];

      const ctx = createInitialContext({
        query: "What is the data?",
        adapter: makeMockAdapter(),
        llmClient: async () => llmResponses[turnNum++] || "",
        solverTools: makeMockTools(document),
        sandbox: mockSandbox,
        systemPrompt: "system",
        userMessage: "Query: What is the data?",
        maxTurns: 10,
        sessionId: "test",
        log: () => {},
      });

      const engine = new FSMEngine<RLMContext>();
      const result = await engine.run(buildRLMSpec(), ctx);
      // Should have auto-terminated with last meaningful output
      expect(result.result).not.toBeNull();
    });
  });

  describe("max turns", () => {
    it("should terminate when max turns reached", async () => {
      const document = "data: 1";

      const ctx = createInitialContext({
        query: "What?",
        adapter: makeMockAdapter(),
        llmClient: async () => '(grep "data")',
        solverTools: makeMockTools(document),
        sandbox: mockSandbox,
        systemPrompt: "system",
        userMessage: "Query: What?",
        maxTurns: 3,
        sessionId: "test",
        log: () => {},
      });

      const engine = new FSMEngine<RLMContext>();
      const result = await engine.run(buildRLMSpec(), ctx);
      expect(result.turn).toBe(3);
      // Result may be null (no final answer found within turns) — FSM terminates cleanly
    });
  });

  describe("state trace", () => {
    it("should follow expected state sequence for simple query", async () => {
      const document = "answer: 42";
      let turnNum = 0;

      const llmResponses = [
        '(grep "answer")',
        '<<<FINAL>>>answer: 42<<<END>>>',
      ];

      const ctx = createInitialContext({
        query: "What?",
        adapter: makeMockAdapter(),
        llmClient: async () => llmResponses[turnNum++] || "",
        solverTools: makeMockTools(document),
        sandbox: mockSandbox,
        systemPrompt: "system",
        userMessage: "Query: What?",
        maxTurns: 5,
        sessionId: "test",
        log: () => {},
      });

      const trace: string[] = [];
      const engine = new FSMEngine<RLMContext>();
      await engine.run(buildRLMSpec(), ctx, {
        onTransition: (from, to) => trace.push(`${from}->${to}`),
      });

      // Turn 1: query → parse → validate → execute → analyze → check_final → query
      // Turn 2: query → parse (no code, has FINAL) → done
      expect(trace[0]).toBe("query_llm->parse_response");
      expect(trace).toContain("execute->analyze");
      expect(trace[trace.length - 1]).toMatch(/->done$/);
    });
  });

  describe("code rejection", () => {
    it("should reject final answer before any code execution", async () => {
      const document = "data: 1";
      let turnNum = 0;

      const llmResponses = [
        "<<<FINAL>>>42<<<END>>>",    // immediate answer without code
        '(grep "data")',              // code
        "<<<FINAL>>>data: 1<<<END>>>", // final answer after code
      ];

      const ctx = createInitialContext({
        query: "What?",
        adapter: makeMockAdapter(),
        llmClient: async () => llmResponses[turnNum++] || "",
        solverTools: makeMockTools(document),
        sandbox: mockSandbox,
        systemPrompt: "system",
        userMessage: "Query: What?",
        maxTurns: 5,
        sessionId: "test",
        log: () => {},
      });

      const engine = new FSMEngine<RLMContext>();
      const result = await engine.run(buildRLMSpec(), ctx);
      expect(result.result).toContain("data: 1");
      expect(result.turn).toBe(3); // rejected first, ran code second, accepted third
    });
  });
});
