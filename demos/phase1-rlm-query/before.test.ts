/**
 * BEFORE — baseline metrics for Phase 1's tangible-benefit gate.
 *
 * Records the behavior of today's recursion path on the structured-
 * extraction scenario. Writes the result to baseline.json so the
 * after.test.ts run can compute deltas.
 *
 * This file is a "characterization test" — it locks in the behavior of
 * the existing implementation so we can later prove (or disprove) that
 * Phase 1 improves on it. It is not a regression test for runRLM; if
 * runRLM's prompt structure changes, the snapshot updates and the
 * after-vs-before delta still tells us whether Phase 1 helps.
 */

import { describe, it, expect } from "vitest";
import { writeFile } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import {
  runBench,
  summarize,
  fromScript,
} from "./harness.js";
import {
  SCENARIO_DOC,
  SCENARIO_QUERY,
  BASELINE_PARENT_SCRIPT,
  BASELINE_CHILD_SCRIPT,
} from "./scenario.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const SNAPSHOT_PATH = join(__dirname, "baseline.json");

describe("Phase 1 baseline — today's (llm_query …) + subRLMMaxDepth=1 path", () => {
  it("captures parent/child char totals on the structured-extraction scenario", async () => {
    const { result, metrics } = await runBench({
      query: SCENARIO_QUERY,
      documentContent: SCENARIO_DOC,
      parentResponder: fromScript(BASELINE_PARENT_SCRIPT),
      childResponder: fromScript(BASELINE_CHILD_SCRIPT),
      subRLMMaxDepth: 1,
      maxTurns: 6,
    });

    // Sanity: the run produced *some* result and exercised both parent
    // and at least one child sub-RLM. If childCalls=0 the scenario
    // didn't actually trigger recursion and the benchmark is invalid.
    expect(typeof result).toBe("string");
    expect(metrics.parentCalls).toBeGreaterThanOrEqual(2);
    expect(metrics.childCalls).toBeGreaterThanOrEqual(1);

    // Persist the numbers so after.test.ts can diff against them.
    const snapshot = {
      mode: "baseline",
      scenario: "structured-extraction",
      // Doc fingerprint — if the scenario changes, the after run must
      // re-baseline before the delta is comparable.
      docChars: SCENARIO_DOC.length,
      docLines: SCENARIO_DOC.split("\n").length,
      ...summarize(metrics),
      result,
    };
    await writeFile(SNAPSHOT_PATH, JSON.stringify(snapshot, null, 2) + "\n", "utf-8");
    // eslint-disable-next-line no-console
    console.log("[phase1-baseline]", snapshot);
  });
});
