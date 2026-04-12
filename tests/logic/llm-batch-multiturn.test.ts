/**
 * Tests for the batched multi-turn LLM protocol — the `(llm_batch …)`
 * counterpart to `tests/logic/llm-query-multiturn.test.ts`.
 *
 * The protocol works by:
 * 1. The solver hits (llm_batch COLL (lambda x (llm_query …))) and
 *    collects every interpolated prompt into a single array, then
 *    awaits tools.llmBatch(prompts).
 * 2. The bridge creates ONE pending promise with all N prompts and
 *    signals suspension (in contrast to llm_query, which suspends
 *    once per map iteration).
 * 3. The tool handler returns a single suspension request containing
 *    all N prompts to the LLM client.
 * 4. The LLM client calls back with an array of N responses.
 * 5. The bridge resolves the pending promise with the array.
 * 6. The solver returns the array as the final value.
 *
 * These tests exercise the core mechanism using NucleusEngine directly,
 * asserting that a batch dispatch fires EXACTLY ONE suspension regardless
 * of collection size (the whole point of the optimization).
 */

import { describe, it, expect } from "vitest";
import { NucleusEngine } from "../../src/engine/nucleus-engine.js";

interface PendingBatch {
  id: string;
  prompts: string[];
  resolve: (responses: string[]) => void;
  reject: (error: Error) => void;
}

type EngineResult = Awaited<ReturnType<NucleusEngine["execute"]>>;

