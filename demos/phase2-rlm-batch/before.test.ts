/**
 * BEFORE — Phase 2 baseline using (map …) with rlm_query (Phase 1).
 *
 * Same task as the after run; the only difference is the parent's
 * recursion form. Sequential `map` fires children one at a time, so
 * total wall time = N × per-item latency.
 *
 * Locks in the wall-clock baseline so after.test.ts can compute a
 * concrete speedup ratio.
 */

import { describe, it, expect } from "vitest";
import { writeFile } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { runBench, fromScript, summarize } from "../phase1-rlm-query/harness.js";
import {
  SCENARIO_DOC,
  SCENARIO_QUERY,
  SEQUENTIAL_PARENT_SCRIPT,
  CHILD_RESPONDER,
  SCENARIO_TOTAL_AUTH,
  SIMULATED_CHILD_LATENCY_MS,
} from "./scenario.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const SNAPSHOT_PATH = join(__dirname, "baseline.json");

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

describe("Phase 2 baseline — sequential (map …) with rlm_query", () => {
  it("captures wall-clock timing for the chunked AUTH-count task", async () => {
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

    const snapshot = {
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
    await writeFile(SNAPSHOT_PATH, JSON.stringify(snapshot, null, 2) + "\n", "utf-8");
    // eslint-disable-next-line no-console
    console.log("[phase2-baseline]", snapshot);

    // Sequential map should produce the right answer (Phase 1 already
    // proved this) AND should take roughly N × per-item latency.
    expect(sum).toBe(SCENARIO_TOTAL_AUTH);
    // 5 chunks × 2 child turns × 100ms = ~1000ms. Allow 2x slack
    // for FSM bookkeeping and scripted-LLM jitter.
    expect(elapsedMs).toBeGreaterThan(800);
  });
});
