/**
 * Benchmark: map+llm_query vs llm_batch on the SAME task.
 *
 * This is the empirical payoff test for the llm_batch primitive. Both
 * approaches solve the same problem — rate complexity of every function
 * in a real TypeScript file — and the benchmark records the concrete
 * round-trip count and wire-level payload each approach generates.
 *
 * The file under analysis is chiasmus' src/mcp-server.ts (30KB, 939
 * lines, 12 top-level functions), which was the file used in the
 * conversation that motivated this feature. The 12-function size is
 * deliberately modest: if llm_batch wins at this scale, it wins big at
 * 50+ items, and we avoid depending on giant fixtures in the matryoshka
 * test suite.
 *
 * The "bridge" here is a counting shim — every time the solver routes
 * a prompt through tools.llmQuery or tools.llmBatch, we count it and
 * record the prompt length. This is exactly the MCP round-trip cost
 * under the multi-turn suspension protocol, because each real round-
 * trip corresponds 1:1 with one bridge invocation.
 *
 * The assertions are intentionally coarse: batch must fire exactly one
 * bridge call, map+llm_query must fire N. Those two numbers are the
 * whole point of the primitive.
 */

import { existsSync } from "node:fs";
import { describe, it, expect } from "vitest";
import { NucleusEngine } from "../../src/engine/nucleus-engine.js";
import { HandleSession } from "../../src/engine/handle-session.js";

const CHIASMUS_FILE = "/Users/yogthos/src/chiasmus/src/mcp-server.ts";

// Deterministic stand-in for a real LLM's "rate complexity" judgment.
// Maps prompt length → category, so the two approaches produce
// comparable results without needing real model calls.
function mockRating(prompt: string): string {
  const len = prompt.length;
  if (len < 500) return "low — trivial body, single concern.";
  if (len < 1500) return "medium — several branches but bounded scope.";
  return "high — multiple dispatch, nested state, non-local effects.";
}

interface BridgeStats {
  /** Number of times the bridge was invoked (= MCP round-trips). */
  calls: number;
  /** Cumulative prompt character count across all calls. */
  promptChars: number;
  /** Cumulative response character count across all calls. */
  responseChars: number;
  /** How many total items/prompts were processed across all calls. */
  itemsProcessed: number;
}

function createCountingQueryBridge(): {
  bridge: (prompt: string) => Promise<string>;
  stats: BridgeStats;
} {
  const stats: BridgeStats = {
    calls: 0,
    promptChars: 0,
    responseChars: 0,
    itemsProcessed: 0,
  };
  return {
    bridge: async (prompt: string) => {
      stats.calls++;
      stats.itemsProcessed++;
      stats.promptChars += prompt.length;
      const resp = mockRating(prompt);
      stats.responseChars += resp.length;
      return resp;
    },
    stats,
  };
}

function createCountingBatchBridge(): {
  bridge: (prompts: string[]) => Promise<string[]>;
  stats: BridgeStats;
} {
  const stats: BridgeStats = {
    calls: 0,
    promptChars: 0,
    responseChars: 0,
    itemsProcessed: 0,
  };
  return {
    bridge: async (prompts: string[]) => {
      stats.calls++;
      stats.itemsProcessed += prompts.length;
      for (const p of prompts) stats.promptChars += p.length;
      const out = prompts.map(mockRating);
      for (const r of out) stats.responseChars += r.length;
      return out;
    },
    stats,
  };
}

