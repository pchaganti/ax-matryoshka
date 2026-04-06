/**
 * RLM FSM State Definitions
 *
 * Defines the context, states, handlers, and transition predicates
 * for the RLM execution loop as an explicit finite state machine.
 */

import type { ModelAdapter, FinalVarMarker } from "../adapters/types.js";
import type { SynthesisConstraint } from "../constraints/types.js";
import type { SandboxWithSynthesis } from "../synthesis/sandbox-tools.js";
import type { RAGManager } from "../rag/manager.js";
import type { SolverTools, Bindings } from "../logic/lc-solver.js";
import type { FSMSpec, State } from "./engine.js";

import { parse as parseLC } from "../logic/lc-parser.js";
import { isClassifyTerm, validateClassifyExamples } from "../logic/lc-compiler.js";
import { inferType, typeToString } from "../logic/type-inference.js";
import { solve as solveTerm } from "../logic/lc-solver.js";
import { analyzeExecution, getEncouragement } from "../feedback/execution-feedback.js";
import { verifyResult } from "../constraints/verifier.js";
import { generateClassifierGuidance } from "../rlm.js";
import type { LLMQueryFn } from "../llm/types.js";

// ===== CONTEXT =====

export interface RLMContext {
  // Immutable config
  query: string;
  adapter: ModelAdapter;
  llmClient: LLMQueryFn;
  solverTools: SolverTools;
  sandbox: SandboxWithSynthesis;
  constraint?: SynthesisConstraint;
  ragManager?: RAGManager;
  sessionId: string;
  maxTurns: number;
  log: (msg: string) => void;

  // Mutable state
  turn: number;
  history: Array<{ role: "system" | "user" | "assistant"; content: string }>;
  solverBindings: Bindings;

  // Turn-specific (reset each turn)
  response: string;
  extractedCode: string | null;
  extractedFinalAnswer: string | FinalVarMarker | null;
  parsedTerm: import("../logic/types.js").LCTerm | null;
  parseError: string | null;
  typeValid: boolean;
  solverResult: { success: boolean; value: unknown; logs: string[]; error?: string } | null;

  // Cross-turn tracking
  codeExecuted: boolean;
  lastExecutionHadError: boolean;
  lastOutputWasUnhelpful: boolean;
  doneCount: number;
  noCodeCount: number;
  lastCode: string;
  lastMeaningfulOutput: string;
  lastResultCount: number;
  previousResultCount: number;

  // Termination
  result: string | null;
}

// ===== HELPERS =====

const MAX_HISTORY_ENTRIES = 40;

function pruneHistory(history: RLMContext["history"]): void {
  while (history.length > MAX_HISTORY_ENTRIES) {
    if (history.length > 3 && history[2]?.role === "assistant" && history[3]?.role === "user") {
      history.splice(2, 2);
    } else if (history.length > 3 && history[2]?.role === "user" && history[3]?.role === "assistant") {
      history.splice(2, 2);
    } else {
      if (history.length <= 2) break;
      history.splice(2, Math.min(2, history.length - 2));
      if (history.length > MAX_HISTORY_ENTRIES) break;
    }
  }
}

function truncate(s: string, max: number = 4000): string {
  if (s.length <= max) return s;
  const half = Math.max(0, Math.floor(max / 2) - 20);
  if (half === 0) return s.slice(0, max);
  return s.slice(0, half) + `\n... [${s.length - max} chars truncated] ...\n` + s.slice(-half);
}

interface VerificationResult {
  valid: boolean;
  result: string;
  feedback: string;
}

function verifyAndReturnResult(
  result: unknown,
  constraint: SynthesisConstraint | undefined,
  log: (msg: string) => void
): VerificationResult {
  const resultStr = typeof result === "string" ? result : JSON.stringify(result);
  if (!constraint) {
    return { valid: true, result: resultStr, feedback: "" };
  }
  const verification = verifyResult(resultStr, constraint);
  if (verification.valid) {
    log(`[RLM] Result passed constraint verification`);
    return { valid: true, result: resultStr, feedback: "" };
  }
  log(`[RLM] Result FAILED constraint verification`);
  return {
    valid: false,
    result: resultStr,
    feedback: `Result "${resultStr}" violates output constraints. Re-examine the data and try again.`,
  };
}

// ===== STATE HANDLERS =====

