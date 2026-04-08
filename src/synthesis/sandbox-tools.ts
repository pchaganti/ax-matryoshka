/**
 * Sandbox Tools for Synthesis
 * Exposes synthesis capabilities to the LLM in the sandbox
 *
 * Uses the relational synthesis engine (evalo) for Barliman-style
 * constraint-based program synthesis.
 *
 * Built on repl-sandbox's createSandbox with synthesis-specific
 * globals and init code injected via the extension model.
 */

import {
  createSandbox,
  GREP_IMPL,
  FUZZY_SEARCH_IMPL,
  COUNT_TOKENS_IMPL,
  LOCATE_LINE_IMPL,
  LLM_QUERY_IMPL,
} from "repl-sandbox";
import type { SandboxResult, SandboxOptions } from "repl-sandbox";
import { SynthesisCoordinator } from "./coordinator.js";
import {
  synthesizeExtractor as relationalSynthesize,
  compileToFunction,
  compileToFunctionString,
  prettyPrint,
  type Example,
} from "./evalo/index.js";

interface LLMQueryOptions {
  format?: "json" | "text";
}

type LLMQueryFn = (prompt: string, options?: LLMQueryOptions) => Promise<string>;

export interface SandboxWithSynthesis {
  execute(code: string, timeoutMs?: number): Promise<SandboxResult>;
  getMemory(): unknown[];
  dispose(): void;
  getCoordinator(): SynthesisCoordinator;
}

export interface SandboxWithSynthesisOptions extends SandboxOptions {
  verbose?: boolean;
  maxSubCalls?: number;
}

/** Init code injected into the VM to expose synthesis functions */
const SYNTHESIS_INIT_CODE = `
function synthesize_regex(positive, negative) {
  return __synthesisBridge.synthesize_regex(positive, negative || []);
}

function synthesize_extractor(examples) {
  return __synthesisBridge.synthesize_extractor(examples);
}

function get_extractor_code(examples) {
  return __synthesisBridge.get_extractor_code(examples);
}

function test_regex(pattern, str) {
  return __synthesisBridge.test_regex(pattern, str);
}

function extract_with_regex(pattern, str) {
  return __synthesisBridge.extract_with_regex(pattern, str);
}
`;

/**
 * Create a sandboxed execution environment with synthesis capabilities
 */
