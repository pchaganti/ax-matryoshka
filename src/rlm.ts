/**
 * RLM Execution Loop
 *
 * Implements the Recursive Language Model pattern from the paper.
 * The LLM iteratively writes TypeScript code to explore documents,
 * feeding results back until it reaches a final answer.
 */

import { readFile } from "node:fs/promises";
import { createToolRegistry, getToolInterfaces } from "./tools.js";
import type { LLMQueryFn } from "./llm/types.js";
import type { ModelAdapter, RAGHints } from "./adapters/types.js";
import { createNucleusAdapter } from "./adapters/nucleus.js";
import type { SynthesisConstraint } from "./constraints/types.js";
// verifyResult is now used in fsm/rlm-states.ts
import { getRAGManager, type RAGManager } from "./rag/manager.js";
import { validateRegex, type SolverTools } from "./logic/lc-solver.js";
import * as bm25Module from "./logic/bm25.js";
import * as semanticModule from "./logic/semantic.js";
import { FSMEngine } from "repl-sandbox";
import { buildRLMSpec, createInitialContext, type RLMContext } from "./fsm/rlm-states.js";

/**
 * Create SolverTools from document content
 * These are the same tools the sandbox provides, but standalone for the solver
 *
 * @param context - Document content
 * @param llmClient - Optional flat LLM entry point for the sub-LLM hook.
 *   Used for the default (depth=0) fast path where llm_query delegates
 *   to one round-trip through the parent's llmClient.
 * @param subRLMSpawner - Optional recursive sub-RLM spawner. When present,
 *   llm_query routes to this callback instead of the flat llmClient,
 *   allowing sub-calls to run their own FSM loops with their own
 *   Nucleus code execution. The spawner receives the already-interpolated
 *   prompt and is responsible for depth tracking, maxTurns scaling, and
 *   returning a string result. See `runRLM`'s sub-RLM wiring below.
 */
