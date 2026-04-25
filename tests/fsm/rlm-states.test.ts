import { describe, it, expect } from "vitest";
import { FSMEngine } from "../../src/fsm/engine.js";
import { buildRLMSpec, createInitialContext, type RLMContext } from "../../src/fsm/rlm-states.js";
import type { ModelAdapter } from "../../src/adapters/types.js";
import type { SolverTools } from "../../src/logic/lc-solver.js";

function makeMockAdapter(overrides?: Partial<ModelAdapter>): ModelAdapter {
  return {
    name: "mock",
    buildSystemPrompt: () => "system prompt",
    extractCode: (response: string) => {
      // Strip any FINAL markers first so we don't accidentally match the
      // `(name)` inside a `FINAL_VAR(name)` payload. The real nucleus
      // adapter does the equivalent via its KNOWN_COMMANDS allowlist.
      const stripped = response.replace(/<<<FINAL>>>[\s\S]*?<<<END>>>/g, "");
      const match = stripped.match(/\([\s\S]+\)/);
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

  describe("FINAL_VAR(name) handle deref", () => {
    // The FINAL_VAR primitive lets the LLM end the loop without inlining
    // a large binding into its <<<FINAL>>> payload. Instead of:
    //   <<<FINAL>>>[{line: "...", lineNum: 1}, ...thousand more items]<<<END>>>
    // it can emit:
    //   <<<FINAL>>>FINAL_VAR(_1)<<<END>>>
    // and the FSM resolves `_1` from `ctx.solverBindings` at the final-answer
    // boundary. This is critical for the paper's "unbounded output tokens"
    // claim — without it, very large final answers die at the root LLM's
    // context boundary.

    it("resolves FINAL_VAR(_N) against a prior binding", async () => {
      // Three ERROR lines → _1 is an array of three grep hits.
      // The LLM ends with FINAL_VAR(_1) which should expand to the array.
      const document = "ERROR: disk full\nINFO: ok\nERROR: timeout\nERROR: 500";
      let turnNum = 0;
      const llmResponses = [
        '(grep "ERROR")',
        "<<<FINAL>>>FINAL_VAR(_1)<<<END>>>",
      ];

      const ctx = createInitialContext({
        query: "List the errors",
        adapter: makeMockAdapter(),
        llmClient: async () => llmResponses[turnNum++] || "",
        solverTools: makeMockTools(document),
        systemPrompt: "system",
        userMessage: "Query: list errors",
        maxTurns: 5,
        sessionId: "test",
        log: () => {},
      });

      const engine = new FSMEngine<RLMContext>();
      const result = await engine.run(buildRLMSpec(), ctx);
      expect(result.result).not.toBeNull();
      // The expanded answer should contain evidence of all 3 ERROR lines
      expect(result.result).toContain("disk full");
      expect(result.result).toContain("timeout");
      expect(result.result).toContain("500");
      // And the literal marker should be gone
      expect(result.result).not.toContain("FINAL_VAR(_1)");
    });

    it("resolves FINAL_VAR(RESULTS) to the RESULTS binding", async () => {
      const document = "alpha 1\nbeta 2\ngamma 3";
      let turnNum = 0;
      const llmResponses = [
        '(grep "alpha")',
        "<<<FINAL>>>FINAL_VAR(RESULTS)<<<END>>>",
      ];

      const ctx = createInitialContext({
        query: "What did grep find?",
        adapter: makeMockAdapter(),
        llmClient: async () => llmResponses[turnNum++] || "",
        solverTools: makeMockTools(document),
        systemPrompt: "system",
        userMessage: "Query: grep",
        maxTurns: 5,
        sessionId: "test",
        log: () => {},
      });

      const engine = new FSMEngine<RLMContext>();
      const result = await engine.run(buildRLMSpec(), ctx);
      expect(result.result).toContain("alpha 1");
      expect(result.result).not.toContain("FINAL_VAR(RESULTS)");
    });

    it("allows framing text around FINAL_VAR(name)", async () => {
      // The LLM can wrap the marker with its own framing, e.g. "Here is the
      // list: FINAL_VAR(_1) — done". The FSM should substitute in place.
      const document = "foo\nbar\nbaz";
      let turnNum = 0;
      const llmResponses = [
        '(grep "ba")',
        "<<<FINAL>>>Here are the matches: FINAL_VAR(_1) — done.<<<END>>>",
      ];

      const ctx = createInitialContext({
        query: "Find 'ba'",
        adapter: makeMockAdapter(),
        llmClient: async () => llmResponses[turnNum++] || "",
        solverTools: makeMockTools(document),
        systemPrompt: "system",
        userMessage: "Query: find",
        maxTurns: 5,
        sessionId: "test",
        log: () => {},
      });

      const engine = new FSMEngine<RLMContext>();
      const result = await engine.run(buildRLMSpec(), ctx);
      expect(result.result).toContain("Here are the matches:");
      expect(result.result).toContain("— done.");
      expect(result.result).toContain("bar");
      expect(result.result).toContain("baz");
      expect(result.result).not.toContain("FINAL_VAR(_1)");
    });

    it("surfaces a clear error when FINAL_VAR references an unknown binding", async () => {
      // Phase 4: don't silently pass through `FINAL_VAR(unknown)` as
      // literal text — that lets an unresolved marker flow as if it
      // were a valid answer. Replace it with a clear bracketed
      // error string the user (or a parent rlm_query) can detect.
      const document = "foo";
      let turnNum = 0;
      const llmResponses = [
        '(grep "foo")',
        "<<<FINAL>>>Result: FINAL_VAR(_99)<<<END>>>",
      ];

      const ctx = createInitialContext({
        query: "Find foo",
        adapter: makeMockAdapter(),
        llmClient: async () => llmResponses[turnNum++] || "",
        solverTools: makeMockTools(document),
        systemPrompt: "system",
        userMessage: "Query: find",
        maxTurns: 5,
        sessionId: "test",
        log: () => {},
      });

      const engine = new FSMEngine<RLMContext>();
      const result = await engine.run(buildRLMSpec(), ctx);
      expect(result.result).not.toBeNull();
      // The literal marker is REPLACED with a clear bracketed error.
      expect(result.result).not.toMatch(/FINAL_VAR\(_99\)/);
      expect(result.result).toMatch(/FINAL_VAR error|unknown binding/i);
      expect(result.result).toContain("_99");
    });

    it("resolves FINAL_VAR(_N) even when it's the only thing in the final answer", async () => {
      // Edge case: answer is literally "FINAL_VAR(_1)" with no framing.
      // Regex replace should still work.
      const document = "x=42";
      let turnNum = 0;
      const llmResponses = [
        '(grep "x=")',
        "<<<FINAL>>>FINAL_VAR(_1)<<<END>>>",
      ];

      const ctx = createInitialContext({
        query: "Extract value",
        adapter: makeMockAdapter(),
        llmClient: async () => llmResponses[turnNum++] || "",
        solverTools: makeMockTools(document),
        systemPrompt: "system",
        userMessage: "Query: extract",
        maxTurns: 5,
        sessionId: "test",
        log: () => {},
      });

      const engine = new FSMEngine<RLMContext>();
      const result = await engine.run(buildRLMSpec(), ctx);
      expect(result.result).toContain("x=42");
    });
  });
});
