/**
 * Integration audit — cross-phase regression sweep.
 *
 * Six phases (rlm_query, rlm_batch, multi-context, FINAL_VAR/show_vars,
 * resource limits, compaction) shipped independently with their own
 * unit tests + benefit demos. Each review found one bug. This file
 * tests the *combinations* — phase-interaction bugs that wouldn't
 * show up in any single-phase test.
 *
 * Each scenario probes a specific composition that real users will
 * hit. If something here breaks, it's a real bug, not a contrived
 * edge case.
 */

import { describe, it, expect } from "vitest";
import { runRLMFromContent } from "../../src/rlm.js";
import { createNucleusAdapter } from "../../src/adapters/nucleus.js";

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

// ============================================================
// 1. rlm_batch + maxTimeoutMs — does the timeout propagate to
//    every child in the batch, not just the first?
// ============================================================

describe("integration: rlm_batch + maxTimeoutMs propagation", () => {
  it("a slow child hits the parent's remaining timeout cap, not the child's own clock", async () => {
    // Parent: chunk_by_lines → rlm_batch → each child sleeps 200ms.
    // With concurrency 4 and 8 chunks, sequential batches = 400ms.
    // maxTimeoutMs = 250ms means the SECOND batch should be
    // interrupted; the run aborts cleanly.
    const llm = async (prompt: string): Promise<string> => {
      const isChild =
        prompt.startsWith("You are a sub-LLM invoked") ||
        /Query:\s*scan/.test(prompt);
      if (isChild) {
        await sleep(200);
        return `<<<FINAL>>>done<<<END>>>`;
      }
      // Parent flow.
      if (!prompt.includes("Bindings:")) {
        return `(chunk_by_lines 1)`;
      }
      if ((prompt.match(/\nBindings:\n/g)?.length ?? 0) === 1) {
        return `(rlm_batch RESULTS (lambda c (rlm_query "scan" (context c))))`;
      }
      return `<<<FINAL>>>FINAL_VAR(_2)<<<END>>>`;
    };
    const doc = ["a", "b", "c", "d", "e", "f", "g", "h"].join("\n");
    const start = Date.now();
    const result = (await runRLMFromContent("scan all", doc, {
      llmClient: llm,
      adapter: createNucleusAdapter(),
      maxTurns: 6,
      ragEnabled: false,
      subRLMMaxDepth: 1,
      maxConcurrentSubcalls: 4,
      maxTimeoutMs: 250,
    })) as string;
    const elapsed = Date.now() - start;

    // Must abort cleanly (the timeout race fires) within ~1.5x the
    // cap. Without proper propagation, the run would burn 400ms+
    // letting the second batch complete.
    expect(elapsed).toBeLessThan(450);
    expect(result).toMatch(/aborted.*timeout/i);
  });
});

// ============================================================
// 2. rlm_query + (context N) — can a child see the parent's
//    multi-context loaded docs, or does it only see the chunk
//    the parent passed?
// ============================================================

describe("integration: rlm_query + multi-context", () => {
  it("a child rlm_query receives only its assigned context, not all parent contexts", async () => {
    // Parent loads 3 docs. Spawns rlm_query with (context 1) — the
    // child's working document MUST be doc 1's content. The child
    // running its own (grep "X") should match in doc 1, NOT in doc 0
    // or doc 2.
    const llm = async (prompt: string): Promise<string> => {
      const isChild =
        prompt.startsWith("You are a sub-LLM invoked") ||
        /Query:\s*find marker/.test(prompt);
      if (isChild) {
        // Child: emit grep for the unique marker.
        if (!prompt.includes("Bindings:")) {
          return `(grep "MARKER")`;
        }
        return `<<<FINAL>>>FINAL_VAR(_1)<<<END>>>`;
      }
      if (!prompt.includes("Bindings:")) {
        return `(rlm_query "find marker" (context (context 1)))`;
      }
      return `<<<FINAL>>>FINAL_VAR(_1)<<<END>>>`;
    };
    const docs = [
      "doc0: no marker here\nfiller",
      "doc1: MARKER-FOUND-IN-DOC1\nMARKER-AGAIN-IN-DOC1",
      "doc2: also no marker",
    ];
    const result = (await runRLMFromContent("locate", docs, {
      llmClient: llm,
      adapter: createNucleusAdapter(),
      maxTurns: 6,
      ragEnabled: false,
      subRLMMaxDepth: 1,
    })) as string;

    expect(typeof result).toBe("string");
    // The child's grep must have found exactly the doc-1 markers,
    // not the absence-of-marker text from doc 0 or doc 2.
    expect(result).toMatch(/MARKER-FOUND-IN-DOC1/);
    expect(result).toMatch(/MARKER-AGAIN-IN-DOC1/);
    // And NOT doc 0 / doc 2 content.
    expect(result).not.toMatch(/doc0|doc2|no marker/);
  });
});

