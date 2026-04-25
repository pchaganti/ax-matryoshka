/**
 * End-to-end tests for the Phase 2 `rlm_batch` dispatcher in
 * `runRLMFromContent`. The unit tests in `rlm-batch.test.ts` cover
 * solver-level dispatch with a stubbed `tools.rlmBatch`. This file
 * exercises the actual worker-pool dispatcher built inside
 * `runRLMFromContent` to lock in two invariants the bead calls out:
 *
 *   - Partial-failure isolation: one child throwing must not abort
 *     the other children's results. The failed slot must surface as
 *     a recognizable error string.
 *   - Concurrency cap: at any moment, no more than
 *     `maxConcurrentSubcalls` child sessions should be in flight.
 */

import { describe, it, expect } from "vitest";
import { runRLMFromContent } from "../../src/rlm.js";
import { createNucleusAdapter } from "../../src/adapters/nucleus.js";

/** Sleep helper for latency-driven concurrency observation. */
const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

describe("rlm_batch dispatcher — partial failure isolation (flat-fallback path)", () => {
  it("a thrown llmClient error in one item does NOT abort the others", async () => {
    // Run with subRLMMaxDepth=0 so rlm_batch goes through the FLAT
    // fallback in createSolverTools (no recursive child sessions).
    // That path's bare Promise.all used to lose every other item's
    // completed work when one threw; the fix wraps each item in a
    // per-item try/catch and emits an error marker.
    let parentTurn = 0;

    const llm = async (prompt: string): Promise<string> => {
      const isChild =
        /Query:\s*per-chunk task/m.test(prompt) ||
        prompt.startsWith("You are a sub-LLM invoked");

      if (isChild) {
        // Detect which chunk this child got via the unique marker
        // line each chunk carries. The third item must throw; the
        // others return a deterministic OK string.
        const marker = prompt.match(/CHUNK-(\d)/);
        const chunkId = marker ? marker[1] : "?";
        if (chunkId === "3") {
          throw new Error("simulated failure for chunk 3");
        }
        return `chunk-${chunkId}-ok`;
      }
      parentTurn++;
      if (parentTurn === 1) return `(grep "^CHUNK-")`;
      if (parentTurn === 2) {
        return `(rlm_batch RESULTS (lambda c (rlm_query "per-chunk task" (context c))))`;
      }
      return `<<<FINAL>>>FINAL_VAR(_2)<<<END>>>`;
    };

    const doc = [
      "CHUNK-1: alpha",
      "CHUNK-2: beta",
      "CHUNK-3: gamma",
      "CHUNK-4: delta",
    ].join("\n");

    const result = (await runRLMFromContent("scan chunks", doc, {
      llmClient: llm,
      adapter: createNucleusAdapter(),
      maxTurns: 6,
      ragEnabled: false,
      subRLMMaxDepth: 0, // flat-fallback path
    })) as string;

    expect(typeof result).toBe("string");
    // The three OK chunks must come through.
    expect(result).toMatch(/chunk-1-ok/);
    expect(result).toMatch(/chunk-2-ok/);
    expect(result).toMatch(/chunk-4-ok/);
    // The failed slot must be clearly labeled as an error.
    expect(result).toMatch(/Error: rlm_batch item \d+ failed/);
  });
});

describe("rlm_batch dispatcher — concurrency cap", () => {
  it("never exceeds maxConcurrentSubcalls children in flight", async () => {
    // Track in-flight count. With 6 children and a cap of 2, the
    // tracker should never see more than 2 active at any moment.
    let inFlight = 0;
    let peakInFlight = 0;
    const enter = () => {
      inFlight++;
      peakInFlight = Math.max(peakInFlight, inFlight);
    };
    const exit = () => {
      inFlight--;
    };

    const llm = async (prompt: string): Promise<string> => {
      const isChild =
        /Query:\s*per-chunk task/m.test(prompt) ||
        prompt.includes("Analyze and answer based on");

      if (isChild) {
        enter();
        // Hold the slot for 80ms so the dispatcher's pool budget
        // visibly constrains parallelism. Without latency, all
        // children would settle synchronously and the peak would be 1.
        await sleep(80);
        exit();
        if (!prompt.includes("Bindings:")) {
          return `(grep "X")`;
        }
        return `<<<FINAL>>>ok<<<END>>>`;
      }
      // Parent flow: chunk → rlm_batch → final.
      if (!prompt.includes("Bindings:")) {
        return `(chunk_by_lines 1)`;
      }
      if (prompt.match(/Bindings:/g)?.length === 1) {
        return `(rlm_batch RESULTS (lambda c (rlm_query "per-chunk task" (context c))))`;
      }
      return `<<<FINAL>>>FINAL_VAR(_2)<<<END>>>`;
    };

    const doc = ["a", "b", "c", "d", "e", "f"].join("\n"); // 6 chunks

    await runRLMFromContent("cap test", doc, {
      llmClient: llm,
      adapter: createNucleusAdapter(),
      maxTurns: 6,
      ragEnabled: false,
      subRLMMaxDepth: 1,
      maxConcurrentSubcalls: 2,
    });

    // Cap is 2. Allow some slack so we don't false-fail on a 3-deep
    // microtask race, but the cap should be near the configured 2.
    expect(peakInFlight).toBeLessThanOrEqual(2);
    expect(peakInFlight).toBeGreaterThanOrEqual(2);
  });
});
