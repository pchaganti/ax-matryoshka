/**
 * LC Interpreter
 *
 * Directly evaluates Lambda Calculus terms using the sandbox tools.
 * This is the core solver that interprets the model's intent.
 *
 * The model outputs LC terms, and this interpreter executes them
 * using the actual primitives (grep, fuzzy_search, filter, map, etc.)
 */

import type { LCTerm } from "./types.js";
import { resolveConstraints } from "./constraint-resolver.js";
import { validateRegex } from "./lc-solver.js";

// Type for sandbox tools interface
export interface SandboxTools {
  grep: (pattern: string) => Array<{ match: string; line: string; lineNum: number; index: number; groups: string[] }>;
  fuzzy_search: (query: string, limit?: number) => Array<{ line: string; lineNum: number; score: number }>;
  text_stats: () => { length: number; lineCount: number; sample: { start: string; middle: string; end: string } };
  llm_query?: (prompt: string) => Promise<string>;
  context: string;
}

// Runtime value types
export type LCValue =
  | null
  | boolean
  | number
  | string
  | LCValue[]
  | { [key: string]: LCValue }
  | LCClosure
  | ((input: unknown) => LCValue | boolean);

// A closure captures a lambda's environment
export interface LCClosure {
  tag: "closure";
  param: string;
  body: LCTerm;
  env: Environment;
}

// Environment maps variable names to values
export type Environment = Map<string, LCValue>;

/**
 * Interpretation result
 */
export interface InterpretResult {
  success: boolean;
  value: LCValue;
  logs: string[];
  error?: string;
}

/**
 * Interpret an LC term with the given sandbox tools
 */