describe("llm_batch benchmark vs map+llm_query", () => {
  it("rates 12 functions — 1 bridge call instead of 12", async () => {
    // Skip silently if the fixture isn't present — the test is
    // environment-dependent and we don't want it to block unrelated CI.
    if (!existsSync(CHIASMUS_FILE)) {
      console.warn(`[benchmark] skip — ${CHIASMUS_FILE} not present`);
      return;
    }

    // list_symbols / get_symbol_body need the HandleSession layer
    // because it wires tree-sitter symbol extraction on loadFile. A
    // bare NucleusEngine only has grep/fuzzy/bm25 and would return
    // empty from list_symbols.

    // ---- Run A: map + llm_query (baseline — N serial bridge calls) ----
    const { bridge: queryBridge, stats: queryStats } = createCountingQueryBridge();
    const sessionA = new HandleSession({ llmQuery: queryBridge });
    await sessionA.loadFile(CHIASMUS_FILE);

    const resultA = await sessionA.execute(
      '(map (list_symbols "function") ' +
        '(lambda x (llm_query "Rate complexity: {name}\\n{body}" ' +
        '(name x) (body (get_symbol_body x)))))'
    );
    expect(resultA.success).toBe(true);
    // HandleSession returns array results via handle — the actual
    // data lives server-side. Expand to get the ratings array.
    const ratingsA = resultA.handle
      ? (sessionA.expand(resultA.handle).data as string[])
      : (resultA.value as string[]);
    sessionA.close();

    // ---- Run B: llm_batch (the new primitive — 1 bridge call) ----
    const { bridge: batchBridge, stats: batchStats } = createCountingBatchBridge();
    const sessionB = new HandleSession({ llmBatch: batchBridge });
    await sessionB.loadFile(CHIASMUS_FILE);

    const resultB = await sessionB.execute(
      '(llm_batch (list_symbols "function") ' +
        '(lambda x (llm_query "Rate complexity: {name}\\n{body}" ' +
        '(name x) (body (get_symbol_body x)))))'
    );
    expect(resultB.success).toBe(true);
    const ratingsB = resultB.handle
      ? (sessionB.expand(resultB.handle).data as string[])
      : (resultB.value as string[]);
    sessionB.close();

    // Both approaches must produce the same ratings (deterministic mock).
    expect(ratingsB).toEqual(ratingsA);
    expect(ratingsA.length).toBeGreaterThanOrEqual(10);

    // Core assertion: 12 round-trips → 1.
    expect(queryStats.calls).toBe(ratingsA.length);
    expect(batchStats.calls).toBe(1);
    expect(batchStats.itemsProcessed).toBe(queryStats.itemsProcessed);

    // Per-item prompt content must be identical between the two paths —
    // we're not saving tokens by truncating, we're saving round-trips.
    expect(batchStats.promptChars).toBe(queryStats.promptChars);

    // Report. The numbers below are the whole reason the primitive
    // exists; dumping them to stdout keeps the benchmark self-documenting
    // even when run in CI.
    const reduction = Math.round(
      (1 - batchStats.calls / queryStats.calls) * 100
    );
    const report =
      `\n── llm_batch vs map+llm_query benchmark ──\n` +
      `  file               : ${CHIASMUS_FILE}\n` +
      `  items (N)          : ${queryStats.itemsProcessed}\n` +
      `  map+llm_query calls: ${queryStats.calls}\n` +
      `  llm_batch    calls : ${batchStats.calls}\n` +
      `  round-trip reduction: ${reduction}% (${queryStats.calls} → ${batchStats.calls})\n` +
      `  prompt chars/run   : ${queryStats.promptChars.toLocaleString()} (identical — no truncation)\n` +
      `  response chars/run : ${queryStats.responseChars.toLocaleString()}\n` +
      `  result parity      : ${ratingsA.length} ratings, byte-identical\n`;
    console.log(report);
  });

  it("scales with N — 100 prompts still 1 bridge call", async () => {
    // Synthetic scale test to show the N-independence of the batch path.
    // No fixture file required; we use an inline document so the test
    // is hermetic.
    const lines = Array.from({ length: 100 }, (_, i) => `item-${i + 1}`).join("\n");

    const { bridge: queryBridge, stats: queryStats } = createCountingQueryBridge();
    const engineA = new NucleusEngine({ llmQuery: queryBridge });
    engineA.loadContent(lines);
    await engineA.execute('(grep "item-")');
    const resultA = await engineA.execute(
      '(map RESULTS (lambda x (llm_query "tag: {item}" (item x))))'
    );
    expect(resultA.success).toBe(true);

    const { bridge: batchBridge, stats: batchStats } = createCountingBatchBridge();
    const engineB = new NucleusEngine({ llmBatch: batchBridge });
    engineB.loadContent(lines);
    await engineB.execute('(grep "item-")');
    const resultB = await engineB.execute(
      '(llm_batch RESULTS (lambda x (llm_query "tag: {item}" (item x))))'
    );
    expect(resultB.success).toBe(true);

    expect(queryStats.calls).toBe(100);
    expect(batchStats.calls).toBe(1);
    expect(queryStats.itemsProcessed).toBe(100);
    expect(batchStats.itemsProcessed).toBe(100);

    console.log(
      `\n── scale test: N=100 ──\n` +
      `  map+llm_query calls: ${queryStats.calls}\n` +
      `  llm_batch    calls : ${batchStats.calls}\n` +
      `  reduction          : ${Math.round((1 - batchStats.calls / queryStats.calls) * 100)}%\n`
    );
  });
});