function createBatchBridge() {
  const pendingBatches = new Map<string, PendingBatch>();
  let suspensionCallback:
    | ((info: { id: string; prompts: string[] }) => void)
    | null = null;
  let earlySuspension: { id: string; prompts: string[] } | null = null;

  const bridge = async (prompts: string[]): Promise<string[]> => {
    const id = `b_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

    const promise = new Promise<string[]>((resolve, reject) => {
      pendingBatches.set(id, { id, prompts, resolve, reject });
    });

    if (suspensionCallback) {
      suspensionCallback({ id, prompts });
    } else {
      earlySuspension = { id, prompts };
    }

    return promise;
  };

  function setCallback(
    cb: ((info: { id: string; prompts: string[] }) => void) | null
  ) {
    suspensionCallback = cb;
  }

  function respond(id: string, responses: string[]) {
    const entry = pendingBatches.get(id);
    if (entry) {
      pendingBatches.delete(id);
      entry.resolve(responses);
    }
  }

  function rejectAll(reason: string) {
    for (const [id, entry] of pendingBatches) {
      entry.reject(new Error(reason));
      pendingBatches.delete(id);
    }
  }

  function clearEarly() {
    earlySuspension = null;
  }

  return {
    bridge,
    setCallback,
    respond,
    rejectAll,
    clearEarly,
    getEarlySuspension: () => earlySuspension,
    getPending: () => pendingBatches,
  };
}

type RaceResult =
  | { type: "completed"; result: EngineResult }
  | { type: "suspended"; id: string; prompts: string[] };

function raceExecution(
  execPromise: Promise<EngineResult>,
  ctx: {
    setCallback: (
      cb: ((info: { id: string; prompts: string[] }) => void) | null
    ) => void;
    getEarlySuspension: () => { id: string; prompts: string[] } | null;
    clearEarly: () => void;
  }
): Promise<RaceResult> {
  const early = ctx.getEarlySuspension();
  if (early) {
    ctx.clearEarly();
    return Promise.resolve({ type: "suspended", ...early });
  }

  let resolveSuspension: (info: { id: string; prompts: string[] }) => void;
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
  ctx: ReturnType<typeof createBatchBridge>,
  responses: string[]
): Promise<RaceResult> {
  ctx.respond(race.id, responses);
  return raceExecution(execPromise, ctx);
}

describe("llm_batch multi-turn protocol", () => {
  it("fires exactly one suspension carrying all N prompts", async () => {
    const ctx = createBatchBridge();
    const engine = new NucleusEngine({ llmBatch: ctx.bridge });
    engine.loadContent("line1\nline2\nline3");

    await engine.execute('(grep "line")');

    ctx.clearEarly();
    const execPromise = engine.execute(
      '(llm_batch RESULTS (lambda x (llm_query "tag: {item}" (item x))))'
    );

    const race = await raceExecution(execPromise, ctx);
    expect(race.type).toBe("suspended");
    if (race.type !== "suspended") return;

    // Key assertion: ALL three prompts present in a SINGLE suspension.
    expect(race.prompts).toHaveLength(3);
    expect(race.prompts[0]).toContain("line1");
    expect(race.prompts[1]).toContain("line2");
    expect(race.prompts[2]).toContain("line3");

    // Respond with all three at once.
    const next = await respondAndContinue(race, execPromise, ctx, [
      "tag-A",
      "tag-B",
      "tag-C",
    ]);

    // Key assertion: no more suspensions — we went from one suspend to
    // completion, NOT three serial suspensions like map+llm_query.
    expect(next.type).toBe("completed");
    if (next.type !== "completed") return;
    expect(next.result.success).toBe(true);
    expect(next.result.value).toEqual(["tag-A", "tag-B", "tag-C"]);
  });

  it("batch over N items fires exactly 1 suspension (the payoff)", async () => {
    // The whole point: map+llm_query fires N suspensions, llm_batch
    // fires 1 regardless of N. The first test already asserts N=3 in a
    // single suspension; this one loops defensively to catch any path
    // that would re-suspend after the first response.
    const batchCtx = createBatchBridge();
    const batchEngine = new NucleusEngine({ llmBatch: batchCtx.bridge });
    batchEngine.loadContent("line-one\nline-two\nline-three");
    await batchEngine.execute('(grep "line")');

    batchCtx.clearEarly();
    const execPromise = batchEngine.execute(
      '(llm_batch RESULTS (lambda x (llm_query "echo: {item}" (item x))))'
    );

    let suspensionCount = 0;
    let race = await raceExecution(execPromise, batchCtx);
    while (race.type === "suspended") {
      suspensionCount++;
      race = await respondAndContinue(
        race,
        execPromise,
        batchCtx,
        race.prompts.map((p) => p.replace("echo: ", ""))
      );
    }

    expect(suspensionCount).toBe(1); // <-- the payoff
    expect(race.result.success).toBe(true);
    expect(race.result.value).toEqual(["line-one", "line-two", "line-three"]);
  });

  it("rejecting a pending batch propagates as solver error", async () => {
    const ctx = createBatchBridge();
    const engine = new NucleusEngine({ llmBatch: ctx.bridge });
    engine.loadContent("line-x\nline-y");

    await engine.execute('(grep "line")');

    ctx.clearEarly();
    const execPromise = engine.execute(
      '(llm_batch RESULTS (lambda x (llm_query "p: {item}" (item x))))'
    );
    const race = await raceExecution(execPromise, ctx);

    expect(race.type).toBe("suspended");

    ctx.rejectAll("Session expired");

    const result = await execPromise;
    expect(result.success).toBe(false);
    expect(result.error).toContain("Session expired");
  });

  it("empty collection completes with no suspension", async () => {
    const ctx = createBatchBridge();
    const engine = new NucleusEngine({ llmBatch: ctx.bridge });
    engine.loadContent("content");
    // No grep hits → RESULTS is an empty array.
    await engine.execute('(grep "no-matches")');

    ctx.clearEarly();
    const execPromise = engine.execute(
      '(llm_batch RESULTS (lambda x (llm_query "p: {item}" (item x))))'
    );
    const race = await raceExecution(execPromise, ctx);

    expect(race.type).toBe("completed");
    if (race.type !== "completed") return;
    expect(race.result.success).toBe(true);
    expect(race.result.value).toEqual([]);
    expect(ctx.getPending().size).toBe(0);
  });

  it("errors cleanly when llmBatch bridge is not provided", async () => {
    const engine = new NucleusEngine({}); // no bridge
    engine.loadContent("line-x\nline-y");
    await engine.execute('(grep "line")');
    const result = await engine.execute(
      '(llm_batch RESULTS (lambda x (llm_query "p: {item}" (item x))))'
    );
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/llm_batch is not available/i);
  });
});
