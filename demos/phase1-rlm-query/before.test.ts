/**
 * BEFORE — baseline metrics for Phase 1's tangible-benefit gate.
 *
 * Locks in today's behavior on scenario A: per-chunk AUTH-count via
 * recursive llm_query + subRLMMaxDepth=1. Today's path JSON-stringifies
 * the chunk into the child's prompt, so the child's `(grep "^AUTH:")`
 * matches zero per chunk and the parent's final answer is an array of
 * eight zeros — the wrong answer.
 *
 * That failure mode is the "before" half of the comparison. The
 * `after.test.ts` run (post Phase 1) must produce the correct array
 * of counts (sum = 16) to pass.
 */

import { describe, it, expect } from "vitest";
import { writeFile } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { runBench, fromScript, summarize } from "./harness.js";
import {
  SCENARIO_A_DOC,
  SCENARIO_A_QUERY,
  SCENARIO_A_BASELINE_PARENT_SCRIPT,
  SCENARIO_A_CHILD_RESPONDER,
  SCENARIO_A_TOTAL_AUTH,
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

describe("Phase 1 baseline — today's (llm_query …) + subRLMMaxDepth=1 path", () => {
  it("captures the per-chunk AUTH counts on the scaled scenario", async () => {
    const { result, metrics } = await runBench({
      query: SCENARIO_A_QUERY,
      documentContent: SCENARIO_A_DOC,
      parentResponder: fromScript(SCENARIO_A_BASELINE_PARENT_SCRIPT),
      childResponder: SCENARIO_A_CHILD_RESPONDER,
      subRLMMaxDepth: 1,
      maxTurns: 6,
    });

    expect(typeof result).toBe("string");
    expect(metrics.parentCalls).toBeGreaterThanOrEqual(2);
    expect(metrics.childCalls).toBeGreaterThanOrEqual(1);

    const counts = parseCountArray(result);
    const sum = counts ? counts.reduce((a, b) => a + b, 0) : null;

    const snapshot = {
      mode: "baseline",
      scenario: "scaled-handle-as-document",
      docChars: SCENARIO_A_DOC.length,
      docLines: SCENARIO_A_DOC.split("\n").length,
      ...summarize(metrics),
      result,
      expectedTotalAuth: SCENARIO_A_TOTAL_AUTH,
      observedSum: sum,
      // Locking in today's failure mode: child sees JSON, grep 0
      // per chunk, sum = 0. If today's path ever produces the
      // correct sum, this snapshot's `observedSum` will reveal it
      // and we'd revisit whether Phase 1 is still warranted.
      correct: sum === SCENARIO_A_TOTAL_AUTH,
    };
    await writeFile(SNAPSHOT_PATH, JSON.stringify(snapshot, null, 2) + "\n", "utf-8");
    // eslint-disable-next-line no-console
    console.log("[phase1-baseline]", snapshot);

    // Today's path must produce the WRONG answer for the
    // before/after delta to mean anything. If this changes, Phase
    // 1's correctness gate is moot and the gate should be revisited.
    expect(sum).not.toBe(SCENARIO_A_TOTAL_AUTH);
  });
});
