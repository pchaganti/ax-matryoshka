/**
 * AFTER — Phase 3 multi-context cross-doc demo.
 *
 * Each doc loaded separately. Parent runs `(grep "DEPLOY" (context 0))`
 * and `(grep "OUTAGE" (context 2))`. Per-doc line numbers come back —
 * deploy at line 4 of doc 0, outage at line 2 of doc 2 — so the LLM
 * can cite provenance reliably.
 *
 * Pass criteria:
 *   - DEPLOY found at line 4 of doc 0 (per-doc lineNum, NOT absolute).
 *   - OUTAGE found at line 2 of doc 2 (per-doc lineNum, NOT absolute).
 *   - Final answer contains both per-doc results, distinguishable.
 *
 * Per project rule (correctness > performance): the gate is structural
 * correctness of the cross-doc citation, not token cost.
 */

import { describe, it, expect } from "vitest";
import { writeFile } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { runRLMFromContent } from "../../src/rlm.js";
import { createNucleusAdapter } from "../../src/adapters/nucleus.js";
import {
  ALL_DOCS,
  SCENARIO_QUERY,
  PHASE3_PARENT_SCRIPT,
  EXPECTED_DEPLOY_LINE_NUM,
  EXPECTED_OUTAGE_LINE_NUM,
} from "./scenario.js";
import { fromScript, makeScriptedLLM } from "../phase1-rlm-query/harness.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const AFTER_PATH = join(__dirname, "after.json");

describe("Phase 3 — multi-context cross-doc grep", () => {
  it("[FAILING UNTIL IMPL] returns per-doc line numbers and distinguishable result sets", async () => {
    const { llm } = makeScriptedLLM(
      fromScript(PHASE3_PARENT_SCRIPT),
      () => "",
      SCENARIO_QUERY
    );
    const result = (await runRLMFromContent(SCENARIO_QUERY, ALL_DOCS, {
      llmClient: llm,
      adapter: createNucleusAdapter(),
      maxTurns: 4,
      ragEnabled: false,
    })) as string;

    // The script finals as `deploy=<JSON-array> outage=<JSON-array>`.
    // The arrays contain `"groups": []` literals so a lazy regex
    // would match the inner closing `]` instead of the outer one.
    // We parse by splitting on the marker and balancing brackets.
    function extractJsonAfter(label: string): unknown {
      const idx = result.indexOf(`${label}=[`);
      if (idx < 0) return null;
      const start = result.indexOf("[", idx);
      let depth = 0;
      for (let i = start; i < result.length; i++) {
        if (result[i] === "[") depth++;
        else if (result[i] === "]") {
          depth--;
          if (depth === 0) {
            try {
              return JSON.parse(result.slice(start, i + 1));
            } catch {
              return null;
            }
          }
        }
      }
      return null;
    }
    const deployArr = extractJsonAfter("deploy") as
      | Array<{ match: string; lineNum: number }>
      | null;
    const outageArr = extractJsonAfter("outage") as
      | Array<{ match: string; lineNum: number }>
      | null;

    // The grep was case-insensitive (default flag), so DEPLOY matches
    // both "deploy" and "DEPLOY". The cited line is the upper-case
    // marker — pick that one.
    const deploy = deployArr?.find((m) => m.match === "DEPLOY");
    const outage = outageArr?.find((m) => /OUTAGE/.test(m.match));

    const snapshot = {
      mode: "phase3",
      scenario: "cross-document-correlation",
      docCount: ALL_DOCS.length,
      result,
      deployLineNumReported: deploy?.lineNum ?? null,
      outageLineNumReported: outage?.lineNum ?? null,
      expected: {
        deployLineNum: EXPECTED_DEPLOY_LINE_NUM,
        outageLineNum: EXPECTED_OUTAGE_LINE_NUM,
      },
      perDocProvenance: deploy != null && outage != null,
    };
    await writeFile(AFTER_PATH, JSON.stringify(snapshot, null, 2) + "\n", "utf-8");
    // eslint-disable-next-line no-console
    console.log("[phase3-after]", snapshot);

    // Correctness gates.
    expect(deploy).toBeTruthy();
    expect(outage).toBeTruthy();
    // Per-doc line numbers — the whole point of multi-context.
    expect(deploy!.lineNum).toBe(EXPECTED_DEPLOY_LINE_NUM);
    expect(outage!.lineNum).toBe(EXPECTED_OUTAGE_LINE_NUM);
    // Result sets are distinguishable.
    expect(result).toMatch(/deploy=/);
    expect(result).toMatch(/outage=/);
  });
});
