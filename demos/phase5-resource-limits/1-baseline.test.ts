/**
 * BEFORE — Phase 5 baseline: no resource limits configured.
 *
 * The scripted parent emits a useful grep on turn 1, then "runs
 * away" via long-sleeping (rlm_query …) calls. With no maxTimeoutMs
 * this spirals until the FSM's 5-minute hard ceiling — too long for
 * a unit test. We cap the run with maxTurns=4 to model what
 * happens today: bounded only by turn count, the LLM burns budget
 * across every turn whether or not progress is being made.
 *
 * Locks in the wall-clock baseline so after.test.ts can prove the
 * concrete timeout cap actually saves time.
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
  PARENT_RESPONDER,
  CHILD_RESPONDER,
} from "./scenario.js";
import { makeScriptedLLM } from "../phase1-rlm-query/harness.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const SNAPSHOT_PATH = join(__dirname, "baseline.json");

describe("Phase 5 baseline — no limits, runs to maxTurns", () => {
  it("captures wall-clock with no resource limits", async () => {
    const { llm } = makeScriptedLLM(
      PARENT_RESPONDER,
      CHILD_RESPONDER,
      SCENARIO_QUERY
    );
    const start = Date.now();
    const result = (await runRLMFromContent(SCENARIO_QUERY, SCENARIO_DOC, {
      llmClient: llm,
      adapter: createNucleusAdapter(),
      maxTurns: 4, // bounded only by maxTurns today
      ragEnabled: false,
      subRLMMaxDepth: 1,
    })) as string;
    const elapsedMs = Date.now() - start;

    const snapshot = {
      mode: "baseline",
      scenario: "runaway-query",
      maxTurns: 4,
      result,
      elapsedMs,
    };
    await writeFile(SNAPSHOT_PATH, JSON.stringify(snapshot, null, 2) + "\n", "utf-8");
    // eslint-disable-next-line no-console
    console.log("[phase5-baseline]", snapshot);

    // The unbounded run takes substantially longer than the
    // intended timeout cap (500ms). Without limits, every turn
    // pays its slow LLM cost.
    expect(elapsedMs).toBeGreaterThan(700);
  });
});
