/**
 * Phase 5 — runaway-query benefit demo.
 *
 * Without resource limits a recursive rlm_query that keeps spawning
 * child sessions indefinitely would run until the FSM's hard 5-minute
 * ceiling. With limits, the same query terminates in <= 1.2× the
 * configured timeout AND surfaces the best partial work.
 *
 * The scenario: a parent that keeps emitting (rlm_query …) with the
 * same prompt. Each child is itself slow. Without timeout, this
 * would burn ~30 seconds (5 children × 6 maxTurns × 1s sleep).
 * With maxTimeoutMs=500, we want it to bail under 600ms with the
 * latest grep result still visible.
 */

import type { Responder } from "../phase1-rlm-query/harness.js";

export const SCENARIO_DOC = ["TOKEN-A", "TOKEN-B", "TOKEN-C"].join("\n");
export const SCENARIO_QUERY = "List the tokens.";

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/**
 * Parent script. Turn 1: a useful grep that yields a binding. Turn 2+:
 * a long sleep then another rlm_query — would spiral indefinitely
 * without the timeout cap.
 *
 * The grep on turn 1 is intentional: it populates ctx.bestPartialAnswer
 * with the TOKEN matches so the abort string can surface them.
 */
export const PARENT_RESPONDER: Responder = async (_p, turn) => {
  if (turn === 1) {
    await sleep(50);
    return `(grep "TOKEN-")`;
  }
  // Subsequent turns simulate a runaway: long sleep then another
  // rlm_query that goes nowhere productive.
  await sleep(250);
  return `(rlm_query "ignored" (context (context 0)))`;
};

/** Child responder — also slow so a recursive cascade compounds. */
export const CHILD_RESPONDER: Responder = async () => {
  await sleep(200);
  return `<<<FINAL>>>n/a<<<END>>>`;
};

export const MAX_TIMEOUT_MS = 500;