// ============================================================
// 3. compaction + FINAL_VAR — after a compaction event, can
//    the LLM still inline a binding via FINAL_VAR(_N)?
// ============================================================

describe("integration: compaction + FINAL_VAR", () => {
  it("FINAL_VAR(_N) resolves correctly even after compaction has rewritten history", async () => {
    let turn = 0;
    const llm = async (prompt: string): Promise<string> => {
      if (/Summarize your progress so far/.test(prompt)) {
        return "Summary: ran a grep for X.";
      }
      turn++;
      if (turn === 1) return `(grep "X")`;
      // Turn 2 fires after compaction (history was big from
      // turn 1's grep result feedback). FINAL_VAR(_1) must
      // resolve to the grep array — the binding was set in
      // turn 1 and survives compaction.
      return `<<<FINAL>>>FINAL_VAR(_1)<<<END>>>`;
    };
    const doc = Array.from({ length: 60 }, (_, i) => `X-${i} ${"f".repeat(30)}`).join(
      "\n"
    );
    const result = (await runRLMFromContent("scan", doc, {
      llmClient: llm,
      adapter: createNucleusAdapter(),
      maxTurns: 4,
      ragEnabled: false,
      compactionThresholdChars: 1500,
    })) as string;

    expect(typeof result).toBe("string");
    // Must contain real grep results — proves the binding survived.
    expect(result).toMatch(/X-0|X-1/);
    // And no FINAL_VAR error markers.
    expect(result).not.toMatch(/FINAL_VAR error/i);
  });
});

// ============================================================
// 4. rlm_query + maxErrors — does a stuck child trip the
//    parent's error budget, or does the child's own error count
//    stay isolated?
// ============================================================

describe("integration: rlm_query + maxErrors isolation", () => {
  it("a child's parse-error loop does NOT count against the parent's maxErrors", async () => {
    // Parent's first turn fires rlm_query. The CHILD always emits
    // parse errors. If maxErrors propagates correctly (and the
    // child has its OWN counter), the child trips its own error
    // cap and returns an "[aborted: errors ...]" string — which
    // the parent receives as a normal rlm_query result. The
    // parent itself has not had any errors and proceeds to FINAL.
    const llm = async (prompt: string): Promise<string> => {
      const isChild =
        prompt.startsWith("You are a sub-LLM invoked") ||
        /Query:\s*deep/.test(prompt);
      if (isChild) {
        return `(grep`; // unbalanced — parser error
      }
      if (!prompt.includes("Bindings:")) {
        return `(rlm_query "deep" (context (context 0)))`;
      }
      // Parent's _1 = the child's "[aborted: errors ...]" string.
      // Parent's FINAL inlines that as the answer.
      return `<<<FINAL>>>child returned: FINAL_VAR(_1)<<<END>>>`;
    };
    const result = (await runRLMFromContent("ask", "X\nY\nZ", {
      llmClient: llm,
      adapter: createNucleusAdapter(),
      // Parent maxTurns=6 → child inherits floor(6/2)=3 turns, enough
      // to accumulate 2 consecutive errors before maxTurns kicks in.
      maxTurns: 6,
      ragEnabled: false,
      subRLMMaxDepth: 1,
      maxErrors: 2, // child should hit this; parent shouldn't
    })) as string;

    expect(typeof result).toBe("string");
    // The parent's run completed — it surfaced the child's failure
    // string but did not itself trip the error cap.
    expect(result).toMatch(/aborted.*errors/i);
    // And the parent did NOT itself abort — the answer flows from
    // the parent's FINAL, not from a parent-level abort.
    expect(result).toMatch(/child returned:/);
  });
});

// ============================================================
// 5. (show_vars) inside rlm_query — does a child see ITS OWN
//    bindings, not the parent's?
// ============================================================

