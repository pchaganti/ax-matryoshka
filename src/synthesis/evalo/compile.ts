/**
 * JavaScript Compilation for the Data Extraction DSL
 *
 * Converts Extractor DSL to executable JavaScript code.
 * This allows synthesized extractors to be used at runtime
 * without the overhead of the interpreter.
 */

import type { Extractor, Value } from "./types.js";
import { validateRegex } from "../../logic/lc-solver.js";

/**
 * Compile an extractor to JavaScript code
 *
 * The generated code expects 'input' to be in scope.
 */
const MAX_COMPILE_DEPTH = 100;

export function compile(extractor: Extractor, depth: number = 0): string {
  if (depth > MAX_COMPILE_DEPTH) return "null";
  switch (extractor.tag) {
    case "input":
      return "input";

    case "lit":
      if (typeof extractor.value === "string") {
        return JSON.stringify(extractor.value);
      }
      if (typeof extractor.value === "number" && !Number.isFinite(extractor.value)) return "null";
      return String(extractor.value);

    case "match": {
      const matchValidation = validateRegex(extractor.pattern);
      if (!matchValidation.valid) return "null";
      if (!Number.isInteger(extractor.group) || extractor.group < 0 || extractor.group > 99) return "null";
      const strCode = compile(extractor.str, depth + 1);
      return `((_s) => typeof _s !== "string" ? null : _s.match(new RegExp(${JSON.stringify(extractor.pattern)}))?.[${extractor.group}] ?? null)(${strCode})`;
    }

    case "replace": {
      const replaceValidation = validateRegex(extractor.from);
      if (!replaceValidation.valid) return compile(extractor.str, depth + 1);
      const strCode = compile(extractor.str, depth + 1);
      // Escape $ as $$ for replacement string to prevent backreference injection
      const to = escapeStringForLiteral(extractor.to.replace(/\$/g, "$$$$"));
      return `((_s) => typeof _s !== "string" ? null : _s.replace(new RegExp(${JSON.stringify(extractor.from)}, "g"), "${to}"))(${strCode})`;
    }

    case "slice": {
      if (!Number.isSafeInteger(extractor.start) || !Number.isSafeInteger(extractor.end)) return "null";
      if (extractor.start < 0) return "null";
      const strCode = compile(extractor.str, depth + 1);
      return `((_s) => typeof _s !== "string" ? null : _s.slice(${extractor.start}, ${extractor.end}))(${strCode})`;
    }

    case "split": {
      if (!extractor.delim || extractor.delim.length > 1000) return "null";
      const strCode = compile(extractor.str, depth + 1);
      const delim = escapeStringForLiteral(extractor.delim);
      const idx = extractor.index;
      if (!Number.isInteger(idx) || idx < 0) {
        return `null`;
      }
      return `((_s) => typeof _s !== "string" ? null : _s.split("${delim}")?.[${idx}] ?? null)(${strCode})`;
    }

    case "parseInt": {
      const strCode = compile(extractor.str, depth + 1);
      return `((_v) => { const _r = parseInt(_v, 10); return isNaN(_r) || !Number.isSafeInteger(_r) ? null : _r; })(${strCode})`;
    }

    case "parseFloat": {
      const strCode = compile(extractor.str, depth + 1);
      return `((_v) => { const _r = parseFloat(_v); return isNaN(_r) || !isFinite(_r) ? null : _r; })(${strCode})`;
    }

    case "add": {
      const leftCode = compile(extractor.left, depth + 1);
      const rightCode = compile(extractor.right, depth + 1);
      return `((_l, _r) => (typeof _l !== "number" || typeof _r !== "number" || isNaN(_l) || isNaN(_r)) ? null : (isFinite(_l + _r) ? _l + _r : null))(${leftCode}, ${rightCode})`;
    }

    case "if": {
      const condCode = compile(extractor.cond, depth + 1);
      const thenCode = compile(extractor.then, depth + 1);
      const elseCode = compile(extractor.else, depth + 1);
      return `((_c) => (_c === null || _c === "" || _c === 0 || _c === false || (typeof _c === "number" && isNaN(_c))) ? (${elseCode}) : (${thenCode}))(${condCode})`;
    }

    default:
      return "null";
  }
}

/**
 * Compile an extractor to a JavaScript function
 *
 * @returns A function that takes an input string and returns the extracted value
 */
const MAX_COMPILED_CODE_LENGTH = 100_000;

const VALID_TAGS = new Set(["input", "lit", "match", "replace", "slice", "split", "parseInt", "parseFloat", "add", "if"]);

export function compileToFunction(extractor: Extractor): (input: string) => Value {
  if (!extractor || !VALID_TAGS.has(extractor.tag)) {
    throw new Error(`Invalid extractor tag: ${extractor?.tag}`);
  }
  const code = compile(extractor);
  if (code.length > MAX_COMPILED_CODE_LENGTH) {
    throw new Error(`Compiled code too long (${code.length} chars, max ${MAX_COMPILED_CODE_LENGTH})`);
  }
  const fnCode = `(input) => ${code}`;

  try {
    // Use Function constructor to create the function
    // This is safe because we control the code generation
    return new Function("input", `return ${code}`) as (input: string) => Value;
  } catch (err) {
    throw new Error(`Failed to compile extractor: ${err}`);
  }
}

/**
 * Compile an extractor to a complete function expression string
 *
 * Useful for displaying the generated code to users.
 */
export function compileToFunctionString(extractor: Extractor): string {
  const code = compile(extractor);
  return `(input) => ${code}`;
}

/**
 * Escape special characters for use in a string literal
 */
const MAX_ESCAPE_INPUT_LENGTH = 10_000;

function escapeStringForLiteral(str: string): string {
  if (str.length > MAX_ESCAPE_INPUT_LENGTH) str = str.slice(0, MAX_ESCAPE_INPUT_LENGTH);
  return str
    .replace(/\\/g, "\\\\")
    .replace(/\0/g, "\\0")
    .replace(/"/g, '\\"')
    .replace(/`/g, "\\`")
    .replace(/\$/g, "\\$")
    .replace(/\n/g, "\\n")
    .replace(/\r/g, "\\r")
    .replace(/\t/g, "\\t");
}

/**
 * Pretty-print an extractor as a human-readable expression
 */
export function prettyPrint(extractor: Extractor): string {
  switch (extractor.tag) {
    case "input":
      return "input";

    case "lit":
      return JSON.stringify(extractor.value);

    case "match":
      return `match(${prettyPrint(extractor.str)}, /${extractor.pattern}/, ${extractor.group})`;

    case "replace":
      return `replace(${prettyPrint(extractor.str)}, ${JSON.stringify(extractor.from)}, ${JSON.stringify(extractor.to)})`;

    case "slice":
      return `slice(${prettyPrint(extractor.str)}, ${extractor.start}, ${extractor.end})`;

    case "split":
      return `split(${prettyPrint(extractor.str)}, ${JSON.stringify(extractor.delim)}, ${extractor.index})`;

    case "parseInt":
      return `parseInt(${prettyPrint(extractor.str)})`;

    case "parseFloat":
      return `parseFloat(${prettyPrint(extractor.str)})`;

    case "add":
      return `add(${prettyPrint(extractor.left)}, ${prettyPrint(extractor.right)})`;

    case "if":
      return `if(${prettyPrint(extractor.cond)}, ${prettyPrint(extractor.then)}, ${prettyPrint(extractor.else)})`;
  }
}
