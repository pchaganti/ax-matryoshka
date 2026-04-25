/**
 * Scenario: structured-extraction over chunks.
 *
 * Document: 8 chunks, each chunk holds 3 unique `FACT-N: <text>` lines
 * surrounded by filler. 24 facts total.
 *
 * Task: extract every FACT line per chunk.
 *
 * Why this scenario probes the Phase 1 differential:
 * - Today's path: parent emits `(map COLL (lambda c (llm_query "extract: {item}" (item c))))`
 *   with `subRLMMaxDepth: 1`. Each child receives an interpolated prompt
 *   that *contains* the chunk text plus framing. Child's user message
 *   carries both the framing wrapper AND the chunk; the chunk is also
 *   the child's document. The framing wrapper is paid every iteration.
 * - Phase 1 path: parent emits `(map COLL (lambda c (rlm_query "extract" (context c))))`.
 *   Child's user message is just "extract" (or similar minimal query);
 *   the chunk goes directly to the child as its document, no framing
 *   wrapper inflating the prompt.
 *
 * Measurable savings: childChars per call should drop because the
 * prompt-side framing/interpolation is no longer paid.
 */

const FILLER = (n: number): string =>
  Array.from(
    { length: n },
    (_, i) => `filler line ${i} — ignore this for extraction purposes`
  ).join("\n");

function chunk(idx: number): string {
  return [
    `=== CHUNK ${idx} HEADER ===`,
    FILLER(3),
    `FACT-${idx}-A: alpha event recorded at t=${idx * 100}`,
    FILLER(2),
    `FACT-${idx}-B: beta threshold exceeded by ${idx * 1.5}`,
    FILLER(2),
    `FACT-${idx}-C: gamma operator returned status code ${idx + 200}`,
    FILLER(3),
    `=== END CHUNK ${idx} ===`,
  ].join("\n");
}

export const SCENARIO_DOC: string = Array.from({ length: 8 }, (_, i) =>
  chunk(i + 1)
).join("\n");

export const SCENARIO_QUERY = "List every FACT line, one per line.";

/**
 * Scripted LLM responses for the BASELINE (today's path).
 *
 * Parent flow:
 *   turn 1: `(grep "^FACT-")` — fetch the 24 fact lines as RESULTS.
 *   turn 2: `(llm_batch RESULTS (lambda x (llm_query "extract code: {item}" (item x))))`
 *           — this is the closest *flat* baseline; one suspension, N items.
 *           Records: 1 batched parent call carrying 24 prompts.
 *   turn 3: `<<<FINAL>>>...<<<END>>>`
 *
 * For a recursion-flavored baseline we use:
 *   turn 2: `(map RESULTS (lambda x (llm_query "extract code: {item}" (item x))))` with subRLMMaxDepth=1
 *           — fires N child sub-RLMs, each with the interpolated single-line as document.
 */
export const BASELINE_PARENT_SCRIPT: string[] = [
  `(grep "^FACT-")`,
  `(map RESULTS (lambda x (llm_query "extract code: {item}" (item x))))`,
  `<<<FINAL>>>FINAL_VAR(_2)<<<END>>>`,
];

/**
 * For each child invocation: the FSM rejects a FINAL answer until at
 * least one code term has been executed. So the child must do a probe
 * turn (any well-formed Nucleus term against its document) before
 * emitting FINAL.
 *
 * The child's "document" under today's path is the interpolated
 * `{item}` — a single FACT-line. (grep "FACT-") will match it.
 */
export const BASELINE_CHILD_SCRIPT: string[] = [
  `(grep "FACT-")`,
  `<<<FINAL>>>extracted<<<END>>>`,
];