export function interpret(
  term: LCTerm,
  tools: SandboxTools,
  env: Environment = new Map()
): InterpretResult {
  const logs: string[] = [];
  const MAX_LOG_ENTRIES = 10000;
  const MAX_LOG_MSG_LENGTH = 2000;
  const log = (msg: string) => {
    if (logs.length < MAX_LOG_ENTRIES) {
      logs.push(msg.length > MAX_LOG_MSG_LENGTH ? msg.slice(0, MAX_LOG_MSG_LENGTH) + "..." : msg);
    }
  };

  try {
    // Resolve constraints first
    const resolved = resolveConstraints(term);
    const value = evaluate(resolved.term, tools, env, log, 0);
    return { success: true, value, logs };
  } catch (err) {
    return {
      success: false,
      value: null,
      logs,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

const MAX_EVAL_DEPTH = 1000;

/**
 * Core evaluation function
 */
export function evaluate(
  term: LCTerm,
  tools: SandboxTools,
  env: Environment,
  log: (msg: string) => void,
  depth: number = 0
): LCValue {
  if (depth > MAX_EVAL_DEPTH) {
    throw new Error(`Maximum evaluation depth (${MAX_EVAL_DEPTH}) exceeded`);
  }
  switch (term.tag) {
    case "lit":
      return term.value as LCValue;

    case "var": {
      // Check environment first
      if (env.has(term.name)) {
        return env.get(term.name)!;
      }
      // Check for built-in constants
      if (term.name === "context") {
        return tools.context;
      }
      throw new Error(`Unbound variable: ${term.name}`);
    }

    case "input":
      return tools.context;

    case "grep": {
      log(`Searching for pattern: "${term.pattern}"`);
      const grepValidation = validateRegex(term.pattern);
      if (!grepValidation.valid) {
        log(`Invalid grep pattern: ${grepValidation.error}`);
        return [] as LCValue;
      }
      const results = tools.grep(term.pattern);
      log(`Found ${results.length} matches`);
      if (results.length > 0) {
        log(`First 5 matches:`);
        results.slice(0, 5).forEach((r, i) => {
          log(`  ${i + 1}. [line ${r.lineNum}] ${r.line}`);
        });
      }
      return results as LCValue;
    }

    case "fuzzy_search": {
      log(`Fuzzy searching for: "${term.query}"`);
      const limit = term.limit ?? 10;
      const results = tools.fuzzy_search(term.query, limit);
      log(`Found ${results.length} fuzzy matches`);
      return results as LCValue;
    }

    case "text_stats": {
      log(`Getting document statistics`);
      const stats = tools.text_stats();
      log(`Document: ${stats.length} chars, ${stats.lineCount} lines`);
      return stats as LCValue;
    }

    case "filter": {
      // Evaluate the collection
      const collection = evaluate(term.collection, tools, env, log, depth + 1);
      if (!Array.isArray(collection)) {
        throw new Error(`filter: expected array, got ${typeof collection}`);
      }

      // Evaluate the predicate (should be a closure, lambda, or native function)
      const predicate = evaluate(term.predicate, tools, env, log, depth + 1);

      log(`Filtering ${collection.length} items`);

      // Apply predicate to each element
      const results: LCValue[] = [];
      for (const item of collection) {
        let result: LCValue;
        if (typeof predicate === "function") {
          // Native function (e.g., from classify)
          try {
            result = (predicate as (arg: unknown) => unknown)(item) as LCValue;
          } catch (err) {
            throw new Error(`filter: native predicate threw: ${err instanceof Error ? err.message : String(err)}`);
          }
        } else if (isClosure(predicate)) {
          const newEnv = new Map(predicate.env);
          newEnv.set(predicate.param, item);
          result = evaluate(predicate.body, tools, newEnv, log, depth + 1);
        } else {
          throw new Error(`filter: predicate must be a function`);
        }
        if (result) {
          results.push(item);
        }
      }

      log(`Filter kept ${results.length} items`);
      return results;
    }

    case "map": {
      // Evaluate the collection
      const collection = evaluate(term.collection, tools, env, log, depth + 1);
      if (!Array.isArray(collection)) {
        throw new Error(`map: expected array, got ${typeof collection}`);
      }

      // Evaluate the transform function (closure or native function)
      const transform = evaluate(term.transform, tools, env, log, depth + 1);

      log(`Mapping over ${collection.length} items`);

      // Apply transform to each element
      const results: LCValue[] = [];
      for (const item of collection) {
        let result: LCValue;
        if (typeof transform === "function") {
          // Native function (e.g., from classify)
          try {
            result = (transform as (arg: unknown) => unknown)(item) as LCValue;
          } catch (err) {
            throw new Error(`map: native transform threw: ${err instanceof Error ? err.message : String(err)}`);
          }
        } else if (isClosure(transform)) {
          const newEnv = new Map(transform.env);
          newEnv.set(transform.param, item);
          result = evaluate(transform.body, tools, newEnv, log, depth + 1);
        } else {
          throw new Error(`map: transform must be a function`);
        }
        results.push(result);
      }

      return results;
    }

    case "match": {
      if (term.group < 0) return null;
      const str = evaluate(term.str, tools, env, log, depth + 1);
      if (typeof str !== "string") {
        throw new Error(`match: expected string, got ${typeof str}`);
      }
      const matchValidation = validateRegex(term.pattern);
      if (!matchValidation.valid) return null;
      const regex = new RegExp(term.pattern);
      const result = str.match(regex);
      if (!result) return null;
      if (term.group >= result.length) {
        log(`match: group ${term.group} out of bounds (result has ${result.length} groups)`);
        return null;
      }
      return result[term.group] ?? null;
    }

    case "replace": {
      const str = evaluate(term.str, tools, env, log, depth + 1);
      if (typeof str !== "string") {
        throw new Error(`replace: expected string, got ${typeof str}`);
      }
      const replaceValidation = validateRegex(term.from);
      if (!replaceValidation.valid) return str;
      // Escape $ in replacement to prevent backreference injection ($1, $&, etc.)
      const safeReplacement = term.to.replace(/\$/g, "$$$$");
      return str.replace(new RegExp(term.from, "g"), safeReplacement);
    }

    case "split": {
      const str = evaluate(term.str, tools, env, log, depth + 1);
      if (typeof str !== "string") {
        throw new Error(`split: expected string, got ${typeof str}`);
      }
      if (term.index < 0) return null;
      if (!term.delim.length) return null;
      const parts = str.split(term.delim);
      return parts[term.index] ?? null;
    }

    case "parseInt": {
      const str = evaluate(term.str, tools, env, log, depth + 1);
      if (typeof str !== "string" && typeof str !== "number") {
        throw new Error(`parseInt: expected string or number, got ${typeof str}`);
      }
      const intResult = parseInt(String(str), 10);
      return isNaN(intResult) ? null : intResult;
    }

    case "parseFloat": {
      const str = evaluate(term.str, tools, env, log, depth + 1);
      if (typeof str !== "string" && typeof str !== "number") {
        throw new Error(`parseFloat: expected string or number, got ${typeof str}`);
      }
      const floatResult = parseFloat(String(str));
      return isNaN(floatResult) ? null : floatResult;
    }

    case "add": {
      const left = evaluate(term.left, tools, env, log, depth + 1);
      const right = evaluate(term.right, tools, env, log, depth + 1);
      if (typeof left !== "number" || typeof right !== "number") {
        throw new Error(`add: expected numbers`);
      }
      return left + right;
    }

    case "if": {
      const cond = evaluate(term.cond, tools, env, log, depth + 1);
      if (cond) {
        return evaluate(term.then, tools, env, log, depth + 1);
      } else {
        return evaluate(term.else, tools, env, log, depth + 1);
      }
    }

    case "lambda":
      // Return a closure capturing the current environment
      return {
        tag: "closure",
        param: term.param,
        body: term.body,
        env: new Map(env),
      };

    case "app": {
      // Evaluate the function
      const fn = evaluate(term.fn, tools, env, log, depth + 1);

      // Evaluate the argument
      const arg = evaluate(term.arg, tools, env, log, depth + 1);

      // Accept native functions (e.g., from classify)
      if (typeof fn === "function") {
        try {
          return (fn as (arg: unknown) => unknown)(arg) as LCValue;
        } catch (err) {
          throw new Error(`app: native function threw: ${err instanceof Error ? err.message : String(err)}`);
        }
      }

      if (!isClosure(fn)) {
        throw new Error(`app: expected function, got ${typeof fn}`);
      }

      // Apply: extend the closure's environment with the argument
      const newEnv = new Map(fn.env);
      newEnv.set(fn.param, arg);

      // Evaluate the body in the extended environment
      return evaluate(fn.body, tools, newEnv, log, depth + 1);
    }

    case "classify": {
      // Classify builds a predicate function from examples
      log(`Building classifier from ${term.examples.length} examples`);

      // Filter out empty strings — "".includes("") is always true, making classifier match everything
      const trueExamples = term.examples.filter(e => e.output === true).map(e => e.input).filter(s => s.length > 0);
      const falseExamples = term.examples.filter(e => e.output === false).map(e => e.input).filter(s => s.length > 0);

      log(`  True examples: ${trueExamples.length}, False examples: ${falseExamples.length}`);

      // Return a function that checks if input matches true examples but not false ones
      return (input: unknown) => {
        // Extract string from grep result objects that have .line property
        const str = typeof input === "object" && input !== null && "line" in input
          ? String((input as { line: unknown }).line)
          : String(input);
        // Must match at least one true example
        const matchesTrue = trueExamples.some(ex => str.includes(ex));
        // Must not match any false example
        const matchesFalse = falseExamples.some(ex => str.includes(ex));
        return matchesTrue && !matchesFalse;
      };
    }

    case "sum": {
      const collection = evaluate(term.collection, tools, env, log, depth + 1);
      if (!Array.isArray(collection)) {
        throw new Error(`sum: expected array, got ${typeof collection}`);
      }
      log(`Summing ${collection.length} items`);
      let total = 0;
      for (const item of collection) {
        if (typeof item === "number" && isFinite(item)) {
          total += item;
        } else if (typeof item === "object" && item !== null) {
          // Try to extract numeric values from objects
          const vals = Object.values(item as Record<string, unknown>);
          for (const v of vals) {
            if (typeof v === "number" && isFinite(v)) {
              total += v;
              break;
            }
          }
        }
      }
      return total;
    }

    case "count": {
      const collection = evaluate(term.collection, tools, env, log, depth + 1);
      if (!Array.isArray(collection)) {
        throw new Error(`count: expected array, got ${typeof collection}`);
      }
      log(`Counting: ${collection.length} items`);
      return collection.length;
    }

    case "lines": {
      const lines = tools.context.split("\n");
      const start = Math.max(1, term.start);
      const end = Math.min(lines.length, term.end);
      log(`Getting lines ${start}-${end}`);
      return lines.slice(start - 1, end).join("\n");
    }

    case "reduce": {
      const collection = evaluate(term.collection, tools, env, log, depth + 1);
      if (!Array.isArray(collection)) {
        throw new Error(`reduce: expected array, got ${typeof collection}`);
      }
      const init = evaluate(term.init, tools, env, log, depth + 1);
      const fn = evaluate(term.fn, tools, env, log, depth + 1);
      log(`Reducing ${collection.length} items`);
      let acc = init;
      for (const item of collection) {
        if (isClosure(fn)) {
          const newEnv = new Map(fn.env);
          newEnv.set(fn.param, acc);
          // For two-arg lambda, we need a closure that captures acc
          const innerResult = evaluate(fn.body, tools, newEnv, log, depth + 1);
          if (isClosure(innerResult)) {
            const innerEnv = new Map(innerResult.env);
            innerEnv.set(innerResult.param, item);
            acc = evaluate(innerResult.body, tools, innerEnv, log, depth + 1);
          } else {
            acc = innerResult;
          }
        } else if (typeof fn === "function") {
          acc = (fn as (arg: unknown) => unknown)(acc) as LCValue;
          if (typeof acc === "function") {
            acc = (acc as (arg: unknown) => unknown)(item) as LCValue;
          }
        } else {
          throw new Error(`reduce: fn must be a function`);
        }
      }
      return acc;
    }

    case "parseCurrency": {
      const str = evaluate(term.str, tools, env, log, depth + 1);
      if (typeof str !== "string") return null;
      log(`Parsing currency: "${str}"`);
      // Remove currency symbols and whitespace
      let cleaned = str.replace(/[^0-9.,\-()]/g, "");
      const isNegative = cleaned.startsWith("(") || cleaned.startsWith("-") || cleaned.endsWith("-");
      cleaned = cleaned.replace(/[()]/g, "").replace(/^-|-$/g, "");
      // Detect EU format: comma is decimal separator when it's the last separator
      // EU: "1.234,56" -> comma after last period means comma is decimal
      // US: "1,234.56" -> period after last comma means period is decimal
      const lastCommaPos = cleaned.lastIndexOf(",");
      const lastDotPos = cleaned.lastIndexOf(".");
      if (lastCommaPos > lastDotPos && lastCommaPos >= 0) {
        // EU format: periods are thousands separators, comma is decimal
        cleaned = cleaned.replace(/\./g, "").replace(",", ".");
      } else {
        // US format: commas are thousands separators
        cleaned = cleaned.replace(/,/g, "");
      }
      const num = parseFloat(cleaned);
      if (isNaN(num)) return null;
      return isNegative ? -num : num;
    }

    case "parseDate": {
      const str = evaluate(term.str, tools, env, log, depth + 1);
      if (typeof str !== "string") return null;
      log(`Parsing date: "${str}"`);
      // ISO format
      const isoMatch = str.match(/^(\d{4})-(\d{2})-(\d{2})$/);
      if (isoMatch) return str;
      // Try Date.parse fallback
      const d = new Date(str);
      if (!isNaN(d.getTime())) {
        const y = d.getUTCFullYear();
        const m = String(d.getUTCMonth() + 1).padStart(2, "0");
        const day = String(d.getUTCDate()).padStart(2, "0");
        return `${y}-${m}-${day}`;
      }
      return null;
    }

    case "parseNumber": {
      const str = evaluate(term.str, tools, env, log, depth + 1);
      if (typeof str !== "string") return null;
      log(`Parsing number: "${str}"`);
      let cleaned = str.replace(/[^0-9.,\-]/g, "");
      cleaned = cleaned.replace(/,/g, "");
      const num = parseFloat(cleaned);
      return isNaN(num) ? null : num;
    }

    case "coerce": {
      const val = evaluate(term.term, tools, env, log, depth + 1);
      log(`Coercing to ${term.targetType}`);
      switch (term.targetType) {
        case "number": {
          if (typeof val === "number") return val;
          if (typeof val === "string") {
            const n = parseFloat(val);
            return isNaN(n) ? null : n;
          }
          return null;
        }
        case "string":
          return val == null ? null : String(val);
        case "boolean":
          return Boolean(val);
        default:
          return val;
      }
    }

    case "extract": {
      const str = evaluate(term.str, tools, env, log, depth + 1);
      if (typeof str !== "string") return null;
      log(`Extracting pattern from string`);
      const extractValidation = validateRegex(term.pattern);
      if (!extractValidation.valid) return null;
      const regex = new RegExp(term.pattern);
      const m = str.match(regex);
      return m ? (m[term.group] ?? null) : null;
    }

    case "synthesize":
      log(`Synthesize: ${term.examples.length} examples`);
      return null;

    case "predicate": {
      const str = evaluate(term.str, tools, env, log, depth + 1);
      log(`Evaluating predicate`);
      return str != null;
    }

    case "define-fn":
      log(`Defining function: ${term.name}`);
      return null;

    case "apply-fn": {
      const arg = evaluate(term.arg, tools, env, log, depth + 1);
      log(`Applying function: ${term.name}`);
      if (env.has(term.name)) {
        const fn = env.get(term.name)!;
        if (typeof fn === "function") {
          return (fn as (a: unknown) => unknown)(arg) as LCValue;
        }
        if (isClosure(fn)) {
          const newEnv = new Map(fn.env);
          newEnv.set(fn.param, arg);
          return evaluate(fn.body, tools, newEnv, log, depth + 1);
        }
      }
      return null;
    }

    case "list_symbols":
      log(`Listing symbols${term.kind ? ` of kind ${term.kind}` : ""}`);
      return [] as LCValue;

    case "get_symbol_body": {
      const sym = evaluate(term.symbol, tools, env, log, depth + 1);
      log(`Getting symbol body: ${sym}`);
      return null;
    }

    case "find_references":
      log(`Finding references for: ${term.name}`);
      return tools.grep(term.name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")) as LCValue;

    case "constrained":
      // Constraints should be resolved before evaluation
      return evaluate(term.term, tools, env, log, depth + 1);

    default:
      throw new Error(`Unknown term tag: ${(term as LCTerm).tag}`);
  }
}

/**
 * Type guard for closures
 */
function isClosure(value: LCValue): value is LCClosure {
  return (
    value !== null &&
    typeof value === "object" &&
    "tag" in value &&
    (value as LCClosure).tag === "closure"
  );
}

/**
 * Pretty-print an LC value for display
 */
export function formatValue(value: LCValue, indent: number = 0): string {
  const MAX_FORMAT_DEPTH = 20;
  if (indent > MAX_FORMAT_DEPTH) return "...";
  const pad = "  ".repeat(Math.min(indent, MAX_FORMAT_DEPTH));

  if (value === null) return "null";
  if (typeof value === "boolean") return String(value);
  if (typeof value === "number") return String(value);
  if (typeof value === "string") return JSON.stringify(value);

  if (Array.isArray(value)) {
    if (value.length === 0) return "[]";
    if (value.length <= 3 && value.every(v => typeof v !== "object")) {
      return `[${value.map(v => formatValue(v)).join(", ")}]`;
    }
    const items = value.slice(0, 10).map(v => `${pad}  ${formatValue(v, indent + 1)}`).join(",\n");
    const more = value.length > 10 ? `\n${pad}  ... (${value.length - 10} more)` : "";
    return `[\n${items}${more}\n${pad}]`;
  }

  if (isClosure(value)) {
    return `<function (${value.param}) => ...>`;
  }

  if (typeof value === "function") {
    return `<function>`;
  }

  if (typeof value === "object") {
    const entries = Object.entries(value);
    if (entries.length === 0) return "{}";
    const items = entries.slice(0, 5).map(([k, v]) => `${pad}  ${k}: ${formatValue(v, indent + 1)}`).join(",\n");
    return `{\n${items}\n${pad}}`;
  }

  return String(value);
}
