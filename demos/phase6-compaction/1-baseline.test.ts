/**
 * BEFORE — Phase 6 baseline: no compaction, model rejects oversized
 * prompts with [CONTEXT_OVERFLOW]. Locks in the failure mode the
 * phase fixes.
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
} from "./scenario.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const SNAPSHOT_PATH = join(__dirname, "baseline.json");

describe("Phase 6 baseline — no compaction, prompt grows past context limit", () => {
  it("the model rejects oversized prompts and the run never reaches FINAL", async () => {
    const llm = makeBoundedLLM(buildResponder());
    const result = (await runRLMFromContent(SCENARIO_QUERY, SCENARIO_DOC, {
      llmClient: llm,
      adapter: createNucleusAdapter(),
      maxTurns: 10,
      ragEnabled: false,
    })) as string;

    const snapshot = {
      mode: "baseline",
      scenario: "context-overflow",
      simContextLimit: SIMULATED_CONTEXT_LIMIT,
      docChars: SCENARIO_DOC.length,
      result: result.slice(0, 300),
    };
    await writeFile(SNAPSHOT_PATH, JSON.stringify(snapshot, null, 2) + "\n", "utf-8");
    // eslint-disable-next-line no-console
    console.log("[phase6-baseline]", snapshot);

    // Without compaction, the run cannot complete — either it
    // hit max turns or the FSM accepted the [CONTEXT_OVERFLOW]
    // string as a final answer (which is wrong but possible).
    // Either way, the result MUST NOT contain a real grep result
    // (TAG-N-occurrence-J) — that would mean the run somehow
    // completed despite the limit.
    expect(result).not.toMatch(/TAG-\d+-occurrence-\d+/);
  });
});