async function handleQueryLLM(ctx: RLMContext): Promise<RLMContext> {
  ctx.turn++;
  ctx.log(`\n${"─".repeat(50)}`);
  ctx.log(`[Turn ${ctx.turn}/${ctx.maxTurns}] Querying LLM...`);

  const prompt = ctx.history.map((h) => `${h.role.toUpperCase()}: ${h.content}`).join("\n\n");
  const response = await ctx.llmClient(prompt);

  if (!response) {
    ctx.result = `Error: LLM returned empty response at turn ${ctx.turn}`;
    return ctx;
  }

  ctx.response = response;
  ctx.history.push({ role: "assistant", content: response });
  pruneHistory(ctx.history);

  // Reset turn-specific state
  ctx.extractedCode = ctx.adapter.extractCode(response);
  ctx.extractedFinalAnswer = null;
  ctx.parsedTerm = null;
  ctx.parseError = null;
  ctx.typeValid = false;
  ctx.solverResult = null;

  ctx.log(`[Turn ${ctx.turn}] LLM response:`);
  ctx.log(response.slice(0, 500));
  if (ctx.extractedCode) {
    ctx.log(`[Turn ${ctx.turn}] Extracted Nucleus: ${ctx.extractedCode}`);
  }

  return ctx;
}

function handleParseResponse(ctx: RLMContext): RLMContext {
  if (!ctx.extractedCode) {
    ctx.log(`[Turn ${ctx.turn}] No Nucleus command extracted`);
    ctx.noCodeCount++;
    return ctx;
  }

  // Check for <<<FINAL>>> inside code block
  const finalInCode = ctx.extractedCode.match(/<<<FINAL>>>([\s\S]*?)<<<END>>>/);
  if (finalInCode) {
    ctx.log(`[Turn ${ctx.turn}] Found final answer inside code block`);
    if (!ctx.codeExecuted) {
      ctx.log(`[Turn ${ctx.turn}] Rejecting - no code executed yet`);
      ctx.history.push({
        role: "user",
        content: `You put <<<FINAL>>> inside the code block. First run code to get the answer, then put <<<FINAL>>> OUTSIDE the code block.`,
      });
      ctx.extractedCode = null; // Skip further processing
      return ctx;
    }
    const extractedAnswer = finalInCode[1].trim();
    const looksLikeCode = /console\.log|function\s*\(|const\s+\w+\s*=|let\s+\w+\s*=|var\s+\w+\s*=|\);|\(\s*["']/.test(extractedAnswer);
    if (looksLikeCode) {
      ctx.log(`[Turn ${ctx.turn}] Rejecting - extracted content looks like code, not an answer`);
      ctx.history.push({
        role: "user",
        content: `ERROR: You put <<<FINAL>>> markers inside your code/strings, not after the code block.\n\nThe FINAL markers must be OUTSIDE and AFTER your code block:\n\`\`\`javascript\nconsole.log("done");\n\`\`\`\n<<<FINAL>>>\nYour actual answer here (plain text, not code)\n<<<END>>>\n\nTry again with proper formatting.`,
      });
      ctx.extractedCode = null;
      return ctx;
    }
    const verification = verifyAndReturnResult(extractedAnswer, ctx.constraint, ctx.log);
    ctx.result = verification.valid ? verification.result : extractedAnswer;
    return ctx;
  }

  ctx.codeExecuted = true;
  ctx.noCodeCount = 0;

  // Check for repeated code
  const trimmedCode = ctx.extractedCode.trim();
  if (trimmedCode.length > 0 && trimmedCode === ctx.lastCode.trim()) {
    ctx.log(`[Turn ${ctx.turn}] WARNING: Repeated code detected`);
    ctx.history.push({ role: "user", content: ctx.adapter.getRepeatedCodeFeedback(ctx.lastResultCount) });
    ctx.extractedCode = null;
    return ctx;
  }
  ctx.lastCode = ctx.extractedCode;

  return ctx;
}

function handleValidate(ctx: RLMContext): RLMContext {
  if (!ctx.extractedCode) return ctx;

  ctx.log(`[Turn ${ctx.turn}] Parsing LC term...`);
  const lcResult = parseLC(ctx.extractedCode);

  if (!lcResult.success || !lcResult.term) {
    ctx.log(`[Turn ${ctx.turn}] LC parse error: ${lcResult.error}`);
    ctx.parseError = lcResult.error || "Parse error";
    ctx.history.push({
      role: "user",
      content: ctx.adapter.getErrorFeedback(ctx.parseError, ctx.extractedCode),
    });
    return ctx;
  }

  ctx.parsedTerm = lcResult.term;
  ctx.log(`[Turn ${ctx.turn}] LC term parsed successfully`);

  const typeResult = inferType(lcResult.term);
  if (!typeResult.valid) {
    ctx.log(`[Turn ${ctx.turn}] Type inference failed: ${typeResult.error}`);
    ctx.history.push({
      role: "user",
      content: `Type error: ${typeResult.error}\n\nCheck your LC term structure.`,
    });
    ctx.parsedTerm = null;
    return ctx;
  }

  ctx.typeValid = true;
  if (typeResult.type) {
    ctx.log(`[Turn ${ctx.turn}] Inferred type: ${typeToString(typeResult.type)}`);
  }

  // Validate classify examples
  if (isClassifyTerm(lcResult.term)) {
    const prevLogs = ctx.history
      .filter((h) => h.role === "user" && h.content.includes("Logs:"))
      .flatMap((h) => h.content.split("\n"));
    const validationError = validateClassifyExamples(lcResult.term, prevLogs);
    if (validationError) {
      ctx.log(`[Turn ${ctx.turn}] Classify validation error: ${validationError}`);
      ctx.history.push({
        role: "user",
        content: `ERROR: ${validationError}\n\nCopy the EXACT lines from the grep output above.`,
      });
      ctx.parsedTerm = null;
      return ctx;
    }
  }

  return ctx;
}

function handleExecute(ctx: RLMContext): RLMContext {
  if (!ctx.parsedTerm) return ctx;

  ctx.log(`[Turn ${ctx.turn}] Executing LC term with solver...`);
  ctx.log(`[Turn ${ctx.turn}] Term: ${ctx.extractedCode}`);
  if (ctx.solverBindings.size > 0) {
    ctx.log(`[Turn ${ctx.turn}] Available bindings: ${[...ctx.solverBindings.keys()].join(", ")}`);
  }

  const solverResult = solveTerm(ctx.parsedTerm, ctx.solverTools, ctx.solverBindings);
  ctx.solverResult = {
    success: solverResult.success,
    value: solverResult.value,
    logs: solverResult.logs,
    error: solverResult.success ? undefined : solverResult.error,
  };

  // Bind result for next turn
  if (solverResult.success && solverResult.value !== null && solverResult.value !== undefined) {
    ctx.solverBindings.set(`_${ctx.turn}`, solverResult.value);

    if (Array.isArray(solverResult.value)) {
      const MAX_RESULTS_SIZE = 100000;
      const cappedValue = solverResult.value.length > MAX_RESULTS_SIZE
        ? solverResult.value.slice(0, MAX_RESULTS_SIZE)
        : solverResult.value;
      ctx.solverBindings.set("RESULTS", cappedValue);
      ctx.previousResultCount = ctx.lastResultCount;
      ctx.lastResultCount = cappedValue.length;
      ctx.log(`[Turn ${ctx.turn}] Bound result to RESULTS and _${ctx.turn}`);
    } else {
      ctx.log(`[Turn ${ctx.turn}] Bound scalar result to _${ctx.turn} (RESULTS preserved)`);
    }

    // Evict old bindings
    const MAX_SOLVER_BINDINGS = 200;
    if (ctx.solverBindings.size > MAX_SOLVER_BINDINGS) {
      const keys = [...ctx.solverBindings.keys()];
      const turnKeys = keys.filter(k => /^_\d+$/.test(k))
        .sort((a, b) => {
          const aNum = parseInt(a.slice(1), 10);
          const bNum = parseInt(b.slice(1), 10);
          if (!Number.isFinite(aNum) || !Number.isFinite(bNum)) return 0;
          return aNum - bNum;
        });
      const nonTurnCount = keys.length - turnKeys.length;
      const maxTurnKeys = Math.max(1, MAX_SOLVER_BINDINGS - nonTurnCount);
      const toRemove = turnKeys.slice(0, Math.max(0, turnKeys.length - maxTurnKeys));
      for (const key of toRemove) {
        ctx.solverBindings.delete(key);
      }
    }
  } else {
    ctx.previousResultCount = ctx.lastResultCount;
    ctx.lastResultCount = 0;
  }

  return ctx;
}

function handleAnalyze(ctx: RLMContext): RLMContext {
  if (!ctx.solverResult) return ctx;

  const result = ctx.solverResult;
  let feedback = `Turn ${ctx.turn} Sandbox execution:\n`;

  if (result.logs.length > 0) {
    ctx.log(`[Turn ${ctx.turn}] Console output:`);
    result.logs.forEach(l => ctx.log(`  ${l}`));
    const logsText = result.logs.join("\n");
    feedback += `Logs:\n${truncate(logsText)}\n`;

    const executionFeedback = analyzeExecution({
      code: ctx.extractedCode || "",
      logs: result.logs,
      error: result.error,
      turn: ctx.turn,
    });

    if (executionFeedback) {
      ctx.log(`[Turn ${ctx.turn}] Detected issue: ${executionFeedback.type}`);
      feedback += `\n${executionFeedback.message}\n`;
      feedback += `\n${getEncouragement(ctx.turn, ctx.maxTurns)}\n`;
    }

    // Track meaningful output vs stuck patterns
    const isDoneOnly = result.logs.length === 1 && result.logs[0].toLowerCase().trim() === "done";
    const isRepeatedOutput = logsText === ctx.lastMeaningfulOutput;
    const hasObjectObject = logsText.includes("[object Object]");
    const isUnhelpfulOutput = hasObjectObject || isDoneOnly || (executionFeedback?.shouldReject ?? false);

    if (isUnhelpfulOutput || isRepeatedOutput) {
      ctx.lastOutputWasUnhelpful = true;
      ctx.doneCount++;
      if (ctx.doneCount >= 3 && ctx.lastMeaningfulOutput) {
        ctx.log(`[Turn ${ctx.turn}] Detected stuck pattern. Auto-terminating.`);
        const verification = verifyAndReturnResult(ctx.lastMeaningfulOutput, ctx.constraint, ctx.log);
        ctx.result = verification.valid ? verification.result : ctx.lastMeaningfulOutput;
        return ctx;
      }
      if (isRepeatedOutput) {
        feedback += `\nWARNING: Output is the same as before. Try a DIFFERENT approach:\n`;
        feedback += `- Use grep("keyword") to search for specific data\n`;
        feedback += `- Try different search terms related to the query\n`;
        feedback += `- Do NOT repeat the same code\n`;
      }
    } else if (!hasObjectObject) {
      ctx.lastOutputWasUnhelpful = false;
      const computedMatch = logsText.match(/(?:total|sum|result|answer|count|average|mean)[^:]*:\s*([\d,.]+)/i);
      const hasRawData = logsText.match(/[\d,]{4,}|"[^"]+"\s*:/);

      if (computedMatch && ctx.turn > 2) {
        const answerLine = result.logs.find(line =>
          /(?:total|sum|result|answer|count|average|mean)[^:]*:/i.test(line)
        );

        if (answerLine) {
          ctx.log(`[Turn ${ctx.turn}] Computed answer found: ${answerLine}`);
          const verification = verifyAndReturnResult(answerLine, ctx.constraint, ctx.log);
          if (verification.valid) {
            ctx.log(`[Turn ${ctx.turn}] Auto-terminating with computed result`);
            ctx.result = verification.result;
            return ctx;
          } else {
            ctx.log(`[Turn ${ctx.turn}] Constraint violation - continuing`);
            feedback += `\n${verification.feedback}`;
          }
        }

        ctx.lastMeaningfulOutput = logsText;
        ctx.doneCount = 0;
      } else if (hasRawData && !ctx.lastMeaningfulOutput) {
        ctx.lastMeaningfulOutput = logsText;
        ctx.doneCount = 0;
      }
    }
  }

  if (result.error) {
    ctx.log(`[Turn ${ctx.turn}] Error: ${result.error}`);
    feedback += `Error: ${result.error}\n`;
    ctx.lastExecutionHadError = true;

    if (ctx.ragManager) {
      ctx.ragManager.recordFailure({
        query: ctx.query,
        code: (ctx.extractedCode || "").slice(0, 500),
        error: result.error,
        timestamp: Date.now(),
        sessionId: ctx.sessionId,
      });
      ctx.log(`[RAG] Recorded failure for self-correction`);
    }
  } else {
    ctx.lastExecutionHadError = false;
  }

  if (result.value !== undefined && result.value !== null) {
    let resultStr: string;
    try {
      const MAX_RESULT_JSON = 50_000;
      resultStr = JSON.stringify(result.value, null, 2).slice(0, MAX_RESULT_JSON);
    } catch {
      resultStr = String(result.value);
    }
    ctx.log(`[Turn ${ctx.turn}] Result: ${resultStr}`);
    feedback += `Result: ${truncate(resultStr)}\n`;
  }

  const classifierGuidance = generateClassifierGuidance(result.logs, ctx.query);
  if (classifierGuidance) {
    feedback += `\n${classifierGuidance}`;
  }

  if (typeof result.value === "number") {
    feedback += `\n\nResult: ${result.value}. If this answers the query, output: <<<FINAL>>>${result.value}<<<END>>>`;
  }

  feedback += `\n\n${ctx.adapter.getSuccessFeedback(ctx.lastResultCount, ctx.previousResultCount, ctx.query)}`;
  ctx.history.push({ role: "user", content: feedback });

  return ctx;
}

function handleCheckFinalAnswer(ctx: RLMContext): RLMContext {
  // After code execution: check for final answer in the same response
  if (ctx.solverResult && !ctx.solverResult.error && !ctx.lastOutputWasUnhelpful && !Array.isArray(ctx.solverResult.value)) {
    const finalAnswer = ctx.adapter.extractFinalAnswer(ctx.response);
    if (finalAnswer !== null) {
      ctx.log(`[Turn ${ctx.turn}] Final answer found after code execution`);
      let resultToReturn: unknown;
      if (typeof finalAnswer === "object" && finalAnswer.type === "var") {
        ctx.log(`[Turn ${ctx.turn}] Returning variable: ${finalAnswer.name}`);
        const solverValue = ctx.solverBindings?.get(finalAnswer.name) ?? ctx.solverBindings?.get("RESULTS");
        if (solverValue !== undefined) {
          resultToReturn = solverValue;
        } else {
          const mem = ctx.sandbox.getMemory();
          resultToReturn = (mem.length === 0 && ctx.lastMeaningfulOutput) ? ctx.lastMeaningfulOutput : mem;
        }
      } else {
        resultToReturn = finalAnswer;
      }

      const verification = verifyAndReturnResult(resultToReturn, ctx.constraint, ctx.log);
      if (verification.valid) {
        ctx.result = verification.result;
      } else {
        ctx.log(`[Turn ${ctx.turn}] Constraint violation - continuing`);
        ctx.history.push({ role: "user", content: verification.feedback });
      }
    }
    return ctx;
  }

  // No code path: check for final answer
  if (!ctx.extractedCode) {
    // Stuck detection (3+ consecutive no-code responses)
    if (ctx.noCodeCount >= 3 && ctx.lastMeaningfulOutput) {
      ctx.log(`[Turn ${ctx.turn}] Model stuck (${ctx.noCodeCount} no-code responses). Returning last output.`);
      const verification = verifyAndReturnResult(ctx.lastMeaningfulOutput, ctx.constraint, ctx.log);
      ctx.result = verification.valid ? verification.result : ctx.lastMeaningfulOutput;
      return ctx;
    }

    const finalAnswer = ctx.adapter.extractFinalAnswer(ctx.response);
    if (finalAnswer !== null) {
      if (!ctx.codeExecuted) {
        ctx.log(`[Turn ${ctx.turn}] Rejecting final answer - no code executed yet`);
        ctx.history.push({
          role: "user",
          content: `ERROR: You tried to answer without reading the document.\n\n${ctx.adapter.getNoCodeFeedback()}`,
        });
        return ctx;
      }
      if (ctx.lastExecutionHadError) {
        ctx.log(`[Turn ${ctx.turn}] Rejecting final answer - last execution had error`);
        ctx.history.push({ role: "user", content: ctx.adapter.getErrorFeedback("Previous execution failed") });
        return ctx;
      }

      ctx.log(`[Turn ${ctx.turn}] Final answer received`);
      let resultToReturn: unknown;
      if (typeof finalAnswer === "object" && finalAnswer.type === "var") {
        const solverValue = ctx.solverBindings?.get(finalAnswer.name) ?? ctx.solverBindings?.get("RESULTS");
        resultToReturn = solverValue !== undefined ? solverValue : ctx.sandbox.getMemory();
      } else {
        resultToReturn = finalAnswer;
      }

      const verification = verifyAndReturnResult(resultToReturn, ctx.constraint, ctx.log);
      if (verification.valid) {
        ctx.result = verification.result;
      } else {
        ctx.history.push({ role: "user", content: verification.feedback });
      }
      return ctx;
    }

    // No final answer, no code — prompt model
    ctx.history.push({ role: "user", content: ctx.adapter.getNoCodeFeedback() });
  }

  return ctx;
}

// ===== TRANSITION PREDICATES =====

const hasResult = (ctx: RLMContext) => ctx.result !== null;
const emptyResponse = (ctx: RLMContext) => ctx.response === "";
const hasCode = (ctx: RLMContext) => ctx.extractedCode !== null;
const hasParsedTerm = (ctx: RLMContext) => ctx.parsedTerm !== null;
const maxTurnsReached = (ctx: RLMContext) => ctx.turn >= ctx.maxTurns;
const always = () => true;

// ===== FSM SPEC =====

export function buildRLMSpec(): FSMSpec<RLMContext> {
  return {
    initial: "query_llm",
    terminal: new Set(["done"]),
    states: new Map<string, State<RLMContext>>([
      ["query_llm", {
        handler: handleQueryLLM,
        transitions: [
          ["done", hasResult],       // empty response error
          ["parse_response", always],
        ],
      }],
      ["parse_response", {
        handler: handleParseResponse,
        transitions: [
          ["done", hasResult],               // final-in-code found
          ["validate", hasCode],             // code extracted, proceed to validation
          ["check_final_answer", always],    // no code, check for final answer
        ],
      }],
      ["validate", {
        handler: handleValidate,
        transitions: [
          ["execute", hasParsedTerm],        // parsed & type-checked OK
          ["check_final_answer", always],    // parse/type error, feedback pushed, loop back
        ],
      }],
      ["execute", {
        handler: handleExecute,
        transitions: [
          ["analyze", always],
        ],
      }],
      ["analyze", {
        handler: handleAnalyze,
        transitions: [
          ["done", hasResult],               // auto-terminated (stuck or computed answer)
          ["check_final_answer", always],    // continue to check for final answer in response
        ],
      }],
      ["check_final_answer", {
        handler: handleCheckFinalAnswer,
        transitions: [
          ["done", hasResult],               // final answer accepted
          ["done", maxTurnsReached],         // out of turns
          ["query_llm", always],             // loop back
        ],
      }],
      ["done", {
        handler: (ctx) => ctx,
        transitions: [],
      }],
    ]),
  };
}

export function createInitialContext(opts: {
  query: string;
  adapter: ModelAdapter;
  llmClient: LLMQueryFn;
  solverTools: SolverTools;
  sandbox: SandboxWithSynthesis;
  systemPrompt: string;
  userMessage: string;
  constraint?: SynthesisConstraint;
  ragManager?: RAGManager;
  sessionId: string;
  maxTurns: number;
  log: (msg: string) => void;
}): RLMContext {
  return {
    query: opts.query,
    adapter: opts.adapter,
    llmClient: opts.llmClient,
    solverTools: opts.solverTools,
    sandbox: opts.sandbox,
    constraint: opts.constraint,
    ragManager: opts.ragManager,
    sessionId: opts.sessionId,
    maxTurns: opts.maxTurns,
    log: opts.log,

    turn: 0,
    history: [
      { role: "system", content: opts.systemPrompt },
      { role: "user", content: opts.userMessage },
    ],
    solverBindings: new Map(),

    response: "",
    extractedCode: null,
    extractedFinalAnswer: null,
    parsedTerm: null,
    parseError: null,
    typeValid: false,
    solverResult: null,

    codeExecuted: false,
    lastExecutionHadError: false,
    lastOutputWasUnhelpful: false,
    doneCount: 0,
    noCodeCount: 0,
    lastCode: "",
    lastMeaningfulOutput: "",
    lastResultCount: 0,
    previousResultCount: 0,

    result: null,
  };
}
