/**
 * Phase 4 — child-side output savings via FINAL_VAR.
 *
 * Without FINAL_VAR, a child that produces a large array as its
 * answer must enumerate every entry verbatim in its FINAL response
 * — paying the full payload cost in the child LLM's output tokens.
 * With FINAL_VAR, the child emits a short marker
 * (`<<<FINAL>>>FINAL_VAR(_1)<<<END>>>`) and the FSM expands the
 * resolved binding server-side. Same payload reaches the parent;
 * the child's last LLM call is N times cheaper.
 *
 * Demo design:
 *   - Doc with 100 TAG-N lines (~1.6KB).
 *   - Parent fires (rlm_query "extract" (context (context 0))).
 *   - Baseline child finals by inlining all 100 tags as text.
 *   - Phase 4 child finals via FINAL_VAR(_1) — server-side expansion.
 *
 * Pass criteria: child's final-response chars drop ≥80% in Phase 4
 * vs baseline. The parent receives an equivalent payload either way.
 */

import type { Responder } from "../phase1-rlm-query/harness.js";

const TAG_COUNT = 100;
export const SCENARIO_DOC: string = Array.from(
  { length: TAG_COUNT },
  (_, i) => `TAG-${i + 1}: data point ${i + 1}`
).join("\n");

export const SCENARIO_QUERY = "Extract every TAG line.";

export const PARENT_SCRIPT: string[] = [
  `(rlm_query "extract every TAG line" (context (context 0)))`,
  `<<<FINAL>>>FINAL_VAR(_1)<<<END>>>`,
];

/**
 * Generate the inlined-array FINAL string a baseline child has to
 * emit when it can't use FINAL_VAR. We pre-render the JSON of the
 * array of grep-result objects so the test's "child output bytes"
 * faithfully represent what a real LLM would have to produce.
 */
function renderInlineFinal(): string {
  const records = Array.from({ length: TAG_COUNT }, (_, i) => ({
    match: `TAG-${i + 1}`,
    line: `TAG-${i + 1}: data point ${i + 1}`,
    lineNum: i + 1,
    index: 0,
    groups: [],
  }));
  return `<<<FINAL>>>${JSON.stringify(records, null, 2)}<<<END>>>`;
}

const INLINE_FINAL = renderInlineFinal();

/** Baseline child responder: inlines everything in FINAL. */
export const BASELINE_CHILD_RESPONDER: Responder = (_prompt, turn) => {
  if (turn === 1) return `(grep "TAG-")`;
  return INLINE_FINAL;
};

/** Phase 4 child responder: short FINAL_VAR marker. */
export const PHASE4_CHILD_RESPONDER: Responder = (_prompt, turn) => {
  if (turn === 1) return `(grep "TAG-")`;
  return `<<<FINAL>>>FINAL_VAR(_1)<<<END>>>`;
};

export const EXPECTED_TAG_COUNT = TAG_COUNT;
