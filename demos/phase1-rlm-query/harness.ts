/**
 * Phase 1 — rlm_query benchmark harness.
 *
 * Measures the difference between the existing recursion path (today's
 * `(llm_query …)` + `subRLMMaxDepth: 1`) and the proposed Phase 1 path
 * (`(rlm_query "task" (context $h))` — handle-as-document, opt-in
 * per-call).
 *
 * The harness is deterministic: scripted LLM, char-count proxy for tokens,
 * fixed scenario data. No real API spend.
 */

import { runRLM } from "../../src/rlm.js";
import { createNucleusAdapter } from "../../src/adapters/nucleus.js";
import { writeFile, mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

export interface BenchMetrics {
  parentChars: number;
  childChars: number;
  totalChars: number;
  parentCalls: number;
  childCalls: number;
  totalCalls: number;
  /** All raw prompts seen, for forensic diffing across modes. */
  promptLog: Array<{ role: "parent" | "child"; chars: number; head: string }>;
}

/**
 * The framing prefix `runRLM` injects into a `(llm_query …)`-driven
 * child sub-RLM's user message. Used as ONE of two child-detection
 * signals; the other is "the prompt's `Query:` line is something
 * other than the parent's original query," which catches
 * `(rlm_query …)` children whose user message is `Query: <rlm_query
 * prompt>`.
 */
export const CHILD_FRAMING_PREFIX = "Analyze and answer based on";

/**
 * Infer how many turns a sub-RLM has already completed from its prompt
 * history. The runRLM loop appends a `Bindings:` line after every
 * successful turn, so counting those occurrences tells us whether this
 * is the child's turn 1, 2, 3, ... regardless of how many other
 * children share the script.
 *
 * Falls back to 1 (turn-one) if no markers are found.
 */
export function inferTurn(prompt: string): number {
  const matches = prompt.match(/\nBindings:\n/g);
  return (matches ? matches.length : 0) + 1;
}

export type Responder = (
  prompt: string,
  turn: number
) => string | Promise<string>;

/**
 * Build an instrumented scripted LLM driven by callback responders.
 * Each child invocation gets its own per-child turn inference (via
 * `inferTurn`), so multiple children with the same script don't share
 * a global counter.
 *
 * `parentQuery` (when supplied) is matched against the prompt's
 * `Query:` line — when the line carries something else, the call is
 * attributed to a child. This catches `(rlm_query …)` children, whose
 * user message is `Query: <rlm_query prompt>` rather than the
 * `subRLMSpawner`'s `Analyze and answer based on …` framing.
 */
export function makeScriptedLLM(
  parentResponder: Responder,
  childResponder: Responder,
  parentQuery?: string
): { llm: (p: string) => Promise<string>; metrics: BenchMetrics } {
  const metrics: BenchMetrics = {
    parentChars: 0,
    childChars: 0,
    totalChars: 0,
    parentCalls: 0,
    childCalls: 0,
    totalCalls: 0,
    promptLog: [],
  };

  return {
    metrics,
    llm: async (prompt: string) => {
      let isChild = prompt.includes(CHILD_FRAMING_PREFIX);
      if (!isChild && parentQuery) {
        // Look at the LATEST `Query:` line in the prompt (the user
        // message). If it doesn't carry the parent's original query,
        // this is a child invocation (e.g. an `(rlm_query …)` child
        // whose user message is `Query: <rlm_query prompt>`).
        const lastQueryIdx = prompt.lastIndexOf("Query: ");
        if (lastQueryIdx >= 0) {
          const after = prompt.slice(lastQueryIdx + "Query: ".length);
          const newlineIdx = after.indexOf("\n");
          const queryLine = (newlineIdx >= 0 ? after.slice(0, newlineIdx) : after).trim();
          if (queryLine && queryLine !== parentQuery.trim()) {
            isChild = true;
          }
        }
      }
      const turn = inferTurn(prompt);
      metrics.totalCalls++;
      metrics.totalChars += prompt.length;
      if (isChild) {
        metrics.childCalls++;
        metrics.childChars += prompt.length;
        metrics.promptLog.push({
          role: "child",
          chars: prompt.length,
          head: prompt.slice(0, 80).replace(/\n/g, " "),
        });
        return childResponder(prompt, turn);
      }
      metrics.parentCalls++;
      metrics.parentChars += prompt.length;
      metrics.promptLog.push({
        role: "parent",
        chars: prompt.length,
        head: prompt.slice(0, 80).replace(/\n/g, " "),
      });
      return parentResponder(prompt, turn);
    },
  };
}

/** Helper: turn an array script into a Responder driven by `turn`. */
export function fromScript(script: string[]): Responder {
  return (_prompt, turn) => script[turn - 1] ?? script.at(-1) ?? "";
}

export async function writeFixture(content: string): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "phase1-rlm-"));
  const path = join(dir, "doc.txt");
  await writeFile(path, content, "utf-8");
  return path;
}

export interface RunOptions {
  query: string;
  documentContent: string;
  parentResponder: Responder;
  childResponder: Responder;
  subRLMMaxDepth: number;
  maxTurns?: number;
}

/** Run a single scenario through `runRLM`, return both the answer and metrics. */
export async function runBench(
  opts: RunOptions
): Promise<{ result: string; metrics: BenchMetrics }> {
  const { llm, metrics } = makeScriptedLLM(
    opts.parentResponder,
    opts.childResponder,
    opts.query
  );
  const path = await writeFixture(opts.documentContent);
  const result = await runRLM(opts.query, path, {
    llmClient: llm,
    adapter: createNucleusAdapter(),
    maxTurns: opts.maxTurns ?? 6,
    ragEnabled: false,
    subRLMMaxDepth: opts.subRLMMaxDepth,
  });
  return { result: typeof result === "string" ? result : String(result), metrics };
}

/** Pretty-print a metrics object for snapshot files. */
export function summarize(metrics: BenchMetrics): Record<string, unknown> {
  return {
    parentChars: metrics.parentChars,
    childChars: metrics.childChars,
    totalChars: metrics.totalChars,
    parentCalls: metrics.parentCalls,
    childCalls: metrics.childCalls,
    totalCalls: metrics.totalCalls,
    avgParentChars:
      metrics.parentCalls > 0
        ? Math.round(metrics.parentChars / metrics.parentCalls)
        : 0,
    avgChildChars:
      metrics.childCalls > 0
        ? Math.round(metrics.childChars / metrics.childCalls)
        : 0,
  };
}
