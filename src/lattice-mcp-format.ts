/**
 * Wire-format helpers for the lattice MCP server's suspension
 * protocol. Extracted from `lattice-mcp-server.ts` so that tests can
 * assert the exact text a client will see without accidentally
 * importing the server entry point (which runs `main()` at module
 * load time and spawns a stdio transport).
 *
 * These are pure functions — no session state, no I/O.
 */

/**
 * Render the text body of a single `(llm_query …)` suspension. The
 * client resolves the pending query by calling `lattice_llm_respond`
 * with the matching id and a string response.
 */
export function formatSuspensionRequest(id: string, prompt: string): string {
  return (
    `[LLM_QUERY_REQUEST id=${id}]\n\n` +
    `Please respond to the following prompt:\n\n  ${prompt}\n\n` +
    `Respond using lattice_llm_respond:\n` +
    `  id: "${id}"\n` +
    `  response: "your response here"`
  );
}

/**
 * Render the text body of a batched `(llm_batch …)` suspension. All
 * N prompts are inlined in a single message so the sub-LLM can
 * compose all N responses in one reply via
 * `lattice_llm_batch_respond`.
 *
 * When `calibrate` is set (from a `(calibrate)` marker in the Nucleus
 * surface syntax), a prompting directive is inserted before the
 * per-prompt sections telling the model to scan the whole
 * distribution and establish a consistent scale. This is the
 * calibration feature's user-visible effect — everything else in the
 * stack is plumbing that delivers the flag here.
 */
export function formatBatchSuspensionRequest(
  id: string,
  prompts: string[],
  calibrate?: boolean
): string {
  const N = prompts.length;
  let text =
    `[LLM_BATCH_REQUEST id=${id} count=${N}]\n` +
    `Reply: lattice_llm_batch_respond id="${id}" responses=[${N} strings in order].\n`;
  if (calibrate) {
    text +=
      `CALIBRATION: scan all ${N} prompts first, set a consistent relative scale, then answer in order.\n`;
  }
  for (let i = 0; i < N; i++) {
    text += `\n--- Prompt ${i + 1}/${N} ---\n${prompts[i]}\n`;
  }
  return text;
}
