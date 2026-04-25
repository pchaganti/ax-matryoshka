/**
 * AFTER — Phase 1 (`rlm_query` + handle-as-context) target metrics.
 *
 * The TDD failing-test that drives Phase 1. Until `(rlm_query "task"
 * (context …))` is wired through parser, type-checker, and solver,
 * the parent's turn 2 fails to parse and the child never spawns.
 *
 * PASS BAR (verified at the bottom of this file against baseline.json):
 *   - correctness: sum of per-chunk counts equals 16 (ground truth).
 *     Baseline produces 0 because grep over JSON-stringified chunk
 *     fails. Phase 1 child sees clean lines and counts correctly.
 *   - tokens: descriptive only. Captured in after.json next to the
 *     baseline numbers for inspection. Correctness is the gate.
 *
 * Scenario B in `scenario-b.test.ts` is the minimal binary version of
 * the same failure mode.
 */

import { describe, it, expect } from "vitest";
import { readFile, writeFile } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { runBench, summarize, fromScript } from "./harness.js";
import {
  SCENARIO_A_DOC,
  SCENARIO_A_QUERY,
  SCENARIO_A_PHASE1_PARENT_SCRIPT,
  SCENARIO_A_CHILD_RESPONDER,
  SCENARIO_A_TOTAL_AUTH,
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

describe("Phase 1 — (rlm_query …) handle-as-context path", () => {
  it("[FAILING UNTIL IMPL] produces correct per-chunk AUTH counts", async () => {
    const baselineRaw = await readFile(BASELINE_PATH, "utf-8");
    const baseline = JSON.parse(baselineRaw) as {
      avgChildChars: number;
      childCalls: number;
      totalChars: number;
      observedSum: number | null;
    };

    const { result, metrics } = await runBench({
      query: SCENARIO_A_QUERY,
      documentContent: SCENARIO_A_DOC,
      parentResponder: fromScript(SCENARIO_A_PHASE1_PARENT_SCRIPT),
      childResponder: SCENARIO_A_CHILD_RESPONDER,
      // (rlm_query …) opts in at the term level — the LLM picks
      // recursion. The runtime depth budget is shared with llm_query
      // for Phase 1 (future phases may split it), so we set
      // subRLMMaxDepth >= 1 to enable recursion at all. The
      // before/after delta is still meaningful because baseline runs
      // with the same depth budget.
      subRLMMaxDepth: 1,
      maxTurns: 6,
    });

    const counts = parseCountArray(result);
    const sum = counts ? counts.reduce((a, b) => a + b, 0) : null;

    const phase1AvgChildChars =
      metrics.childCalls > 0 ? metrics.childChars / metrics.childCalls : 0;
    const childCharsPctDelta =
      baseline.avgChildChars > 0
        ? Math.round(
            ((baseline.avgChildChars - phase1AvgChildChars) /
              baseline.avgChildChars) *
              100
          )
        : 0;
    const totalCharsPctDelta =
      baseline.totalChars > 0
        ? Math.round(
            ((baseline.totalChars - metrics.totalChars) / baseline.totalChars) *
              100
          )
        : 0;

    const snapshot = {
      mode: "phase1",
      scenario: "scaled-handle-as-document",
      docChars: SCENARIO_A_DOC.length,
      docLines: SCENARIO_A_DOC.split("\n").length,
      ...summarize(metrics),
      result,
      expectedTotalAuth: SCENARIO_A_TOTAL_AUTH,
      observedSum: sum,
      correct: sum === SCENARIO_A_TOTAL_AUTH,
      baseline: {
        avgChildChars: baseline.avgChildChars,
        childCalls: baseline.childCalls,
        totalChars: baseline.totalChars,
        observedSum: baseline.observedSum,
      },
      delta: {
        avgChildCharsPctReduction: childCharsPctDelta,
        totalCharsPctReduction: totalCharsPctDelta,
      },
    };
    await writeFile(AFTER_PATH, JSON.stringify(snapshot, null, 2) + "\n", "utf-8");
    // eslint-disable-next-line no-console
    console.log("[phase1-after]", snapshot);

    expect(typeof result).toBe("string");
    // CORRECTNESS GATE: Phase 1 must produce the ground-truth total.
    expect(sum).toBe(SCENARIO_A_TOTAL_AUTH);
  });
});
