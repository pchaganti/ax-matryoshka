/**
 * Phase 6 — compaction benefit demo.
 *
 * The premise: a long-running query whose accumulated history grows
 * past a model's context window. Without compaction, the FSM's last
 * turns send a prompt larger than what the model can accept. With
 * compaction, the loop summarizes mid-trajectory and continues.
 *
 * In a unit test we don't have a real model context limit, so we
 * simulate one: the scripted LLM returns an "[CONTEXT_OVERFLOW]"
 * error string when the prompt exceeds a configured limit. Without
 * compaction, this happens around turn 4-5 and the run fails.
 * With compaction at a threshold below the simulated limit, the
 * loop trims history before crossing it and the run completes.
 *
 * Pass criteria:
 *   - Baseline: hits the simulated overflow → result is the error
 *     marker (no FINAL).
 *   - Phase 6: completes with a real FINAL answer that includes
 *     the per-turn grep results.
 */

import type { Responder } from "../phase1-rlm-query/harness.js";

/** Simulated model context limit in chars. */
export const SIMULATED_CONTEXT_LIMIT = 6000;

/** Threshold below the sim limit. Compaction fires before overflow. */
export const COMPACTION_THRESHOLD = 4500;

const TAGS = Array.from({ length: 12 }, (_, i) => `TAG-${i + 1}`);
export const SCENARIO_DOC: string = TAGS.flatMap((tag) =>
  Array.from({ length: 8 }, (_, j) => `${tag}-occurrence-${j}: filler ${"x".repeat(40)}`)
).join("\n");

export const SCENARIO_QUERY = "Inspect each tag in turn.";

/**
 * The "model": echoes overflow when the prompt is too large; else
 * runs the scripted FSM responder. Compaction prompts are detected
 * by the canonical prefix and answered with a short summary.
 */
export function makeBoundedLLM(
  responder: Responder
): (prompt: string) => Promise<string> {
  return async (prompt: string): Promise<string> => {
    if (/Summarize your progress so far/.test(prompt)) {
      return "Summary: scanned several tags, found multiple occurrences each.";
    }
    if (prompt.length > SIMULATED_CONTEXT_LIMIT) {
      // The "model" rejects with an overflow signal. Real models
      // would reject with HTTP 400 or similar — we render it as a
      // sentinel string the FSM will treat as an LLM error and
      // surface in subsequent turns. The run never reaches FINAL.
      return `[CONTEXT_OVERFLOW: prompt was ${prompt.length} chars, limit ${SIMULATED_CONTEXT_LIMIT}]`;
    }
    // turn-tracking is owned by the responder caller via inferTurn
    return responder(prompt, 0);
  };
}

/**
 * Parent script: emit a different grep on each turn so history grows
 * with each turn's grep result. By turn 5 the accumulated history
 * exceeds the simulated context limit (without compaction).
 *
 * Final turn: emit FINAL referencing the latest grep binding.
 *
 * Uses a closure counter rather than counting `Bindings:` markers in
 * the prompt — that marker count is invalidated by compaction
 * (post-compaction history is small, marker disappears).
 */
export function buildResponder(): Responder {
  let turn = 0;
  return (prompt) => {
    if (/Summarize your progress so far/.test(prompt)) {
      return "Summary: scanned several tags, found multiple occurrences each.";
    }
    turn++;
    if (turn >= 6) {
      // After 5 grep turns, FINAL referencing the most recent
      // binding (which is `_${turn-1}` since this turn produces _N
      // only for code execution).
      return `<<<FINAL>>>FINAL_VAR(_${turn - 1})<<<END>>>`;
    }
    return `(grep "${TAGS[turn - 1]}-")`;
  };
}