function createSolverTools(
  context: string,
  llmClient?: LLMQueryFn,
  subRLMSpawner?: (prompt: string) => Promise<string>
): SolverTools {
  const MAX_SOLVER_LINES = 500_000;
  let lines = context.split("\n");
  if (lines.length > MAX_SOLVER_LINES) {
    lines = lines.slice(0, MAX_SOLVER_LINES);
  }

  // Pre-compute text stats
  const textStats = {
    length: context.length,
    lineCount: lines.length,
    sample: {
      start: lines.slice(0, 5).join("\n"),
      middle: lines
        .slice(
          Math.max(0, Math.floor(lines.length / 2) - 2),
          Math.floor(lines.length / 2) + 3
        )
        .join("\n"),
      end: lines.slice(-5).join("\n"),
    },
  };

  // Fuzzy search implementation
  // Adapted from FUZZY_SEARCH_IMPL for direct use
  function fuzzyMatch(str: string, query: string): number {
    if (!query || query.length > 1000) return 0;
    const strLower = str.toLowerCase();
    const queryLower = query.toLowerCase();

    // Exact match bonus
    if (strLower.includes(queryLower)) {
      return 100 + queryLower.length;
    }

    // Fuzzy match
    let score = 0;
    let queryIndex = 0;
    let prevMatchIndex = -1;

    for (let i = 0; i < strLower.length && queryIndex < queryLower.length; i++) {
      if (strLower[i] === queryLower[queryIndex]) {
        score += 10;
        // Bonus for consecutive matches
        if (prevMatchIndex === i - 1) {
          score += 5;
        }
        prevMatchIndex = i;
        queryIndex++;
      }
    }

    // Return 0 if didn't match all query chars
    return queryIndex === queryLower.length ? score : 0;
  }

  return {
    context,
    lines,

    grep: (pattern: string) => {
      const MAX_GREP_MATCHES = 10000;
      const MAX_PATTERN_LENGTH = 1000;
      if (!pattern || pattern.length > MAX_PATTERN_LENGTH) return [];
      const validation = validateRegex(pattern);
      if (!validation.valid) return [];
      const flags = "gmi";
      const regex = new RegExp(pattern, flags);
      const results: Array<{ match: string; line: string; lineNum: number; index: number; groups: string[] }> = [];
      let match;

      while ((match = regex.exec(context)) !== null) {
        const beforeMatch = context.slice(0, match.index);
        const lineNum = (beforeMatch.match(/\n/g) || []).length + 1;
        const line = lines[lineNum - 1] || "";

        results.push({
          match: match[0],
          line: line,
          lineNum: lineNum,
          index: match.index,
          groups: match.slice(1).filter((g: string | undefined) => g !== undefined),
        });

        if (match[0].length === 0) {
          regex.lastIndex++;
        }

        if (results.length >= MAX_GREP_MATCHES) break;
      }

      return results;
    },

    fuzzy_search: (query: string, limit: number = 10) => {
      limit = Math.max(1, Math.min(Math.floor(limit) || 10, 1000));
      const results: Array<{ line: string; lineNum: number; score: number }> = [];

      for (let i = 0; i < lines.length; i++) {
        const score = fuzzyMatch(lines[i], query);
        if (score > 0) {
          results.push({
            line: lines[i],
            lineNum: i + 1,
            score,
          });
        }
      }

      // Sort by score descending, take top limit
      results.sort((a, b) => b.score - a.score);
      return results.slice(0, limit);
    },

    bm25: (() => {
      // Lazy-init BM25 index on first use
      let index: import("./logic/bm25.js").BM25Index | null = null;
      return (query: string, limit: number = 10) => {
        if (!index) {
          index = bm25Module.buildBM25Index(lines);
        }
        return bm25Module.searchBM25(query, lines, index, undefined, limit);
      };
    })(),

    semantic: (() => {
      // Lazy-init semantic index on first use
      let index: semanticModule.SemanticIndex | null = null;
      return (query: string, limit: number = 10) => {
        if (!index) {
          index = semanticModule.buildSemanticIndex(lines);
        }
        return semanticModule.searchSemantic(query, lines, index, limit);
      };
    })(),

    text_stats: () => ({ ...textStats }),

    // Symbolic-recursion hook. Three modes, in priority order:
    //
    //   1. subRLMSpawner given (P3 sub-RLM recursion) — routes the
    //      interpolated prompt through a full sub-RLM with its own FSM
    //      loop, Nucleus code execution, and depth tracking. The
    //      spawner is responsible for enforcing the depth cap; past
    //      the cap it should fall back to mode 2 internally.
    //
    //   2. llmClient given, no spawner (legacy flat sub-LLM) — one
    //      round-trip through the parent's llmClient with a role-framing
    //      prefix telling the model to answer as plain text. This is the
    //      pre-P3 behavior and stays the default when subRLMMaxDepth=0.
    //
    //   3. Neither given (standalone NucleusEngine / lattice-mcp without
    //      a sampling bridge) — undefined, so the solver's llm_query
    //      case throws a clear "not available" error.
    llmQuery: subRLMSpawner
      ? subRLMSpawner
      : llmClient
        ? async (subPrompt: string) => {
            const framedPrompt =
              "You are a sub-LLM invoked by a parent RLM run. Answer the " +
              "prompt concisely and directly. Do not emit control tags " +
              "like <<<FINAL>>> or S-expressions — your caller uses your " +
              "response as a plain string.\n\n" +
              subPrompt;
            const response = await llmClient(framedPrompt);
            return String(response ?? "");
          }
        : undefined,
  };
}

/**
 * Generate classifier guidance from grep output
 * Shows the model concrete example lines to use with (classify ...)
 */
