/**
 * Phase 4 — FINAL_VAR resolution across the parent/child boundary.
 *
 * The existing `expandFinalVar` helper in fsm/rlm-states.ts runs
 * inside the FSM loop after extractFinalAnswer. A child session
 * (rlm_query) runs the same FSM loop, so its FINAL_VAR markers are
 * resolved against the CHILD's bindings before the answer string is
 * returned to the parent's solver as the rlm_query result.
 *
 * What this test file locks in:
 *   1. A child emitting `<<<FINAL>>>FINAL_VAR(_1)<<<END>>>` results in
 *      the parent receiving the *resolved* binding value, not the
 *      literal string `FINAL_VAR(_1)`.
 *   2. Centralization: the same expansion logic runs for both parent
 *      and child without double-expansion or scope confusion. The
 *      child resolves against child bindings; the parent doesn't try
 *      to expand the already-resolved string.
 *   3. Unknown-binding correction: a child emitting
 *      `<<<FINAL>>>FINAL_VAR(nonexistent)<<<END>>>` MUST surface a
 *      clear marker the parent can detect, not silently inline the
 *      literal `FINAL_VAR(nonexistent)` text into the answer.
 */

import { describe, it, expect } from "vitest";
import { runRLMFromContent } from "../../src/rlm.js";
import { createNucleusAdapter } from "../../src/adapters/nucleus.js";

describe("FINAL_VAR resolution across parent/child boundary", () => {
  it("child FINAL_VAR(_1) resolves to child's binding value before reaching parent", async () => {
    // Parent flow: emit (rlm_query "task" (context $context)) once,
    // then FINAL with the child's result inlined via FINAL_VAR(_1).
    // The CHILD finals as <<<FINAL>>>FINAL_VAR(_1)<<<END>>> where _1
    // is a 100-line array from grep. The parent must receive the
    // expanded array, NOT the literal `FINAL_VAR(_1)` string.
    let parentTurn = 0;
    let childTurn = 0;
    const llm = async (prompt: string): Promise<string> => {
      const isChild =
        prompt.startsWith("You are a sub-LLM invoked") ||
        /Query:\s*extract all TAGs/.test(prompt);
      if (isChild) {
        childTurn++;
        // Turn 1: child runs grep over its document → _1 = array
        if (childTurn === 1) return `(grep "TAG-")`;
        // Turn 2: child finals via FINAL_VAR(_1)
        return `<<<FINAL>>>FINAL_VAR(_1)<<<END>>>`;
      }
      parentTurn++;
      if (parentTurn === 1) {
        return `(rlm_query "extract all TAGs" (context (context 0)))`;
      }
      return `<<<FINAL>>>${"FINAL_VAR(_1)"}<<<END>>>`;
    };

    const doc = Array.from({ length: 5 }, (_, i) => `TAG-${i + 1}: item`).join(
      "\n"
    );
    const result = (await runRLMFromContent("find tags", doc, {
      llmClient: llm,
      adapter: createNucleusAdapter(),
      maxTurns: 6,
      ragEnabled: false,
      subRLMMaxDepth: 1,
    })) as string;

    // The parent's final answer is the child's resolved result.
    // It must contain the actual TAG strings, NOT the unexpanded
    // `FINAL_VAR(_1)` literal.
    expect(result).not.toContain("FINAL_VAR(_1)");
    expect(result).toMatch(/TAG-1/);
    expect(result).toMatch(/TAG-5/);
  });

  it("child FINAL_VAR(nonexistent) surfaces a clear error to the parent", async () => {
    // The child emits a FINAL_VAR pointing at a binding that doesn't
    // exist. The current behavior (before the Phase 4 fix) is silent
    // pass-through of the literal `FINAL_VAR(nonexistent)` text. The
    // fix: surface a clear error string the parent can detect.
    let parentTurn = 0;
    let childTurn = 0;
    const llm = async (prompt: string): Promise<string> => {
      const isChild =
        prompt.startsWith("You are a sub-LLM invoked") ||
        /Query:\s*extract/.test(prompt);
      if (isChild) {
        childTurn++;
        if (childTurn === 1) return `(grep "TAG-")`;
        return `<<<FINAL>>>FINAL_VAR(nonexistent)<<<END>>>`;
      }
      parentTurn++;
      if (parentTurn === 1) {
        return `(rlm_query "extract" (context (context 0)))`;
      }
      return `<<<FINAL>>>FINAL_VAR(_1)<<<END>>>`;
    };

    const doc = "TAG-1\nTAG-2";
    const result = (await runRLMFromContent("find tags", doc, {
      llmClient: llm,
      adapter: createNucleusAdapter(),
      maxTurns: 6,
      ragEnabled: false,
      subRLMMaxDepth: 1,
    })) as string;

    // A clear error marker must be present so the parent can detect
    // and react. Silent pass-through of `FINAL_VAR(nonexistent)`
    // would let the literal string flow as an "answer" — a real
    // correctness bug.
    expect(result).toMatch(
      /FINAL_VAR.*error|unknown binding|FINAL_VAR.*not.*found/i
    );
  });
});
