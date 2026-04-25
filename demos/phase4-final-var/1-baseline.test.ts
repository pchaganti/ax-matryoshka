/**
 * BEFORE — Phase 4 baseline. Child inlines a 100-record array as its
 * FINAL answer, so the child's last LLM response carries the full
 * payload as output tokens.
 *
 * Locks in the baseline output cost so after.test.ts can compute the
 * delta after switching to FINAL_VAR(_1).
 */

import { describe, it, expect } from "vitest";
import { writeFile } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { runRLMFromContent } from "../../src/rlm.js";
import { createNucleusAdapter } from "../../src/adapters/nucleus.js";
import {
  SCENARIO_DOC,
  SCENARIO_QUERY,
  PARENT_SCRIPT,
  BASELINE_CHILD_RESPONDER,
  EXPECTED_TAG_COUNT,
} from "./scenario.js";
import {
  fromScript,
  makeScriptedLLM,
} from "../phase1-rlm-query/harness.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const SNAPSHOT_PATH = join(__dirname, "baseline.json");

describe("Phase 4 baseline — child inlines its full result in FINAL", () => {
  it("captures child's FINAL response output size", async () => {
    // Wrap the child responder so we can sum its output chars
    // across every child turn. That sum is a faithful proxy for the
    // CHILD LLM's output-token cost in production.
    let childOutputChars = 0;
    const wrappedChild = (prompt: string, turn: number) => {
      const out = BASELINE_CHILD_RESPONDER(prompt, turn);
      const s = typeof out === "string" ? out : "";
      childOutputChars += s.length;
      return s;
    };

    const { llm, metrics } = makeScriptedLLM(
      fromScript(PARENT_SCRIPT),
      wrappedChild,
      SCENARIO_QUERY
    );
    const result = (await runRLMFromContent(SCENARIO_QUERY, SCENARIO_DOC, {
      llmClient: llm,
      adapter: createNucleusAdapter(),
      maxTurns: 6,
      ragEnabled: false,
      subRLMMaxDepth: 1,
    })) as string;

    // Sanity: result must contain TAG-1 and TAG-N entries (proving
    // the inlined data made it through).
    expect(result).toMatch(/TAG-1/);
    expect(result).toMatch(new RegExp(`TAG-${EXPECTED_TAG_COUNT}`));

    const snapshot = {
      mode: "baseline",
      scenario: "child-final-output-size",
      docChars: SCENARIO_DOC.length,
      tagCount: EXPECTED_TAG_COUNT,
      childCalls: metrics.childCalls,
      childOutputChars,
      avgChildOutputChars:
        metrics.childCalls > 0
          ? Math.round(childOutputChars / metrics.childCalls)
          : 0,
    };
    await writeFile(SNAPSHOT_PATH, JSON.stringify(snapshot, null, 2) + "\n", "utf-8");
    // eslint-disable-next-line no-console
    console.log("[phase4-baseline]", snapshot);

    // The inlined FINAL should be ~6KB+ for 100 records.
    expect(childOutputChars).toBeGreaterThan(3000);
  });
});