export function generateClassifierGuidance(
  logs: string[],
  query: string
): string | null {
  // Look for JSON array in logs that contains grep results
  // The JSON may be spread across multiple log lines (pretty-printed)
  let grepResults: Array<{ line: string; lineNum: number }> = [];

  // First, try to find and parse multi-line JSON
  const fullLog = logs.join("\n");

  // Cap fullLog length before regex match to prevent ReDoS on huge logs
  const MAX_LOG_SEARCH = 100_000;
  const searchLog = fullLog.length > MAX_LOG_SEARCH ? fullLog.slice(0, MAX_LOG_SEARCH) : fullLog;

  // Look for JSON array pattern in the combined logs
  const jsonMatch = searchLog.match(/\[\s*\{[\s\S]*?\}\s*\]/);
  if (jsonMatch) {
    try {
      const parsed = JSON.parse(jsonMatch[0]);
      if (Array.isArray(parsed) && parsed.length > 0 && parsed[0]?.line) {
        grepResults = parsed;
      }
    } catch {
      // Not valid JSON, continue
    }
  }

  // Also try individual lines (single-line JSON)
  if (grepResults.length === 0) {
    for (const log of logs) {
      const trimmed = log.trim();
      if (trimmed.startsWith("[") || trimmed.startsWith("{")) {
        try {
          const parsed = JSON.parse(trimmed);
          const arr = Array.isArray(parsed) ? parsed : [parsed];
          if (arr.length > 0 && arr[0]?.line) {
            grepResults = arr;
            break;
          }
        } catch {
          // Not valid JSON, continue
        }
      }
    }
  }

  if (grepResults.length < 2) {
    return null; // Need at least 2 results to show diverse examples
  }

  // Pick diverse example lines (first, middle, last if available)
  const examples: string[] = [];
  const indices = [0];
  if (grepResults.length > 2) {
    indices.push(Math.floor(grepResults.length / 2));
  }
  if (grepResults.length > 1) {
    indices.push(grepResults.length - 1);
  }

  for (const idx of indices) {
    const line = grepResults[idx].line;
    // Escape backslashes first, then double quotes for S-expression string embedding
    const escaped = line.slice(0, 500).replace(/\\/g, "\\\\").replace(/"/g, '\\"');
    examples.push(escaped);
  }

  // Generate the guidance with concrete examples
  const safeQuery = query.slice(0, 200).replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/`/g, "\\`");
  return `
## NEXT STEP: Build classifier from these EXACT lines

Your grep found ${grepResults.length} matches. Now use (classify ...) to filter.

Look at the query: "${safeQuery}"
- Mark lines that answer the query as \`true\`
- Mark lines that don't answer the query as \`false\`

Example using YOUR grep output:
(classify
  "${examples[0]}" true
  "${examples[examples.length > 1 ? 1 : 0]}" false)

IMPORTANT: Copy the EXACT line strings from above. Do NOT paraphrase or modify them.`;
}

export interface RLMOptions {
  llmClient: LLMQueryFn;
  /** Model adapter for prompt/response handling. Uses base adapter if not specified. */
  adapter?: ModelAdapter;
  maxTurns?: number;
  verbose?: boolean;
  /** Output constraint for verification (Barliman-style constraint-first synthesis) */
  constraint?: SynthesisConstraint;
  /** Enable RAG for few-shot learning and self-correction (default: true) */
  ragEnabled?: boolean;
  /** Session ID for tracking failures (default: auto-generated) */
  sessionId?: string;
  /**
   * Maximum recursive depth for `(llm_query …)` sub-RLM spawning
   * (P3 in the paper-vs-project gap list — the paper's "symbolic
   * recursion" feature). Default 0, which preserves the pre-P3 flat
   * sub-LLM behavior: every `(llm_query …)` call dispatches exactly
   * one round-trip through `llmClient`. When set to N ≥ 1, each
   * `(llm_query …)` invocation spawns a sub-RLM whose document is
   * the interpolated prompt and whose FSM loop can itself run
   * Nucleus code (grep, chunking, even further sub-RLMs) up to
   * depth N. Past depth N, sub-RLMs fall back to flat calls so
   * recursion can't run away. Sub-RLMs inherit the parent's
   * llmClient and adapter and halve the parent's maxTurns.
   */
  subRLMMaxDepth?: number;
  /**
   * Internal — current sub-RLM depth. Automatically incremented by
   * the sub-RLM spawner each time a `(llm_query …)` call recurses.
   * Never set this manually from user code; it's a private parameter
   * threaded through the recursive invocation chain.
   */
  _subRLMDepth?: number;
}

/**
 * Default maximum sub-RLM recursion depth cap, enforced independent
 * of whatever the caller passes as `subRLMMaxDepth`. Paper Alg. 1 in
 * principle allows unbounded recursion; in practice a hard cap keeps
 * pathological programs from infinitely recursing and exhausting
 * resources. Tuned conservatively — raise in CLAUDE.md if needed.
 */
const ABSOLUTE_MAX_SUB_RLM_DEPTH = 5;

// verifyAndReturnResult has moved to fsm/rlm-states.ts

/**
 * Run the RLM execution loop against a file on disk.
 *
 * Thin wrapper — reads the file and delegates to `runRLMFromContent`,
 * which contains the actual loop and is reused by the sub-RLM spawner
 * when `subRLMMaxDepth > 0`.
 */
export async function runRLM(
  query: string,
  filePath: string,
  options: RLMOptions
): Promise<unknown> {
  let documentContent: string;
  try {
    documentContent = await readFile(filePath, "utf-8");
  } catch (err) {
    const error = err as Error;
    return `Error loading file: ${error.message}`;
  }
  return runRLMFromContent(query, documentContent, options);
}

/**
 * Run the RLM execution loop against in-memory document content.
 *
 * Exported as a public entry point — called directly by tests and by
 * the P3 sub-RLM spawner (which builds a sub-RLM over the interpolated
 * prompt rather than a file). Behaviorally identical to `runRLM` except
 * for the file-read step.
 */
export async function runRLMFromContent(
  query: string,
  documentContent: string,
  options: RLMOptions
): Promise<unknown> {
  const {
    llmClient,
    adapter = createNucleusAdapter(),
    maxTurns: rawMaxTurns = 10,
    verbose = false,
    constraint,
    ragEnabled = true,
    sessionId: rawSessionId = `session-${Date.now()}`,
    subRLMMaxDepth = 0,
    _subRLMDepth = 0,
  } = options;

  // Validate sessionId
  const safeSessionId = typeof rawSessionId === "string" && rawSessionId.length > 0 && rawSessionId.length <= 256 && /^[a-zA-Z0-9_-]+$/.test(rawSessionId)
    ? rawSessionId
    : `session-${Date.now()}`;
  const sessionId = safeSessionId;

  // Validate numeric config parameters
  const maxTurns = Number.isFinite(rawMaxTurns) && rawMaxTurns >= 1 ? Math.floor(rawMaxTurns) : 10;

  // Clamp subRLMMaxDepth to the hard cap.
  const effectiveMaxDepth = Math.max(
    0,
    Math.min(
      Number.isFinite(subRLMMaxDepth) ? Math.floor(subRLMMaxDepth) : 0,
      ABSOLUTE_MAX_SUB_RLM_DEPTH
    )
  );

  const log = (msg: string) => {
    if (verbose) console.log(msg);
  };

  // Initialize RAG manager for few-shot learning
  let ragManager: RAGManager | null = null;
  let ragHints: RAGHints | undefined;

  if (ragEnabled) {
    try {
      ragManager = getRAGManager();
      const hints = ragManager.getHints(query, 2);
      const hintsText = ragManager.formatHintsForPrompt(hints);
      const selfCorrectionText = ragManager.generateSelfCorrectionFeedback(sessionId);

      if (hintsText || selfCorrectionText) {
        ragHints = {
          hintsText,
          selfCorrectionText: selfCorrectionText || undefined,
        };
        log(`[RAG] Retrieved ${hints.length} hints for query`);
        if (selfCorrectionText) {
          log(`[RAG] Including self-correction feedback from previous failures`);
        }
      }
    } catch (err) {
      log(`[RAG] Failed to retrieve hints: ${err instanceof Error ? err.message : String(err)}`);
      ragManager = null;
    }
  }

  log(`\n[RLM] Loaded document: ${documentContent.length.toLocaleString()} characters (depth=${_subRLMDepth})`);

  // Build system prompt using the adapter (with RAG hints if enabled)
  const registry = createToolRegistry();
  const toolInterfaces = getToolInterfaces(registry);
  const systemPrompt = adapter.buildSystemPrompt(documentContent.length, toolInterfaces, ragHints);

  log(`[RLM] Using adapter: ${adapter.name}`);
  log(`[RLM] Adapter type: ${adapter.name.includes("barliman") ? "Barliman (constraint-based synthesis)" : "Standard"}`);

  if (verbose && adapter.name.includes("barliman")) {
    log(`\n[Barliman] Workflow:`);
    log(`  1. LLM searches document with grep()`);
    log(`  2. LLM provides constraints (input/output examples) to synthesize_extractor()`);
    log(`  3. Synthesizer builds a function from examples`);
    log(`  4. If synthesis fails, LLM gets feedback and refines constraints`);
  }

  // Build the sub-RLM spawner for P3 symbolic recursion.
  //
  // When the current depth is still below the configured max, each
  // `(llm_query …)` call spawns a full sub-RLM whose document is the
  // interpolated prompt. The sub-RLM runs its own FSM loop with half
  // the parent's turn budget and increments the depth counter. When
  // the depth is at or above max, the spawner is undefined — the
  // llmQuery code path falls back to the flat `llmClient(framedPrompt)`
  // call built inside `createSolverTools`, terminating the recursion
  // with a single round-trip.
  const subRLMSpawner = llmClient && _subRLMDepth < effectiveMaxDepth
    ? async (interpolatedPrompt: string): Promise<string> => {
        const childMaxTurns = Math.max(1, Math.floor(maxTurns / 2));
        const childDepth = _subRLMDepth + 1;
        log(`[RLM] Spawning sub-RLM (depth ${childDepth}/${effectiveMaxDepth}) with ${interpolatedPrompt.length} chars of input`);
        // The sub-RLM's "query" is fixed framing text; the "document"
        // is the interpolated prompt, so the sub-RLM can grep/chunk/map
        // over the parent's payload without the parent having to
        // pre-process it.
        const childQuery =
          "Analyze and answer based on the following input: " +
          interpolatedPrompt.slice(0, 500) +
          (interpolatedPrompt.length > 500 ? "…" : "");
        const childResult = await runRLMFromContent(
          childQuery,
          interpolatedPrompt,
          {
            llmClient,
            adapter,
            maxTurns: childMaxTurns,
            verbose,
            // Sub-RLMs skip RAG — hint retrieval on every nested call
            // would be expensive and the hints are tuned for top-level
            // queries, not recursive payloads.
            ragEnabled: false,
            sessionId: `${sessionId}-sub${childDepth}`,
            subRLMMaxDepth: effectiveMaxDepth,
            _subRLMDepth: childDepth,
          }
        );
        return typeof childResult === "string" ? childResult : JSON.stringify(childResult);
      }
    : undefined;

  // Create solver tools for document operations. Passing llmClient here
  // enables the `(llm_query …)` LC primitive; passing subRLMSpawner
  // upgrades it from flat to recursive.
  const solverTools = createSolverTools(documentContent, llmClient, subRLMSpawner);

  // Build user message with optional constraints
  let userMessage = `Query: ${query}`;

  if (constraint) {
    userMessage += `\n\n## OUTPUT CONSTRAINTS\n`;
    userMessage += `Your final answer MUST satisfy these constraints:\n`;
    userMessage += `- Type: ${constraint.output.type}\n`;
    if (constraint.output.min !== undefined && Number.isFinite(constraint.output.min)) {
      userMessage += `- Minimum: ${constraint.output.min}\n`;
    }
    if (constraint.output.max !== undefined && Number.isFinite(constraint.output.max)) {
      userMessage += `- Maximum: ${constraint.output.max}\n`;
    }
    if (constraint.output.integer) {
      userMessage += `- Must be an integer\n`;
    }
    if (constraint.invariants) {
      for (const inv of constraint.invariants) {
        userMessage += `- Invariant: ${String(inv).slice(0, 500)}\n`;
      }
    }
    userMessage += `\nBefore returning your answer, VERIFY it satisfies these constraints.`;
    log(`[RLM] Output constraint: ${constraint.output.type}`);
  }

  try {
    // Run the FSM-based execution loop
    const fsmCtx = createInitialContext({
      query,
      adapter,
      llmClient,
      solverTools,
      systemPrompt,
      userMessage,
      constraint,
      ragManager: ragManager ?? undefined,
      sessionId,
      maxTurns,
      log,
    });

    const engine = new FSMEngine<RLMContext>();
    const FSM_TIMEOUT_MS = 5 * 60 * 1000;
    // The timer must be stored so we can clear it when the FSM wins the
    // race — otherwise the setTimeout holds the Node event loop alive for
    // FSM_TIMEOUT_MS after a successful run (CLI hangs, long-lived
    // processes leak a pending timer per call).
    let timeoutHandle: NodeJS.Timeout | undefined;
    const finalCtx = await Promise.race([
      engine.run(buildRLMSpec(), fsmCtx),
      new Promise<never>((_, reject) => {
        timeoutHandle = setTimeout(
          () => reject(new Error(`FSM run exceeded ${FSM_TIMEOUT_MS}ms timeout`)),
          FSM_TIMEOUT_MS
        );
      }),
    ]).finally(() => {
      if (timeoutHandle !== undefined) {
        clearTimeout(timeoutHandle);
      }
    });

    if (finalCtx.result !== null) {
      return finalCtx.result;
    }

    // Max turns reached without final answer
    log(`\n[RLM] Max turns (${maxTurns}) reached without final answer`);
    return `Max turns (${maxTurns}) reached without final answer.`;
  } finally {
    try {
      if (ragManager) {
        ragManager.clearFailureMemory(sessionId);
        log(`[RAG] Cleared session failure memory`);
      }
    } catch (cleanupErr) {
      log(`[RAG] Warning: cleanup failed: ${cleanupErr instanceof Error ? cleanupErr.message : String(cleanupErr)}`);
    }
  }
}