export async function createSandboxWithSynthesis(
  context: string,
  llmQueryFn: LLMQueryFn,
  coordinator: SynthesisCoordinator,
  options: SandboxWithSynthesisOptions = {}
): Promise<SandboxWithSynthesis> {
  const { maxSubCalls = 10, verbose = false } = options;

  const log = (msg: string) => {
    if (verbose) console.log(msg);
  };

  // Sub-call counting for LLM bridge
  let subCallCount = 0;

  const llmBridge = async (prompt: string, queryOptions?: LLMQueryOptions): Promise<string> => {
    subCallCount++;
    if (subCallCount > maxSubCalls) {
      throw new Error(
        `Max sub-calls limit exceeded (${maxSubCalls}). Use text_stats() and fuzzy_search() to narrow your search first.`
      );
    }
    return llmQueryFn(prompt, queryOptions);
  };

  // Build synthesis bridge functions
  const synthesisBridge = {
    synthesize_regex: (
      positive: string[],
      negative: string[] = []
    ): string | null => {
      if (!positive || positive.length === 0) {
        log(`[Synthesis] synthesize_regex called with empty examples`);
        return null;
      }

      log(`[Synthesis] synthesize_regex called with ${positive.length} positive examples:`);
      positive.slice(0, 3).forEach((ex, i) => log(`  [${i + 1}] "${ex}"`));
      if (negative.length > 0) {
        log(`  + ${negative.length} negative examples`);
      }

      const result = coordinator.synthesize({
        type: "regex",
        description: "sandbox_synthesis",
        positiveExamples: positive,
        negativeExamples: negative,
      });

      if (result.success && result.regex) {
        log(`[Synthesis] SUCCESS: Synthesized regex pattern: ${result.regex}`);
        log(`[Synthesis] Time: ${result.synthesisTimeMs}ms`);
        return result.regex;
      } else {
        log(`[Synthesis] FAILED: Could not synthesize regex from examples`);
        if (result.error) log(`[Synthesis] Error: ${result.error}`);
        return null;
      }
    },

    synthesize_extractor: (
      examples: Array<{ input: string; output: string | number | boolean | null }>
    ): ((s: string) => unknown) | null => {
      const MAX_EXAMPLES = 50;
      if (!examples || examples.length === 0) {
        log(`[Synthesis] synthesize_extractor called with empty examples`);
        return null;
      }

      if (examples.length > MAX_EXAMPLES) {
        examples = examples.slice(0, MAX_EXAMPLES);
      }

      examples = examples.filter(e => {
        const output = e.output;
        return typeof output === "string" || typeof output === "number" || typeof output === "boolean" || output === null;
      });
      if (examples.length === 0) return null;

      const MAX_JSON_LOG_LENGTH = 1000;
      log(`[Synthesis] synthesize_extractor called with ${examples.length} constraints:`);
      examples.slice(0, 3).forEach((ex, i) => {
        const jsonStr = JSON.stringify(ex.output);
        const safeJson = jsonStr.length > MAX_JSON_LOG_LENGTH ? jsonStr.slice(0, MAX_JSON_LOG_LENGTH) + "..." : jsonStr;
        log(`  [${i + 1}] "${ex.input}" -> ${safeJson}`);
      });
      if (examples.length > 3) {
        log(`  ... and ${examples.length - 3} more`);
      }

      try {
        const relationalExamples: Example[] = examples.map(e => ({
          input: e.input,
          output: e.output as string | number | boolean | null,
        }));

        const startTime = Date.now();
        const extractors = relationalSynthesize(relationalExamples);

        if (extractors.length > 0) {
          const extractor = extractors[0];
          const fn = compileToFunction(extractor);
          const timeMs = Date.now() - startTime;

          log(`[Synthesis] SUCCESS (relational): ${prettyPrint(extractor)}`);
          log(`[Synthesis] Time: ${timeMs}ms`);
          return fn;
        }
      } catch (err) {
        const errMsg = err instanceof Error ? err.message : String(err);
        log(`[Synthesis] Relational synthesis failed: ${errMsg}`);
      }

      const result = coordinator.synthesize({
        type: "extractor",
        description: "sandbox_synthesis",
        positiveExamples: examples.map((e) => e.input),
        expectedOutputs: examples.map((e) => e.output),
      });

      if (result.success && result.extractor) {
        log(`[Synthesis] SUCCESS (fallback): Synthesized extractor function`);
        log(`[Synthesis] Generated code: ${result.extractorCode?.slice(0, 100)}...`);
        log(`[Synthesis] Time: ${result.synthesisTimeMs}ms`);
        return result.extractor.test;
      } else {
        log(`[Synthesis] FAILED: Could not synthesize extractor from constraints`);
        if (result.error) log(`[Synthesis] Error: ${result.error}`);
        log(`[Synthesis] Hint: Try different input/output pairs or ensure outputs are consistent`);
        return null;
      }
    },

    get_extractor_code: (
      examples: Array<{ input: string; output: unknown }>
    ): string | null => {
      if (!examples || examples.length === 0) {
        log(`[Synthesis] get_extractor_code called with empty examples`);
        return null;
      }

      const inputMap = new Map<string, unknown>();
      for (const ex of examples) {
        if (inputMap.has(ex.input)) {
          const existing = inputMap.get(ex.input);
          if (existing !== ex.output) {
            const existJson = JSON.stringify(existing);
            const outJson = JSON.stringify(ex.output);
            log(`[Synthesis] CONFLICT: Same input "${ex.input}" has different outputs: ${existJson.length > 1000 ? existJson.slice(0, 1000) + "..." : existJson} vs ${outJson.length > 1000 ? outJson.slice(0, 1000) + "..." : outJson}`);
            return null;
          }
        }
        inputMap.set(ex.input, ex.output);
      }

      log(`[Synthesis] get_extractor_code called with ${examples.length} constraints`);

      try {
        const relationalExamples: Example[] = examples.map(e => ({
          input: e.input,
          output: e.output as string | number | boolean | null,
        }));

        const extractors = relationalSynthesize(relationalExamples);

        if (extractors.length > 0) {
          const extractor = extractors[0];
          const code = compileToFunctionString(extractor);
          log(`[Synthesis] SUCCESS (relational): ${code}`);
          return code;
        }
      } catch (err) {
        const errMsg = err instanceof Error ? err.message : String(err);
        log(`[Synthesis] Relational synthesis failed: ${errMsg}`);
      }

      const result = coordinator.synthesize({
        type: "extractor",
        description: "sandbox_synthesis",
        positiveExamples: examples.map((e) => e.input),
        expectedOutputs: examples.map((e) => e.output),
      });

      if (result.success && result.extractorCode) {
        log(`[Synthesis] SUCCESS (fallback): Generated code: ${result.extractorCode.slice(0, 100)}...`);
        return result.extractorCode;
      }

      log(`[Synthesis] FAILED: Could not generate extractor code`);
      return null;
    },

    test_regex: (pattern: string, str: string): boolean => {
      return coordinator.testRegex(pattern, str);
    },

    extract_with_regex: (pattern: string, str: string): string | null => {
      if (!coordinator.validateRegex(pattern)) return null;
      try {
        const regex = new RegExp(pattern);
        const match = str.match(regex);
        if (!match) return null;
        return match[1] ?? match[0];
      } catch {
        return null;
      }
    },
  };

  // Create sandbox using repl-sandbox with synthesis extensions
  const sandbox = createSandbox(context, {
    globals: {
      __llmQueryBridge: llmBridge,
      __synthesisBridge: synthesisBridge,
    },
    builtins: [GREP_IMPL, FUZZY_SEARCH_IMPL, COUNT_TOKENS_IMPL, LOCATE_LINE_IMPL, LLM_QUERY_IMPL],
    initCode: SYNTHESIS_INIT_CODE,
    timeoutMs: options.timeoutMs,
    maxLogs: options.maxLogs,
  });

  return {
    execute: sandbox.execute.bind(sandbox),
    getMemory: sandbox.getMemory.bind(sandbox),
    dispose: sandbox.dispose.bind(sandbox),
    getCoordinator: () => coordinator,
  };
}
