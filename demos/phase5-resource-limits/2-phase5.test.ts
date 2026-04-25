/**
 * AFTER — Phase 5: maxTimeoutMs cap aborts cleanly with a partial.
 *
 * Same scripted runaway query, now with maxTimeoutMs=500. The bead's
 * pass criterion: bounded run completes in < 1.2× the cap AND
 * returns a non-empty partial answer.
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
  PARENT_RESPONDER,
  CHILD_RESPONDER,
  MAX_TIMEOUT_MS,
} from "./scenario.js";
import { makeScriptedLLM } from "../phase1-rlm-query/harness.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const BASELINE_PATH = join(__dirname, "baseline.json");
const AFTER_PATH = join(__dirname, "after.json");

describe("Phase 5 — maxTimeoutMs bounds the runaway query", () => {
  it("[FAILING UNTIL IMPL] aborts within 1.2x the cap with a non-empty partial", async () => {
    const baselineRaw = await readFile(BASELINE_PATH, "utf-8");
    const baseline = JSON.parse(baselineRaw) as { elapsedMs: number };

    const { llm } = makeScriptedLLM(
      PARENT_RESPONDER,
      CHILD_RESPONDER,
      SCENARIO_QUERY
    );
    const start = Date.now();
    const result = (await runRLMFromContent(SCENARIO_QUERY, SCENARIO_DOC, {
      llmClient: llm,
      adapter: createNucleusAdapter(),
      maxTurns: 8, // higher than the timeout-bounded turn count
      ragEnabled: false,
      subRLMMaxDepth: 1,
      maxTimeoutMs: MAX_TIMEOUT_MS,
    })) as string;
    const elapsedMs = Date.now() - start;

    const snapshot = {
      mode: "phase5",
      scenario: "runaway-query",
      maxTimeoutMs: MAX_TIMEOUT_MS,
      result,
      elapsedMs,
      baseline: { elapsedMs: baseline.elapsedMs },
      delta: {
        speedupX: Number((baseline.elapsedMs / elapsedMs).toFixed(2)),
      },
    };
    await writeFile(AFTER_PATH, JSON.stringify(snapshot, null, 2) + "\n", "utf-8");
    // eslint-disable-next-line no-console
    console.log("[phase5-after]", snapshot);

    // Wall-clock bound — < 1.2× the configured cap.
    expect(elapsedMs).toBeLessThan(MAX_TIMEOUT_MS * 1.2);
    // Aborted cleanly with a recognizable marker.
    expect(result).toMatch(/aborted.*timeout/i);
    // Partial answer is non-empty AND mentions the grep matches
    // (ctx.bestPartialAnswer captured them on turn 1).
    expect(result).toMatch(/TOKEN-/);
  });
});
