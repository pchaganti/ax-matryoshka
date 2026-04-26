/**
 * Phase 2 wall-clock concurrency benchmark.
 *
 * Same per-chunk task as Phase 1 scenario A (count AUTH lines per
 * chunk via grep over a clean handle context), but the parent uses
 * `(rlm_batch …)` instead of `(map …)` so the children fan out
 * concurrently. Same correctness gate. Plus a wall-clock gate that
 * catches a future refactor accidentally serializing the dispatch.
 *
 * The scripted child is rate-limited via `setTimeout` so the test
 * has a deterministic per-item latency to amplify the
 * sequential-vs-concurrent delta.
 */

import type { Responder } from "../phase1-rlm-query/harness.js";
import { runBench, fromScript, summarize } from "../phase1-rlm-query/harness.js";

const CHUNK_AUTH_COUNTS: readonly number[] = [2, 1, 3, 2, 1, 2, 3, 2];
export const SCENARIO_TOTAL_AUTH = CHUNK_AUTH_COUNTS.reduce((a, b) => a + b, 0); // 16

const FILLER = (n: number, idx: number): string =>
  Array.from({ length: n }, (_, i) => `info: chunk ${idx} heartbeat ${i}`).join(
    "\n"
  );

function buildChunk(idx: number, authCount: number): string {
  const lines: string[] = [`=== chunk ${idx} ===`, FILLER(2, idx)];
  for (let i = 1; i <= authCount; i++) {
    lines.push(`AUTH: token-failure-${idx}-${i} at ${idx * 100 + i}ms`);
    lines.push(`info: chunk ${idx} between ${i}`);
  }
  lines.push(FILLER(1, idx), `=== end chunk ${idx} ===`);
  return lines.join("\n");
}

export const SCENARIO_DOC: string = CHUNK_AUTH_COUNTS.map((n, i) =>
  buildChunk(i + 1, n)
).join("\n");

export const SCENARIO_QUERY = "Per chunk, count AUTH lines.";

/** Per-call simulated child latency. 100ms × N items @ concurrency 4 = ~200ms. */
export const SIMULATED_CHILD_LATENCY_MS = 100;

/** Sequential script (Phase 1) — uses (map …) with rlm_query. */
export const SEQUENTIAL_PARENT_SCRIPT: string[] = [
  `(chunk_by_lines 15)`,
  `(map RESULTS (lambda c (rlm_query "count AUTH lines" (context c))))`,
  `<<<FINAL>>>FINAL_VAR(_2)<<<END>>>`,
];

/** Concurrent script (Phase 2) — uses (rlm_batch …). */
export const CONCURRENT_PARENT_SCRIPT: string[] = [
  `(chunk_by_lines 15)`,
  `(rlm_batch RESULTS (lambda c (rlm_query "count AUTH lines" (context c))))`,
  `<<<FINAL>>>FINAL_VAR(_2)<<<END>>>`,
];

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/**
 * Child responder shared by both modes. Sleeps to simulate latency,
 * then counts AUTH matches from its prior-turn grep result.
 *
 * Same shape as Phase 1 scenario A's child responder — the only
 * difference is the artificial latency, which makes the
 * sequential-vs-concurrent delta measurable in tests.
 */
export const CHILD_RESPONDER: Responder = async (prompt, turn) => {
  await sleep(SIMULATED_CHILD_LATENCY_MS);
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

export async function generateBaseline() {
  const start = Date.now();
  const { result, metrics } = await runBench({
    query: SCENARIO_QUERY,
    documentContent: SCENARIO_DOC,
    parentResponder: fromScript(SEQUENTIAL_PARENT_SCRIPT),
    childResponder: CHILD_RESPONDER,
    subRLMMaxDepth: 1,
    maxTurns: 6,
  });
  const elapsedMs = Date.now() - start;

  const counts = parseCountArray(result);
  const sum = counts ? counts.reduce((a, b) => a + b, 0) : null;

  return {
    mode: "baseline",
    scenario: "concurrent-map-vs-batch",
    simulatedLatencyMs: SIMULATED_CHILD_LATENCY_MS,
    docChars: SCENARIO_DOC.length,
    ...summarize(metrics),
    elapsedMs,
    result,
    expectedTotalAuth: SCENARIO_TOTAL_AUTH,
    observedSum: sum,
    correct: sum === SCENARIO_TOTAL_AUTH,
  };
}
