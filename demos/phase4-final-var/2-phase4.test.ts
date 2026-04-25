/**
 * AFTER — Phase 4 child uses FINAL_VAR(_1) to dodge the inlining
 * cost. Same payload reaches the parent (FSM expands FINAL_VAR
 * server-side); the child LLM's last response is a tiny marker.
 *
 * Pass criteria:
 *   - Parent receives the same data (correctness gate).
 *   - Child's total FINAL response chars drop ≥80% vs baseline
 *     (descriptive measurement, locked in as a hard threshold so a
 *     future refactor accidentally bringing back inlining is caught).
 */

import { describe, it, expect } from "vitest";
import { readFile, writeFile } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { runRLMFromContent } from "../../src/rlm.js";
import { createNucleusAdapter } from "../../src/adapters/nucleus.js";
import {
  SCENARIO_DOC,
  SCENARIO_QUERY,
  PARENT_SCRIPT,
  PHASE4_CHILD_RESPONDER,
  EXPECTED_TAG_COUNT,
} from "./scenario.js";
import {
  fromScript,
  makeScriptedLLM,
} from "../phase1-rlm-query/harness.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const BASELINE_PATH = join(__dirname, "baseline.json");
const AFTER_PATH = join(__dirname, "after.json");

describe("Phase 4 — child uses FINAL_VAR(_1) for output savings", () => {
  it("matches baseline payload at <20% of the child's output cost", async () => {
    const baselineRaw = await readFile(BASELINE_PATH, "utf-8");
    const baseline = JSON.parse(baselineRaw) as {
      childOutputChars: number;
    };

    let childOutputChars = 0;
    const wrappedChild = (prompt: string, turn: number) => {
      const out = PHASE4_CHILD_RESPONDER(prompt, turn);
      const s = typeof out === "string" ? out : "";
      childOutputChars += s.length;
      return s;
    };

    const { llm } = makeScriptedLLM(
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

    // CORRECTNESS gate: parent must still get TAG-1 ... TAG-N.
    expect(result).toMatch(/TAG-1/);
    expect(result).toMatch(new RegExp(`TAG-${EXPECTED_TAG_COUNT}`));

    const reductionPct =
      baseline.childOutputChars > 0
        ? Math.round(
            ((baseline.childOutputChars - childOutputChars) /
              baseline.childOutputChars) *
              100
          )
        : 0;

    const snapshot = {
      mode: "phase4",
      scenario: "child-final-output-size",
      docChars: SCENARIO_DOC.length,
      tagCount: EXPECTED_TAG_COUNT,
      childOutputChars,
      baseline: { childOutputChars: baseline.childOutputChars },
      delta: { reductionPct },
    };
    await writeFile(AFTER_PATH, JSON.stringify(snapshot, null, 2) + "\n", "utf-8");
    // eslint-disable-next-line no-console
    console.log("[phase4-after]", snapshot);

    // Output-cost gate: ≥80% reduction.
    expect(reductionPct).toBeGreaterThanOrEqual(80);
  });
});
