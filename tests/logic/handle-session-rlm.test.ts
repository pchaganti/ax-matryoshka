/**
 * MCP-side plumbing for rlm_query / rlm_batch.
 *
 * HandleSession is what lattice-mcp-server uses to execute Nucleus
 * queries. Pre-Phase-1, the engine only had llmQuery/llmBatch wired
 * — calling (rlm_query …) or (rlm_batch …) via the MCP path threw
 * "not available in this execution context."
 *
 * This file locks down: when HandleSessionOptions includes rlmQuery
 * / rlmBatch callbacks (the lattice-mcp-server's samplingRlmBridge),
 * the recursive primitives work end-to-end — same surface as the
 * runRLM path.
 */

import { describe, it, expect } from "vitest";
import { HandleSession } from "../../src/engine/handle-session.js";

describe("HandleSession — rlm_query plumbing", () => {
  it("throws 'not available' when rlmQuery option is omitted (back-compat)", async () => {
    const session = new HandleSession();
    await session.loadContentWithSymbols("doc content", "/tmp/x.txt");
    const result = await session.execute('(rlm_query "test")');
    expect(result.success).toBe(false);
    expect(result.error ?? "").toMatch(/rlm_query.*not available/i);
    session.close();
  });

  it("dispatches (rlm_query …) through the rlmQuery callback when configured", async () => {
    let receivedPrompt: string | null = null;
    let receivedContext: string | null = "<unset>";
    const session = new HandleSession({
      rlmQuery: async (prompt, contextDoc) => {
        receivedPrompt = prompt;
        receivedContext = contextDoc;
        return "child returned this";
      },
    });
    await session.loadContentWithSymbols("doc content", "/tmp/x.txt");
    const result = await session.execute('(rlm_query "summarize")');
    expect(result.success).toBe(true);
    expect(receivedPrompt).toBe("summarize");
    expect(receivedContext).toBeNull();
    expect(result.value).toBe("child returned this");
    session.close();
  });

  it("dispatches (rlm_query \"p\" (context $h)) materializing the binding to the child", async () => {
    // Same handle-as-document semantics Phase 1 introduced — the
    // MCP path must preserve this so a child sees clean line-
    // oriented content, not a JSON blob.
    let receivedContext: string | null = null;
    const session = new HandleSession({
      rlmQuery: async (_p, c) => {
        receivedContext = c;
        return "ok";
      },
    });
    await session.loadContentWithSymbols("X-1\nX-2\nY", "/tmp/x.txt");
    // Bind RESULTS via grep, then pass it as context.
    await session.execute('(grep "X")');
    const result = await session.execute(
      '(rlm_query "scan" (context RESULTS))'
    );
    expect(result.success).toBe(true);
    // Materialized as one item per line.
    expect(typeof receivedContext).toBe("string");
    const lines = (receivedContext as unknown as string).split("\n");
    expect(lines).toHaveLength(2);
    expect(lines.every((l) => /^X-/.test(l))).toBe(true);
    session.close();
  });
});

describe("HandleSession — rlm_batch plumbing", () => {
  it("throws 'not available' when rlmBatch option is omitted", async () => {
    const session = new HandleSession();
    await session.loadContentWithSymbols("X\nY", "/tmp/x.txt");
    await session.execute('(grep "X")');
    const result = await session.execute(
      '(rlm_batch RESULTS (lambda c (rlm_query "p" (context c))))'
    );
    expect(result.success).toBe(false);
    expect(result.error ?? "").toMatch(/rlm_batch.*not available/i);
    session.close();
  });

  it("dispatches (rlm_batch …) through the rlmBatch callback when configured", async () => {
    let receivedItems: Array<{ prompt: string; contextDoc: string | null }> | null = null;
    const session = new HandleSession({
      rlmBatch: async (items) => {
        receivedItems = items;
        return items.map((_, i) => `r${i}`);
      },
    });
    await session.loadContentWithSymbols("X-1\nX-2\nX-3", "/tmp/x.txt");
    await session.execute('(grep "X")');
    const result = await session.execute(
      '(rlm_batch RESULTS (lambda c (rlm_query "tag" (context c))))'
    );
    expect(result.success).toBe(true);
    expect(receivedItems).toHaveLength(3);
    expect(receivedItems!.every((it) => it.prompt === "tag")).toBe(true);
    session.close();
  });
});
