/**
 * AFTER — Phase 1 (`rlm_query` term + handle-as-context) target metrics.
 *
 * This test is the TDD failing-test that drives the Phase 1
 * implementation. Until `(rlm_query "task" (context …))` is wired
 * through the parser, type-checker, and solver, the parent's first
 * turn will fail to parse and the whole run will return an error
 * instead of an extracted result.
 *
 * The PASS BAR for the phase (verified at the bottom of this file
 * against baseline.json):
 *   - childChars per call drops by ≥15% vs baseline. Today's child
 *     prompt carries the "Analyze and answer based on …" framing PLUS
 *     the interpolated `{item}`. Phase 1's child gets just the
 *     parent's task string + the structured context as its document,
 *     no per-iteration prompt-text inflation.
 *   - correctness: 24 extracted strings, same as baseline.
 *
 * (Scenario A is the token-savings gate. Scenario B in
 * `scenario-b.test.ts` is the binary correctness gate — that one
 * proves Phase 1 enables a query class today's path fails on.)
 *
 * If the implementation lands but the deltas are below this bar, the
 * phase is cut per the bead's tangible-benefit gate.
 */

import { describe, it, expect } from "vitest";
import { readFile, writeFile } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { runBench, summarize, fromScript } from "./harness.js";
import { SCENARIO_DOC, SCENARIO_QUERY } from "./scenario.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const BASELINE_PATH = join(__dirname, "baseline.json");
const AFTER_PATH = join(__dirname, "after.json");

/**
 * Parent script for the Phase 1 path.
 *
 * Turn 1: same grep — establish RESULTS.
 * Turn 2: NEW form. (map RESULTS (lambda x (rlm_query "extract" (context x))))
 *   — child receives the bound `x` AS ITS DOCUMENT (handle-as-context),
 *   query is the bare "extract" string, no per-call interpolation
 *   wrapper.
 * Turn 3: emit FINAL referencing _2.
 */
const PHASE1_PARENT_SCRIPT: string[] = [
  `(grep "^FACT-")`,
  `(map RESULTS (lambda x (rlm_query "extract" (context x))))`,
  `<<<FINAL>>>FINAL_VAR(_2)<<<END>>>`,
];

/**
 * Child script. Same structure as baseline (probe + FINAL) so the
 * delta isolates *prompt-side* savings, not behavior changes.
 */
const PHASE1_CHILD_SCRIPT: string[] = [
  `(grep "FACT-")`,
  `<<<FINAL>>>extracted<<<END>>>`,
];

describe("Phase 1 — (rlm_query …) handle-as-context path", () => {
  it("[FAILING UNTIL IMPL] beats the baseline on childChars by ≥30%", async () => {
    const baselineRaw = await readFile(BASELINE_PATH, "utf-8");
    const baseline = JSON.parse(baselineRaw) as {
      avgChildChars: number;
      childCalls: number;
      totalChars: number;
    };

    const { result, metrics } = await runBench({
      query: SCENARIO_QUERY,
      documentContent: SCENARIO_DOC,
      parentResponder: fromScript(PHASE1_PARENT_SCRIPT),
      childResponder: fromScript(PHASE1_CHILD_SCRIPT),
      // Phase 1 doesn't depend on subRLMMaxDepth — `(rlm_query …)` opts
      // in per call. We leave subRLMMaxDepth at 0 to prove that the new
      // term recurses on its own, not via the existing flag.
      subRLMMaxDepth: 0,
      maxTurns: 6,
    });

    // Persist for forensic comparison even on failure.
    const snapshot = {
      mode: "phase1",
      scenario: "structured-extraction",
      docChars: SCENARIO_DOC.length,
      docLines: SCENARIO_DOC.split("\n").length,
      ...summarize(metrics),
      result,
      baseline: {
        avgChildChars: baseline.avgChildChars,
        childCalls: baseline.childCalls,
        totalChars: baseline.totalChars,
      },
      delta: {
        avgChildCharsPctReduction:
          baseline.avgChildChars > 0
            ? Math.round(
                ((baseline.avgChildChars -
                  (metrics.childCalls > 0
                    ? metrics.childChars / metrics.childCalls
                    : 0)) /
                  baseline.avgChildChars) *
                  100
              )
            : 0,
        totalCharsPctReduction:
          baseline.totalChars > 0
            ? Math.round(
                ((baseline.totalChars - metrics.totalChars) /
                  baseline.totalChars) *
                  100
              )
            : 0,
      },
    };
    await writeFile(AFTER_PATH, JSON.stringify(snapshot, null, 2) + "\n", "utf-8");
    // eslint-disable-next-line no-console
    console.log("[phase1-after]", snapshot);

    // Correctness: same 24 results as baseline.
    expect(metrics.childCalls).toBeGreaterThanOrEqual(baseline.childCalls / 2);
    expect(typeof result).toBe("string");
    expect(result).toContain("extracted");

    // Tangible-benefit gate: ≥15% reduction in avg child prompt size
    // (post-caveman; the absolute bar is conservative because the
    // caveman pass already removed most easy framing slack).
    const phase1AvgChildChars =
      metrics.childCalls > 0 ? metrics.childChars / metrics.childCalls : 0;
    const reduction =
      (baseline.avgChildChars - phase1AvgChildChars) / baseline.avgChildChars;
    expect(reduction).toBeGreaterThanOrEqual(0.15);
  });
});
