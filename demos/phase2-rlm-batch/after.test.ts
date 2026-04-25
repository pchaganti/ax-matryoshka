/**
 * AFTER — Phase 2 (`rlm_batch …`) wall-clock benefit gate.
 *
 * Same task as before.test.ts; only the parent's recursion form
 * differs. With 4-way concurrency over 5 chunks × 2 child turns each,
 * total wall time should drop from ~1000ms (sequential) to ~250ms
 * (concurrent) — a ≥2x speedup.
 *
 * Pass criteria:
 *   1. Correctness preserved: sum of per-chunk counts equals 16.
 *   2. Wall time ≤ 50% of the baseline timing in baseline.json.
 *
 * Per project rule (correctness > performance): correctness is
 * non-negotiable. The wall-time gate exists to lock in the
 * concurrency property and catch a future refactor that
 * accidentally serializes the dispatch.
 */

import { describe, it, expect } from "vitest";
import { readFile, writeFile } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { runBench, fromScript, summarize } from "../phase1-rlm-query/harness.js";
import {
  SCENARIO_DOC,
  SCENARIO_QUERY,
  CONCURRENT_PARENT_SCRIPT,
  CHILD_RESPONDER,
  SCENARIO_TOTAL_AUTH,
  SIMULATED_CHILD_LATENCY_MS,
} from "./scenario.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const BASELINE_PATH = join(__dirname, "baseline.json");
const AFTER_PATH = join(__dirname, "after.json");

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

describe("Phase 2 — concurrent (rlm_batch …)", () => {
  it("[FAILING UNTIL IMPL] produces correct counts AND >=2x faster than sequential map", async () => {
    const baselineRaw = await readFile(BASELINE_PATH, "utf-8");
    const baseline = JSON.parse(baselineRaw) as {
      elapsedMs: number;
      observedSum: number | null;
    };

    const start = Date.now();
    const { result, metrics } = await runBench({
      query: SCENARIO_QUERY,
      documentContent: SCENARIO_DOC,
      parentResponder: fromScript(CONCURRENT_PARENT_SCRIPT),
      childResponder: CHILD_RESPONDER,
      subRLMMaxDepth: 1,
      maxTurns: 6,
    });
    const elapsedMs = Date.now() - start;

    const counts = parseCountArray(result);
    const sum = counts ? counts.reduce((a, b) => a + b, 0) : null;
    const speedup = baseline.elapsedMs / elapsedMs;

    const snapshot = {
      mode: "phase2",
      scenario: "concurrent-map-vs-batch",
      simulatedLatencyMs: SIMULATED_CHILD_LATENCY_MS,
      docChars: SCENARIO_DOC.length,
      ...summarize(metrics),
      elapsedMs,
      result,
      expectedTotalAuth: SCENARIO_TOTAL_AUTH,
      observedSum: sum,
      correct: sum === SCENARIO_TOTAL_AUTH,
      baseline: {
        elapsedMs: baseline.elapsedMs,
        observedSum: baseline.observedSum,
      },
      delta: {
        speedupX: Number(speedup.toFixed(2)),
      },
    };
    await writeFile(AFTER_PATH, JSON.stringify(snapshot, null, 2) + "\n", "utf-8");
    // eslint-disable-next-line no-console
    console.log("[phase2-after]", snapshot);

    // Correctness gate (non-negotiable).
    expect(sum).toBe(SCENARIO_TOTAL_AUTH);
    // Concurrency gate. Must be measurably faster — 2x is a
    // conservative threshold for 4-way concurrency over a workload
    // with N=5 children.
    expect(speedup).toBeGreaterThanOrEqual(2);
  });
});