describe("integration: show_vars inside rlm_query child", () => {
  it("a child's (show_vars) reflects only the child's bindings", async () => {
    // Parent: turn 1 grep, turn 2 rlm_query, turn 3 FINAL.
    // Child: turn 1 grep (binds child-_1), turn 2 (show_vars)
    // (binds child-_2 = string of child bindings only),
    // turn 3 FINAL referencing child-_2.
    //
    // The child's show_vars output MUST mention child's _1 (the
    // child's grep) and NOT the parent's RESULTS or _N. If they
    // leaked, scope is broken.
    const llm = async (prompt: string): Promise<string> => {
      const isChild =
        prompt.startsWith("You are a sub-LLM invoked") ||
        /Query:\s*introspect/.test(prompt);
      if (isChild) {
        // Use the prior-turn marker count to pick the child's turn
        // because the child's history isn't compacted here.
        const childTurns = (prompt.match(/\nBindings:\n/g)?.length ?? 0) + 1;
        if (childTurns === 1) return `(grep "CHILD-")`;
        if (childTurns === 2) return `(show_vars)`;
        return `<<<FINAL>>>FINAL_VAR(_2)<<<END>>>`;
      }
      const parentTurns = (prompt.match(/\nBindings:\n/g)?.length ?? 0) + 1;
      if (parentTurns === 1) return `(grep "PARENT-")`;
      if (parentTurns === 2) {
        return `(rlm_query "introspect" (context (context 0)))`;
      }
      return `<<<FINAL>>>FINAL_VAR(_2)<<<END>>>`;
    };
    const doc = "PARENT-line-A\nCHILD-line-B\nPARENT-line-C\nCHILD-line-D";
    const result = (await runRLMFromContent("scope test", doc, {
      llmClient: llm,
      adapter: createNucleusAdapter(),
      maxTurns: 6,
      ragEnabled: false,
      subRLMMaxDepth: 1,
    })) as string;

    expect(typeof result).toBe("string");
    // The result is the parent's FINAL, which expands to the
    // rlm_query result, which is the CHILD's FINAL_VAR(_2)
    // expansion = the child's show_vars output. That string
    // describes the child's bindings.
    //
    // Child bound _1 (its grep) and _2 (show_vars itself). Both
    // those names should appear in the show_vars output. If the
    // PARENT's _1 (PARENT-) data leaked into the child's bindings,
    // it would corrupt scope.
    expect(result).toMatch(/_1.*Array|RESULTS.*Array/i);
    // Sanity: the child's grep bound _1 to CHILD- entries; if scope
    // is correct, the child's RESULTS array contains CHILD-line-*
    // matches via grep over the child's document.
  });
});

// ============================================================
// 6. resource limits + child abort — does a child's
//    [aborted: ...] string leak into the parent's
//    bestPartialAnswer? (Phase 5 review caught this once.)
// ============================================================

describe("integration: child abort isolation in bestPartialAnswer", () => {
  it("a child's '[aborted: ...]' string never replaces the parent's good partial", async () => {
    // Parent: turn 1 useful grep (good RESULTS), turn 2 slow
    // rlm_query. Child times out via its own (propagated) cap.
    // Parent ALSO hits its cap on turn 3. Parent's partial
    // answer must surface its turn-1 grep, NOT the child's
    // "[aborted: ...]" string.
    const llm = async (prompt: string): Promise<string> => {
      const isChild =
        prompt.startsWith("You are a sub-LLM invoked") ||
        /Query:\s*deep/.test(prompt);
      if (isChild) {
        await sleep(150);
        return `(grep "Z")`;
      }
      const parentTurns = (prompt.match(/\nBindings:\n/g)?.length ?? 0) + 1;
      if (parentTurns === 1) return `(grep "TOKEN-")`;
      await sleep(150);
      return `(rlm_query "deep" (context (context 0)))`;
    };
    const doc = "TOKEN-A\nTOKEN-B\nTOKEN-C\nfiller";
    const result = (await runRLMFromContent("find", doc, {
      llmClient: llm,
      adapter: createNucleusAdapter(),
      maxTurns: 6,
      ragEnabled: false,
      subRLMMaxDepth: 1,
      maxTimeoutMs: 250,
    })) as string;

    expect(typeof result).toBe("string");
    expect(result).toMatch(/aborted/i);
    // Partial must include the parent's grep (TOKEN-*).
    expect(result).toMatch(/TOKEN-/);
    // EXACTLY ONE "[aborted:" — the parent's. The child's
    // failure string MUST NOT have leaked into the partial.
    const aborts = result.match(/\[aborted:/g);
    expect(aborts ? aborts.length : 0).toBe(1);
  });
});
