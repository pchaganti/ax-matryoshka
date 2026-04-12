/**
 * Exercise: end-to-end calibration plumbing.
 *
 * The calibration feature is a prompting nudge — its real behavioral
 * payoff requires a live LLM and is out of scope for a unit test.
 * What we CAN verify empirically is that the `(calibrate)` marker in
 * surface syntax flows through every layer of the stack and ends up
 * in the exact text the MCP client will see in the suspension
 * request. This exercise tests the seam the feature has to cross:
 *
 *   user's Nucleus query   →   parser   →   solver   →   bridge   →
 *   → formatBatchSuspensionRequest → MCP tool reply text
 *
 * We drive the seam from both ends: assert the `calibrate` flag
 * reaches the bridge via the solver, and assert the rendered wire
 * text contains the directive language. If the directive wording is
 * ever changed in one place and not the other, this test breaks the
 * build before the regression ships.
 */

import { describe, it, expect } from "vitest";
import { NucleusEngine } from "../../src/engine/nucleus-engine.js";
import { formatBatchSuspensionRequest } from "../../src/lattice-mcp-format.js";

describe("calibrate end-to-end exercise", () => {
  it("forwards (calibrate) from surface syntax to bridge options", async () => {
    let seenOptions: { calibrate?: boolean } | undefined;
    const engine = new NucleusEngine({
      llmBatch: async (prompts, options) => {
        seenOptions = options;
        return prompts.map(() => "ok");
      },
    });
    engine.loadContent("line-a\nline-b\nline-c");
    await engine.execute('(grep "line")');

    const result = await engine.execute(
      '(llm_batch RESULTS (lambda x ' +
        '(llm_query "Rate: {item}" (item x) (calibrate))))'
    );
    expect(result.success).toBe(true);
    expect(seenOptions).toEqual({ calibrate: true });
  });

  it("omits the options arg entirely when no flags are set", async () => {
    // Backwards compatibility: a bridge written before calibrate
    // existed (signature `(prompts: string[]) => Promise<string[]>`)
    // must still work. The solver only passes the options arg when
    // there is something to forward.
    let passedArgCount = -1;
    const engine = new NucleusEngine({
      llmBatch: async (...args: unknown[]) => {
        passedArgCount = args.length;
        return (args[0] as string[]).map(() => "ok");
      },
    });
    engine.loadContent("line-a\nline-b");
    await engine.execute('(grep "line")');

    const result = await engine.execute(
      '(llm_batch RESULTS (lambda x (llm_query "tag: {item}" (item x))))'
    );
    expect(result.success).toBe(true);
    expect(passedArgCount).toBe(1);
  });

  it("renders the calibration directive into the wire suspension text", () => {
    // Contract test over the exact render function the MCP server
    // hands to the client. If the wording drifts from what the
    // calibrate test asserts, this breaks.
    const rendered = formatBatchSuspensionRequest(
      "b_test_123",
      ["Rate: item-1", "Rate: item-2", "Rate: item-3"],
      true
    );

    // The directive must name the batch size and the scale concept.
    expect(rendered).toContain("CALIBRATION");
    expect(rendered).toContain("3"); // N items
    expect(rendered.toLowerCase()).toContain("scale");
    // Must still carry the standard batch header and per-prompt
    // sections so the downstream flow isn't broken by the preamble.
    expect(rendered).toContain("[LLM_BATCH_REQUEST id=b_test_123 count=3]");
    expect(rendered).toContain("--- Prompt 1 of 3 ---");
    expect(rendered).toContain("--- Prompt 3 of 3 ---");
    expect(rendered).toContain("lattice_llm_batch_respond");
  });

  it("omits the calibration directive when calibrate is false/absent", () => {
    const renderedDefault = formatBatchSuspensionRequest(
      "b_test_456",
      ["Rate: x", "Rate: y"]
    );
    const renderedExplicitFalse = formatBatchSuspensionRequest(
      "b_test_456",
      ["Rate: x", "Rate: y"],
      false
    );
    for (const rendered of [renderedDefault, renderedExplicitFalse]) {
      expect(rendered).not.toContain("CALIBRATION");
      // Everything else should still render the same way.
      expect(rendered).toContain("[LLM_BATCH_REQUEST");
      expect(rendered).toContain("--- Prompt 1 of 2 ---");
    }
  });

  it("directive positioning: after the batch header, before the first prompt", () => {
    // The preamble is only useful if the LLM reads it BEFORE the
    // prompts. Assert the ordering so a future refactor that rolls
    // the directive to the tail of the message fails loudly.
    const rendered = formatBatchSuspensionRequest(
      "b_order",
      ["only-prompt"],
      true
    );
    const headerIdx = rendered.indexOf("[LLM_BATCH_REQUEST");
    const directiveIdx = rendered.indexOf("CALIBRATION");
    const firstPromptIdx = rendered.indexOf("--- Prompt 1 of 1 ---");

    expect(headerIdx).toBeGreaterThanOrEqual(0);
    expect(directiveIdx).toBeGreaterThan(headerIdx);
    expect(firstPromptIdx).toBeGreaterThan(directiveIdx);
  });

  it("prints the rendered wire text for visual inspection", () => {
    // Self-documenting: if you want to see what the model will
    // actually receive when a user writes `(calibrate)`, run this
    // benchmark and look at stdout. The assertion is a formality —
    // the real value is the printed text.
    const rendered = formatBatchSuspensionRequest(
      "b_demo",
      [
        "Rate complexity: handleVerify\nasync function handleVerify(...) { ... }",
        "Rate complexity: handleSkills\nfunction handleSkills(...) { ... }",
        "Rate complexity: handleFormalize\nasync function handleFormalize(...) { ... }",
      ],
      true
    );
    expect(rendered.length).toBeGreaterThan(200);
    console.log(
      `\n── what the model sees when (calibrate) is set ──\n${rendered}\n`
    );
  });
});
