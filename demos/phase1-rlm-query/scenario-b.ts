/**
 * Scenario B — "currently impossible": handle-as-document for the child.
 *
 * Today's recursion path serializes the binding via `JSON.stringify`
 * and hands the resulting string to the child as both query (truncated
 * to 500 chars) and document. When the parent wants the child to
 * perform LINE-ORIENTED operations (`grep`, `chunk_by_lines`, `lines
 * N M`) over an array of items, today's path fails: the child's
 * document is a JSON blob with brackets/commas/quote-escaping that
 * pollute grep matches and break line-number semantics.
 *
 * Phase 1's `(rlm_query "task" (context $h))` is meant to fix this by
 * loading the handle's content as the child's document in a
 * line-oriented form (one stringified item per line), so the child's
 * document-level primitives work cleanly.
 *
 * The test design: same child responder in both modes. The child
 * - turn 1: emits `(grep "^AUTH:")` against its document
 * - turn 2: reads the grep result from the prior-turn feedback,
 *   counts the matches, emits that count as FINAL.
 *
 * Whatever number the child reports IS the genuine result of its grep.
 * No hardcoding.
 */

import type { Responder } from "./harness.js";

const ENTRY = (cat: string, idx: number): string =>
  `${cat}: incident ${idx} at ${idx * 100}ms`;

export const SCENARIO_B_DOC: string = [
  "info: startup",
  ENTRY("AUTH", 1),
  "info: heartbeat",
  ENTRY("DB", 1),
  ENTRY("AUTH", 2),
  "info: heartbeat",
  ENTRY("NET", 1),
  ENTRY("DB", 2),
  ENTRY("AUTH", 3),
  "info: shutdown",
].join("\n");

export const SCENARIO_B_QUERY = "How many AUTH errors are in the log?";

/** Ground truth: 3 AUTH lines in the doc. */
export const EXPECTED_AUTH_COUNT = 3;

/** Parent prompts the child to count AUTH lines and inlines the answer. */
export const SCENARIO_B_BASELINE_PARENT_SCRIPT: string[] = [
  `(grep "^(AUTH|DB|NET):")`,
  `(llm_query "count AUTH lines from this list" (data RESULTS))`,
  `<<<FINAL>>>FINAL_VAR(_2)<<<END>>>`,
];

export const SCENARIO_B_PHASE1_PARENT_SCRIPT: string[] = [
  `(grep "^(AUTH|DB|NET):")`,
  `(rlm_query "count AUTH lines" (context RESULTS))`,
  `<<<FINAL>>>FINAL_VAR(_2)<<<END>>>`,
];

/**
 * Child responder used by BOTH baseline and phase1. The child:
 *   turn 1: `(grep "^AUTH:")` against its document
 *   turn 2: counts grep matches from the prior-turn feedback's
 *           "Result: [...]" block, emits that count as FINAL.
 *
 * This makes the test measure genuine end-to-end behavior:
 *   - Baseline: child's document is a JSON blob; grep matches 0 lines
 *     because JSON line starts are `[`, `{`, or whitespace, never
 *     `AUTH:`. The child reports 0 — wrong.
 *   - Phase 1: child's document is one entry per line; grep matches
 *     3. The child reports 3 — correct.
 */
export const SCENARIO_B_CHILD_RESPONDER: Responder = (prompt, turn) => {
  if (turn === 1) {
    return `(grep "^AUTH:")`;
  }
  // Extract the most recent "Result: [...]" feedback block from the
  // child's accumulated prompt history. Count the entries by looking
  // at the per-grep-match keys ("match", "line", "lineNum").
  // Feedback format: `Result: [<json>]\n` — we walk back from the end
  // to find the last occurrence so older feedbacks don't double-count.
  const lastResultIdx = prompt.lastIndexOf("Result:");
  if (lastResultIdx < 0) return `<<<FINAL>>>0<<<END>>>`;
  const tail = prompt.slice(lastResultIdx);
  // Each grep result object has a "match" field; count occurrences.
  const matchOccurrences = (tail.match(/"match":/g) ?? []).length;
  return `<<<FINAL>>>${matchOccurrences}<<<END>>>`;
};
