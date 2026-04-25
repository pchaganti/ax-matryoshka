/**
 * Scenario B — correctness gate.
 *
 * Two runs of the SAME child responder under the SAME query, differing
 * only in the recursion primitive the parent uses:
 *   - baseline: (llm_query …) with subRLMMaxDepth=1
 *   - phase1:   (rlm_query "task" (context $h))
 *
 * The child counts AUTH lines from its grep result. Ground truth is
 * 3. With today's path the child sees a JSON blob and reports 0.
 * With Phase 1 the child sees one entry per line and reports 3.
 *
 * The "after" assertion is the failing TDD test that drives Phase 1
 * implementation. The "before" assertion locks in the failure mode of
 * today's path so the contrast is unambiguous.
 */

import { describe, it, expect } from "vitest";
import { writeFile } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { runBench, fromScript, summarize } from "./harness.js";
import {
  SCENARIO_B_DOC,
  SCENARIO_B_QUERY,
  SCENARIO_B_BASELINE_PARENT_SCRIPT,
  SCENARIO_B_PHASE1_PARENT_SCRIPT,
  SCENARIO_B_CHILD_RESPONDER,
  EXPECTED_AUTH_COUNT,
} from "./scenario-b.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const BASELINE_B_PATH = join(__dirname, "baseline-b.json");
const AFTER_B_PATH = join(__dirname, "after-b.json");

function extractCount(result: string): number | null {
  // Final answer flows through FINAL_VAR(_2) which inlines the child's
  // string return; the child returned just a number as text.
  const m = result.match(/^\s*"?(\d+)"?\s*$/m);
  return m ? Number(m[1]) : null;
}

describe("Phase 1 scenario B — handle-as-document for child grep", () => {
  it("BASELINE: today's path makes the child see JSON noise → wrong count", async () => {
    const { result, metrics } = await runBench({
      query: SCENARIO_B_QUERY,
      documentContent: SCENARIO_B_DOC,
      parentResponder: fromScript(SCENARIO_B_BASELINE_PARENT_SCRIPT),
      childResponder: SCENARIO_B_CHILD_RESPONDER,
      subRLMMaxDepth: 1,
      maxTurns: 6,
    });

    const reportedCount = extractCount(result);
    const snapshot = {
      mode: "baseline-b",
      scenario: "handle-as-document",
      docChars: SCENARIO_B_DOC.length,
      ...summarize(metrics),
      result,
      expectedAuthCount: EXPECTED_AUTH_COUNT,
      childReportedCount: reportedCount,
      correct: reportedCount === EXPECTED_AUTH_COUNT,
    };
    await writeFile(BASELINE_B_PATH, JSON.stringify(snapshot, null, 2) + "\n", "utf-8");
    // eslint-disable-next-line no-console
    console.log("[scenario-b baseline]", snapshot);

    // Locking in the failure mode: child reports something other than 3.
    // If today's path miraculously starts producing 3, the test will
    // fail and we'd revisit whether Phase 1 still has a benefit case.
    expect(reportedCount).not.toBe(EXPECTED_AUTH_COUNT);
  });

  it("[FAILING UNTIL IMPL] PHASE 1: child sees clean per-line context → correct count", async () => {
    const { result, metrics } = await runBench({
      query: SCENARIO_B_QUERY,
      documentContent: SCENARIO_B_DOC,
      parentResponder: fromScript(SCENARIO_B_PHASE1_PARENT_SCRIPT),
      childResponder: SCENARIO_B_CHILD_RESPONDER,
      subRLMMaxDepth: 1,
      maxTurns: 6,
    });

    const reportedCount = extractCount(result);
    const snapshot = {
      mode: "phase1-b",
      scenario: "handle-as-document",
      docChars: SCENARIO_B_DOC.length,
      ...summarize(metrics),
      result,
      expectedAuthCount: EXPECTED_AUTH_COUNT,
      childReportedCount: reportedCount,
      correct: reportedCount === EXPECTED_AUTH_COUNT,
    };
    await writeFile(AFTER_B_PATH, JSON.stringify(snapshot, null, 2) + "\n", "utf-8");
    // eslint-disable-next-line no-console
    console.log("[scenario-b phase1]", snapshot);

    expect(reportedCount).toBe(EXPECTED_AUTH_COUNT);
  });
});
