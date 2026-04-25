/**
 * AFTER — Phase 6 with compaction at the right threshold.
 *
 * Same scripted run, now `compactionThresholdChars` set below the
 * simulated context limit. The FSM trims history before the prompt
 * crosses the limit; the run completes with a real FINAL answer.
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
  buildResponder,
  makeBoundedLLM,
  SIMULATED_CONTEXT_LIMIT,
  COMPACTION_THRESHOLD,
} from "./scenario.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const AFTER_PATH = join(__dirname, "after.json");

describe("Phase 6 — compaction keeps the run alive past context limit", () => {
  it("produces a real FINAL answer with grep results despite the simulated context cap", async () => {
    const llm = makeBoundedLLM(buildResponder());
    const result = (await runRLMFromContent(SCENARIO_QUERY, SCENARIO_DOC, {
      llmClient: llm,
      adapter: createNucleusAdapter(),
      maxTurns: 10,
      ragEnabled: false,
      compactionThresholdChars: COMPACTION_THRESHOLD,
    })) as string;

    const snapshot = {
      mode: "phase6",
      scenario: "context-overflow",
      simContextLimit: SIMULATED_CONTEXT_LIMIT,
      compactionThresholdChars: COMPACTION_THRESHOLD,
      result: result.slice(0, 600),
    };
    await writeFile(AFTER_PATH, JSON.stringify(snapshot, null, 2) + "\n", "utf-8");
    // eslint-disable-next-line no-console
    console.log("[phase6-after]", snapshot);

    // Correctness gate: the result MUST contain a real grep
    // match line (TAG-N-occurrence-J pattern). That proves the
    // FSM completed and FINAL_VAR resolved against actual
    // bindings.
    expect(result).toMatch(/TAG-\d+-occurrence-\d+/);
    expect(result).not.toMatch(/CONTEXT_OVERFLOW/);
  });
});
