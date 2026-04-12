/**
 * Benchmark: schema-validated vs free-form llm_batch.
 *
 * The point of `(one_of …)` is not token savings — per-item prompts
 * actually grow by ~50 chars to carry the allowed-values directive —
 * but RELIABILITY of the downstream composition. Without validation,
 * real LLMs return things like "Low" or "low — simple function" or
 * " LOW\n" and `(filter $res (lambda x (match x "low" 0)))` silently
 * includes or excludes items based on substring accidents. With
 * validation, the solver canonicalizes each response to the declared
 * spelling, so exact-string filters match what the user intended.
 *
 * This benchmark uses a deliberately-noisy mock model that produces
 * realistic-looking output drift (case variation, trailing prose,
 * whitespace) and contrasts two pipelines:
 *
 *   (a) No schema → filter on substring → wrong count
 *   (b) With (one_of …) → filter on exact match → right count
 *
 * The assertions pin the numbers so the test can't quietly degrade
 * if the solver's validation path regresses.
 */

import { describe, it, expect } from "vitest";
import { NucleusEngine } from "../../src/engine/nucleus-engine.js";

// Noisy mock. Deterministic and KEYED ON ITEM NUMBER — not prompt
// content — so both runs see the same drift distribution. Keying on
// the prompt would fail the fair-comparison invariant because the
// schema path adds an allowed-values directive to every prompt, which
// shifts the prompt hash. The item number lives in the prompt text
// ("line-N"), so we parse it out.
function noisyRating(prompt: string): string {
  const m = prompt.match(/line-(\d+)/);
  const n = m ? (parseInt(m[1], 10) - 1) % 6 : 0;
  switch (n) {
    case 0: return "low";
    case 1: return "LOW"; // case drift
    case 2: return "  medium  "; // whitespace
    case 3: return "High\n"; // trailing newline
    case 4: return "high"; // clean
    case 5: return "medium"; // clean
  }
  return "medium";
}

describe("schema benchmark: one_of vs free-form llm_batch", () => {
  it("canonicalizes N noisy responses into a filter-safe enum", async () => {
    // Inline 20-item corpus; the literal "line-N" tokens let the mock
    // key deterministically on item number regardless of schema state.
    // Corpus size (20) is chosen so the mock covers every drift
    // variant more than once, exercising all canonicalization paths.
    const items = Array.from({ length: 20 }, (_, i) => `line-${i + 1}`).join("\n");

    // Both runs use the same noisy bridge so the comparison is fair.
    const makeBridge = () => async (prompts: string[]) => prompts.map(noisyRating);

    // ---- Run A: no schema, raw responses ----
    const engineA = new NucleusEngine({ llmBatch: makeBridge() });
    engineA.loadContent(items);
    await engineA.execute('(grep "line-")');

    const resultA = await engineA.execute(
      '(llm_batch RESULTS (lambda x (llm_query "Rate: {item}" (item x))))'
    );
    expect(resultA.success).toBe(true);
    const rawA = resultA.value as string[];

    // ---- Run B: same bridge, now with (one_of "low" "medium" "high") ----
    const engineB = new NucleusEngine({ llmBatch: makeBridge() });
    engineB.loadContent(items);
    await engineB.execute('(grep "line-")');

    const resultB = await engineB.execute(
      '(llm_batch RESULTS ' +
        '(lambda x (llm_query "Rate: {item}" (item x) ' +
        '(one_of "low" "medium" "high"))))'
    );
    expect(resultB.success).toBe(true);
    const cleanB = resultB.value as string[];

    // Sanity: both paths produced 20 responses (schema validation
    // passes because canonicalization handles all the drift variants).
    expect(rawA).toHaveLength(20);
    expect(cleanB).toHaveLength(20);

    // The core demonstration: exact-string filtering on the raw path
    // silently drops drifted values, while the schema path gets them
    // all. Count the "low" bucket via strict equality in both.
    const rawLowCount = rawA.filter((r) => r === "low").length;
    const rawLowCaseInsensitive = rawA.filter(
      (r) => r.trim().toLowerCase() === "low"
    ).length;
    const cleanLowCount = cleanB.filter((r) => r === "low").length;

    // With the canonicalizer, the exact-match count equals what you'd
    // get from a much more elaborate case-insensitive trim filter on
    // the raw path — i.e. the schema is doing that normalization for
    // you upstream so downstream queries stay simple.
    expect(cleanLowCount).toBe(rawLowCaseInsensitive);

    // And the naive-exact-match filter on the raw path undercounts,
    // by at least one item, because "LOW" and " LOW\n" don't match.
    expect(rawLowCount).toBeLessThan(cleanLowCount);

    const allCanonical = cleanB.every(
      (r) => r === "low" || r === "medium" || r === "high"
    );
    expect(allCanonical).toBe(true);

    const report =
      `\n── one_of vs free-form llm_batch ──\n` +
      `  N items                       : 20\n` +
      `  raw responses (drift included): ` +
        JSON.stringify([...new Set(rawA)]) +
        `\n` +
      `  canonicalized responses        : ` +
        JSON.stringify([...new Set(cleanB)]) +
        `\n` +
      `  naive filter (=="low") raw    : ${rawLowCount}\n` +
      `  case-insensitive filter raw   : ${rawLowCaseInsensitive}\n` +
      `  naive filter (=="low") schema : ${cleanLowCount}  ← reliable\n` +
      `  downstream composability win  : schema path lets downstream\n` +
      `    queries use exact-string filters safely; raw path forces\n` +
      `    every downstream consumer to re-implement normalization.\n`;
    console.log(report);
  });

  it("fails the whole batch with a specific index when one item drifts OOB", async () => {
    // Contract test: if the model genuinely produces something NOT in
    // the enum (e.g. "not-sure"), the validator fails the batch and
    // names the offending item so the caller can retry or investigate.
    // This prevents garbage from slipping into downstream handles.
    const bridge = async (prompts: string[]) =>
      prompts.map((_, i) => (i === 1 ? "not-sure" : "low"));

    const engine = new NucleusEngine({ llmBatch: bridge });
    engine.loadContent("line-x\nline-y\nline-z");
    await engine.execute('(grep "line")');

    const result = await engine.execute(
      '(llm_batch RESULTS (lambda x ' +
        '(llm_query "Rate: {item}" (item x) (one_of "low" "medium" "high"))))'
    );
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/one_of/);
    expect(result.error).toMatch(/not-sure/);
    expect(result.error).toMatch(/index 1|item 2/);
  });
});
