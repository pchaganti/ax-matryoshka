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
export function compile(extractor: Extractor): string {
  switch (extractor.tag) {
    case "input":
      return "input";

    case "lit":
      if (typeof extractor.value === "string") {
        return JSON.stringify(extractor.value);
      }
      return String(extractor.value);

    case "match": {
      const matchValidation = validateRegex(extractor.pattern);
      if (!matchValidation.valid) return "null";
      if (!Number.isInteger(extractor.group) || extractor.group < 0) return "null";
      const strCode = compile(extractor.str);
      return `(${strCode}).match(new RegExp(${JSON.stringify(extractor.pattern)}))?.[${extractor.group}] ?? null`;
    }

    case "replace": {
      const replaceValidation = validateRegex(extractor.from);
      if (!replaceValidation.valid) return compile(extractor.str);
      const strCode = compile(extractor.str);
      // Escape $ as $$ for replacement string to prevent backreference injection
      const to = escapeStringForLiteral(extractor.to.replace(/\$/g, "$$$$"));
      return `((_s) => typeof _s !== "string" ? null : _s.replace(new RegExp(${JSON.stringify(extractor.from)}, "g"), "${to}"))(${strCode})`;
    }

    case "slice": {
      if (!Number.isSafeInteger(extractor.start) || !Number.isSafeInteger(extractor.end)) return "null";
      if (extractor.start < 0) return "null";
      const strCode = compile(extractor.str);
      return `((_s) => typeof _s !== "string" ? null : _s.slice(${extractor.start}, ${extractor.end}))(${strCode})`;
    }

    case "split": {
      const strCode = compile(extractor.str);
      const delim = escapeStringForLiteral(extractor.delim);
      const idx = extractor.index;
      if (!Number.isInteger(idx) || idx < 0) {
        return `null`;
      }
      return `((_s) => typeof _s !== "string" ? null : _s.split("${delim}")?.[${idx}] ?? null)(${strCode})`;
    }

    case "parseInt": {
      const strCode = compile(extractor.str);
      return `((_v) => { const _r = parseInt(_v, 10); return isNaN(_r) || !Number.isSafeInteger(_r) ? null : _r; })(${strCode})`;
    }

    case "parseFloat": {
      const strCode = compile(extractor.str);
      return `((_v) => { const _r = parseFloat(_v); return isNaN(_r) || !isFinite(_r) ? null : _r; })(${strCode})`;
    }

    case "add": {
      const leftCode = compile(extractor.left);
      const rightCode = compile(extractor.right);
      return `((_l, _r) => (typeof _l !== "number" || typeof _r !== "number" || isNaN(_l) || isNaN(_r)) ? null : (isFinite(_l + _r) ? _l + _r : null))(${leftCode}, ${rightCode})`;
    }

    case "if": {
      const condCode = compile(extractor.cond);
      const thenCode = compile(extractor.then);
      const elseCode = compile(extractor.else);
      return `(${condCode}) ? (${thenCode}) : (${elseCode})`;
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
export function compileToFunction(extractor: Extractor): (input: string) => Value {
  const code = compile(extractor);
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
function escapeStringForLiteral(str: string): string {
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
      return `replace(${prettyPrint(extractor.str)}, "${extractor.from}", "${extractor.to}")`;

    case "slice":
      return `slice(${prettyPrint(extractor.str)}, ${extractor.start}, ${extractor.end})`;

    case "split":
      return `split(${prettyPrint(extractor.str)}, "${extractor.delim}", ${extractor.index})`;

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
