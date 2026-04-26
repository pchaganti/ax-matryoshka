/**
 * Scenario A — scaled handle-as-document benchmark.
 *
 * Same failure mode as scenario-b (child grep with `^anchor` over a
 * JSON-stringified handle returns 0 matches), scaled across N chunks.
 * Combines a binary correctness gate with a multi-call token measure
 * so Phase 1 has to win on both axes to pass:
 *
 *   - Today's path: parent's `(map chunks (lambda c (llm_query "..." (chunk c))))`
 *     hands each child a JSON-stringified chunk as document. The child
 *     `(grep "^AUTH:")` matches zero per chunk. Final answer: array of 8
 *     zeros (wrong).
 *   - Phase 1: `(map chunks (lambda c (rlm_query "..." (context c))))`
 *     hands each child a clean line-oriented document. The child grep
 *     returns the actual AUTH count per chunk. Final answer: array of
 *     8 correct counts.
 *
 * Doc layout: 8 chunks, each chunk is a mini-log with 1–3 AUTH lines
 * plus filler. Total AUTH lines = 16, distributed across the 8 chunks.
 *
 * Pass criteria:
 *   - correctness: child's reported counts equal the per-chunk ground
 *     truth (sum = 16) instead of all-zeros.
 *   - tokens: per-call child prompt size drops measurably. Captured
 *     for inspection but not gated as a hard threshold — correctness
 *     is the primary gate; tokens are descriptive.
 */

import type { Responder } from "./harness.js";
import { runBench, fromScript, summarize } from "./harness.js";

/**
 * Per-chunk AUTH counts that the child should report when it can grep
 * cleanly. This is the ground truth Phase 1 must produce.
 */
export const SCENARIO_A_CHUNK_AUTH_COUNTS: readonly number[] = [
  2, 1, 3, 2, 1, 2, 3, 2,
];
export const SCENARIO_A_TOTAL_AUTH = SCENARIO_A_CHUNK_AUTH_COUNTS.reduce(
  (a, b) => a + b,
  0
); // 16

const FILLER = (n: number, idx: number): string =>
  Array.from(
    { length: n },
    (_, i) => `info: chunk ${idx} heartbeat ${i}`
  ).join("\n");

function buildChunk(idx: number, authCount: number): string {
  const lines: string[] = [`=== chunk ${idx} ===`, FILLER(2, idx)];
  for (let i = 1; i <= authCount; i++) {
    lines.push(`AUTH: token-failure-${idx}-${i} at ${idx * 100 + i}ms`);
    lines.push(`info: chunk ${idx} between ${i}`);
  }
  lines.push(FILLER(1, idx), `=== end chunk ${idx} ===`);
  return lines.join("\n");
}

export const SCENARIO_A_DOC: string = SCENARIO_A_CHUNK_AUTH_COUNTS.map(
  (n, i) => buildChunk(i + 1, n)
).join("\n");

export const SCENARIO_A_QUERY = "Per chunk, count AUTH lines.";

/**
 * Parent script — baseline path uses `llm_query` + subRLMMaxDepth=1.
 *
 * Turn 1: chunk the doc into 8 ~equal slices (the doc above is ~120
 * lines, so chunk_by_lines 15 produces ~8 chunks).
 * Turn 2: per-chunk `llm_query` so each child sub-RLM works on its
 * chunk. The child returns the count it observed.
 * Turn 3: emit FINAL with the array of counts.
 */
export const SCENARIO_A_BASELINE_PARENT_SCRIPT: string[] = [
  `(chunk_by_lines 15)`,
  `(map RESULTS (lambda c (llm_query "count AUTH lines in this chunk" (chunk c))))`,
  `<<<FINAL>>>FINAL_VAR(_2)<<<END>>>`,
];

/**
 * Parent script — Phase 1 path uses `rlm_query` with handle-as-context.
 *
 * Same shape; the child receives the chunk as its working document
 * directly instead of JSON-interpolated into a prompt string.
 */
export const SCENARIO_A_PHASE1_PARENT_SCRIPT: string[] = [
  `(chunk_by_lines 15)`,
  `(map RESULTS (lambda c (rlm_query "count AUTH lines" (context c))))`,
  `<<<FINAL>>>FINAL_VAR(_2)<<<END>>>`,
];

/**
 * Shared child responder — same in both modes. The child:
 *   turn 1: `(grep "^AUTH:")` over its document
 *   turn 2: counts the matches reported in the prior-turn feedback
 *           and emits that count as FINAL.
 *
 * This makes the test honest: whatever the child reports is what its
 * grep actually saw. Today's path → JSON noise → 0 per chunk. Phase
 * 1 → clean lines → real counts.
 */
export const SCENARIO_A_CHILD_RESPONDER: Responder = (prompt, turn) => {
  if (turn === 1) {
    return `(grep "^AUTH:")`;
  }
  const lastResultIdx = prompt.lastIndexOf("Result:");
  if (lastResultIdx < 0) return `<<<FINAL>>>0<<<END>>>`;
  const tail = prompt.slice(lastResultIdx);
  const matchOccurrences = (tail.match(/"match":/g) ?? []).length;
  return `<<<FINAL>>>${matchOccurrences}<<<END>>>`;
};

function parseCountArray(result: string): number[] | null {
  try {
    const parsed = JSON.parse(result);
    if (
      Array.isArray(parsed) &&
      parsed.every((s) => typeof s === "string" && /^\d+$/.test(s))
    ) {
      return parsed.map(Number);
    }
  } catch {
    // fall through
  }
  return null;
}

export async function generateBaseline(baselinePath: string) {
  const { result, metrics } = await runBench({
    query: SCENARIO_A_QUERY,
    documentContent: SCENARIO_A_DOC,
    parentResponder: fromScript(SCENARIO_A_BASELINE_PARENT_SCRIPT),
    childResponder: SCENARIO_A_CHILD_RESPONDER,
    subRLMMaxDepth: 1,
    maxTurns: 6,
  });

  const counts = parseCountArray(result);
  const sum = counts ? counts.reduce((a, b) => a + b, 0) : null;

  return {
    mode: "baseline",
    scenario: "scaled-handle-as-document",
    docChars: SCENARIO_A_DOC.length,
    docLines: SCENARIO_A_DOC.split("\n").length,
    ...summarize(metrics),
    result,
    expectedTotalAuth: SCENARIO_A_TOTAL_AUTH,
    observedSum: sum,
    correct: sum === SCENARIO_A_TOTAL_AUTH,
  };
}
