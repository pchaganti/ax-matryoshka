/**
 * Tests for the multi-turn LLM query protocol — Promise-based suspension
 * that replaces MCP sampling for clients without sampling support.
 *
 * The protocol works by:
 * 1. The solver hits (llm_query ...) and awaits tools.llmQuery(prompt)
 * 2. The bridge creates a pending Promise and signals suspension
 * 3. The tool handler returns a suspension request to the LLM client
 * 4. The LLM client calls back with a response
 * 5. The bridge resolves the pending Promise
 * 6. The solver continues from where it left off
 *
 * These tests exercise the core mechanism using NucleusEngine directly,
 * simulating what lattice-mcp-server.ts does with raceExecution().
 */

import { describe, it, expect } from "vitest";
import { NucleusEngine } from "../../src/engine/nucleus-engine.js";

interface PendingQuery {
  id: string;
  prompt: string;
  resolve: (response: string) => void;
  reject: (error: Error) => void;
}

type EngineResult = Awaited<ReturnType<NucleusEngine["execute"]>>;

function createSuspendableBridge() {
  const pendingQueries = new Map<string, PendingQuery>();
  let suspensionCallback: ((info: { id: string; prompt: string }) => void) | null = null;
  let earlySuspension: { id: string; prompt: string } | null = null;

  const bridge = async (prompt: string): Promise<string> => {
    const id = `q_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

    const promise = new Promise<string>((resolve, reject) => {
      pendingQueries.set(id, { id, prompt, resolve, reject, createdAt: Date.now() });
    });

    if (suspensionCallback) {
      suspensionCallback({ id, prompt });
    } else {
      earlySuspension = { id, prompt };
    }

    return promise;
  };

  function setCallback(cb: ((info: { id: string; prompt: string }) => void) | null) {
    suspensionCallback = cb;
  }

  function getPending() {
    return pendingQueries;
  }

  function respond(id: string, response: string) {
    const entry = pendingQueries.get(id);
    if (entry) {
      pendingQueries.delete(id);
      entry.resolve(response);
    }
  }

  function rejectAll(reason: string) {
    for (const [id, entry] of pendingQueries) {
      entry.reject(new Error(reason));
      pendingQueries.delete(id);
    }
  }

  function clearEarly() {
    earlySuspension = null;
  }

  return { bridge, setCallback, getPending, respond, rejectAll, clearEarly, getEarlySuspension: () => earlySuspension };
}

type RaceResult =
  | { type: "completed"; result: EngineResult }
  | { type: "suspended"; id: string; prompt: string };

function raceExecution(
  execPromise: Promise<EngineResult>,
  ctx: { setCallback: (cb: ((info: { id: string; prompt: string }) => void) | null) => void; getEarlySuspension: () => { id: string; prompt: string } | null; clearEarly: () => void },
): Promise<RaceResult> {
  const early = ctx.getEarlySuspension();
  if (early) {
    ctx.clearEarly();
    return Promise.resolve({ type: "suspended", ...early });
  }

  let resolveSuspension: (info: { id: string; prompt: string }) => void;
  const suspensionPromise = new Promise<RaceResult>((resolve) => {
    resolveSuspension = (info) => resolve({ type: "suspended", ...info });
  });

  ctx.setCallback(resolveSuspension!);

  return Promise.race([
    execPromise.then((result): RaceResult => {
      ctx.setCallback(null);
      return { type: "completed", result };
    }),
    suspensionPromise,
  ]);
}

async function respondAndContinue(
  race: RaceResult & { type: "suspended" },
  execPromise: Promise<EngineResult>,
  ctx: ReturnType<typeof createSuspendableBridge>,
  response: string,
): Promise<RaceResult> {
  ctx.respond(race.id, response);
  return raceExecution(execPromise, ctx);
}

describe("multi-turn LLM query protocol", () => {
  it("suspends on top-level llm_query and resumes when responded", async () => {
    const ctx = createSuspendableBridge();
    const engine = new NucleusEngine({ llmQuery: ctx.bridge });
    engine.loadContent("some document content");

    ctx.clearEarly();
    const execPromise = engine.execute('(llm_query "classify this")');
    const race = await raceExecution(execPromise, ctx);

    expect(race.type).toBe("suspended");
    if (race.type !== "suspended") return;

    expect(race.prompt).toBe("classify this");

    const next = await respondAndContinue(race, execPromise, ctx, "It's a technical document");
    expect(next.type).toBe("completed");
    if (next.type !== "completed") return;
    expect(next.result.success).toBe(true);
    expect(next.result.value).toBe("It's a technical document");
  });

  it("handles map with llm_query — one suspension per item", async () => {
    const ctx = createSuspendableBridge();
    const engine = new NucleusEngine({ llmQuery: ctx.bridge });
    engine.loadContent("line1\nline2\nline3");

    await engine.execute('(grep "line")');

    ctx.clearEarly();
    const execPromise = engine.execute(
      '(map RESULTS (lambda x (llm_query "tag: {item}" (item x))))'
    );

    // Item 1
    let race = await raceExecution(execPromise, ctx);
    expect(race.type).toBe("suspended");
    if (race.type !== "suspended") return;
    expect(race.prompt).toContain("line1");

    let next = await respondAndContinue(race, execPromise, ctx, "tag-A");
    expect(next.type).toBe("suspended");
    if (next.type !== "suspended") return;
    expect(next.prompt).toContain("line2");

    next = await respondAndContinue(next, execPromise, ctx, "tag-B");
    expect(next.type).toBe("suspended");
    if (next.type !== "suspended") return;
    expect(next.prompt).toContain("line3");

    next = await respondAndContinue(next, execPromise, ctx, "tag-C");
    expect(next.type).toBe("completed");
    if (next.type !== "completed") return;
    expect(next.result.success).toBe(true);
    expect(next.result.value).toEqual(["tag-A", "tag-B", "tag-C"]);
  });

  it("filter with llm_query suspends per item", async () => {
    const ctx = createSuspendableBridge();
    const engine = new NucleusEngine({ llmQuery: ctx.bridge });
    engine.loadContent("good item\nbad item\nanother good item");

    await engine.execute('(grep "item")');

    ctx.clearEarly();
    const execPromise = engine.execute(
      '(filter RESULTS (lambda x (match (llm_query "judge: {item}" (item x)) "keep" 0)))'
    );

    // Item 1: "good item" → say "keep"
    let race = await raceExecution(execPromise, ctx);
    expect(race.type).toBe("suspended");
    if (race.type !== "suspended") return;
    expect(race.prompt).toContain("good item");

    let next = await respondAndContinue(race, execPromise, ctx, "keep");

    // Item 2: "bad item" → say "drop"
    expect(next.type).toBe("suspended");
    if (next.type !== "suspended") return;
    expect(next.prompt).toContain("bad item");

    next = await respondAndContinue(next, execPromise, ctx, "drop");

    // Item 3: "another good item" → say "keep"
    expect(next.type).toBe("suspended");
    if (next.type !== "suspended") return;
    expect(next.prompt).toContain("another good item");

    next = await respondAndContinue(next, execPromise, ctx, "keep");

    // Final result
    expect(next.type).toBe("completed");
    if (next.type !== "completed") return;
    expect(next.result.success).toBe(true);
    const filtered = next.result.value as Array<{ line: string }>;
    expect(filtered.map((r) => r.line)).toEqual(["good item", "another good item"]);
  });

  it("rejecting pending queries propagates as solver error", async () => {
    const ctx = createSuspendableBridge();
    const engine = new NucleusEngine({ llmQuery: ctx.bridge });
    engine.loadContent("content");

    ctx.clearEarly();
    const execPromise = engine.execute('(llm_query "prompt")');
    const race = await raceExecution(execPromise, ctx);

    expect(race.type).toBe("suspended");

    ctx.rejectAll("Session expired");

    const result = await execPromise;
    expect(result.success).toBe(false);
    expect(result.error).toContain("Session expired");
  });

  it("queries without llm_query complete normally without suspension", async () => {
    const ctx = createSuspendableBridge();
    const engine = new NucleusEngine({ llmQuery: ctx.bridge });
    engine.loadContent("ERROR: something\nWARN: other\nERROR: more");

    ctx.clearEarly();
    const execPromise = engine.execute('(grep "ERROR")');
    const race = await raceExecution(execPromise, ctx);

    expect(race.type).toBe("completed");
    if (race.type !== "completed") return;
    expect(race.result.success).toBe(true);
    const hits = race.result.value as Array<{ line: string }>;
    expect(hits).toHaveLength(2);
  });

  it("bindings are preserved across suspension boundaries", async () => {
    const ctx = createSuspendableBridge();
    const engine = new NucleusEngine({ llmQuery: ctx.bridge });
    engine.loadContent("hello world\nfoo bar");

    await engine.execute('(grep "hello")');

    ctx.clearEarly();
    const execPromise = engine.execute(
      '(llm_query "Summarize: {data}" (data RESULTS))'
    );

    const race = await raceExecution(execPromise, ctx);
    expect(race.type).toBe("suspended");
    if (race.type !== "suspended") return;

    expect(race.prompt).toContain("hello world");
    expect(race.prompt).not.toContain("{data}");

    const next = await respondAndContinue(race, execPromise, ctx, "A greeting document");
    expect(next.type).toBe("completed");
    if (next.type !== "completed") return;
    expect(next.result.success).toBe(true);
    expect(next.result.value).toBe("A greeting document");
  });
});
