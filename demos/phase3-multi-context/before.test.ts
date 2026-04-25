/**
 * BEFORE — single-doc baseline for Phase 3.
 *
 * The user concatenates all three docs into one and runs a single
 * grep over the blob. The result has line numbers ABSOLUTE TO THE
 * CONCATENATION — there's no per-doc provenance, so the LLM can
 * only assert "DEPLOY at line 4" without saying which file that's
 * line 4 of. (Doc 0's line 4 IS the deploy line; the concatenated
 * blob's line 4 is also the deploy line, but only because doc 0 is
 * first; for the OUTAGE the absolute line number is 14, not 2 of
 * doc 2.)
 *
 * Locks in the baseline failure mode.
 */

import { describe, it, expect } from "vitest";
import { writeFile } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { runRLMFromContent } from "../../src/rlm.js";
import { createNucleusAdapter } from "../../src/adapters/nucleus.js";
import {
  CONCATENATED_DOC,
  SCENARIO_QUERY,
  BASELINE_PARENT_SCRIPT,
  EXPECTED_DEPLOY_LINE_NUM,
  EXPECTED_OUTAGE_LINE_NUM,
} from "./scenario.js";
import { fromScript, makeScriptedLLM } from "../phase1-rlm-query/harness.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const SNAPSHOT_PATH = join(__dirname, "baseline.json");

describe("Phase 3 baseline — single-concatenated-doc grep", () => {
  it("returns matches without per-doc provenance", async () => {
    const { llm } = makeScriptedLLM(
      fromScript(BASELINE_PARENT_SCRIPT),
      () => "",
      SCENARIO_QUERY
    );
    const result = (await runRLMFromContent(SCENARIO_QUERY, CONCATENATED_DOC, {
      llmClient: llm,
      adapter: createNucleusAdapter(),
      maxTurns: 4,
      ragEnabled: false,
    })) as string;

    // Parse the inlined matches. Result format is FINAL_VAR(_1) which
    // expands to the JSON of the grep result array.
    let parsed: Array<{ match: string; line: string; lineNum: number }> | null = null;
    const arrayMatch = result.match(/\[\s*\{[\s\S]*\}\s*\]/);
    if (arrayMatch) {
      try {
        parsed = JSON.parse(arrayMatch[0]);
      } catch {
        parsed = null;
      }
    }

    // Forensic check: did the baseline find both DEPLOY and OUTAGE?
    // The lineNum reported is ABSOLUTE OVER THE CONCATENATION, so it
    // is NOT EXPECTED_DEPLOY_LINE_NUM (4) — it's some larger absolute
    // offset. That's the failure mode this baseline locks in.
    const deploy = parsed?.find((m) => /DEPLOY/.test(m.match));
    const outage = parsed?.find((m) => /OUTAGE/.test(m.match));

    const snapshot = {
      mode: "baseline",
      scenario: "cross-document-correlation",
      docChars: CONCATENATED_DOC.length,
      result,
      deployLineNumReported: deploy?.lineNum ?? null,
      outageLineNumReported: outage?.lineNum ?? null,
      perDocExpected: {
        deploy: { doc: 0, lineNum: EXPECTED_DEPLOY_LINE_NUM },
        outage: { doc: 2, lineNum: EXPECTED_OUTAGE_LINE_NUM },
      },
      perDocProvenance: false,
    };
    await writeFile(SNAPSHOT_PATH, JSON.stringify(snapshot, null, 2) + "\n", "utf-8");
    // eslint-disable-next-line no-console
    console.log("[phase3-baseline]", snapshot);

    // Both events must be findable (the regex worked) but the
    // per-doc context is lost. We assert specifically that the
    // outage line number is NOT 2 (its true per-doc position) —
    // proving the absolute-offset failure.
    expect(outage).toBeTruthy();
    expect(outage!.lineNum).not.toBe(EXPECTED_OUTAGE_LINE_NUM);
  });
});
