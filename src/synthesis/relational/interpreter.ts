/**
 * Relational JavaScript Interpreter
 *
 * A miniKanren-based synthesis system for data extraction programs.
 * Uses miniKanren for constraint-based program enumeration and
 * JavaScript execution for testing candidates.
 *
 * Uses local minikanren (copied from ramo)
 */

import { run, eq, conde, exist, Rel } from "../../minikanren/index.js";
import type { Var } from "../../minikanren/common.js";

// ============================================================================
// Expression Types (AST nodes)
// ============================================================================

export type Expr =
  | { type: "lit"; value: number | string }
  | { type: "var"; name: string }
  | { type: "add"; left: Expr; right: Expr }
  | { type: "sub"; left: Expr; right: Expr }
  | { type: "mul"; left: Expr; right: Expr }
  | { type: "div"; left: Expr; right: Expr }
  | { type: "concat"; left: Expr; right: Expr }
  | { type: "match"; str: Expr; pattern: string; group: number }
  | { type: "replace"; str: Expr; pattern: string; replacement: string }
  | { type: "parseInt"; str: Expr }
  | { type: "parseFloat"; str: Expr }
  | { type: "if"; cond: Expr; then: Expr; else: Expr };

export interface Example {
  input: unknown;
  output: unknown;
}

// ============================================================================
// Program Structure Enumeration with miniKanren
// ============================================================================

/**
 * Common regex patterns for data extraction
 */
const EXTRACTION_PATTERNS = [
  "\\$([\\d,]+)",           // Currency: $1,000
  "\\$([\\d,\\.]+)",        // Currency with decimals
  "(\\d+)%",                // Percentage: 50%
  "(\\d+)",                 // Plain number
  "([\\d,]+)",              // Number with commas
  ":\\s*\\$?([\\d,]+)",     // Key: value pattern
];

/**
 * Program structure relation - enumerates possible program shapes
 *
 * This uses miniKanren to enumerate program structures that match
 * the constraint of being an extraction program.
 */
const programStructureo = Rel((structure: Var) =>
  conde(
    // Direct parseFloat of match group 1
    eq(structure, { kind: "parseFloat_match", group: 1 }),
    // Direct parseInt of match group 1
    eq(structure, { kind: "parseInt_match", group: 1 }),
    // parseFloat with comma removal
    eq(structure, { kind: "parseFloat_replace_match", group: 1 }),
    // Direct match group 0
    eq(structure, { kind: "match", group: 0 }),
    // Direct match group 1
    eq(structure, { kind: "match", group: 1 }),
  )
);

/**
 * Pattern relation - enumerates possible regex patterns
 */
const patterno = Rel((pattern: Var) =>
  conde(
    ...EXTRACTION_PATTERNS.map(p => eq(pattern, p))
  )
);

/**
 * Enumerate candidate programs using miniKanren
 *
 * Returns an array of { structure, pattern } objects that can be
 * compiled into executable code.
 */
export function enumerateCandidates(maxCandidates: number): Array<{ structure: unknown; pattern: string }> {
  // Use miniKanren to enumerate structure + pattern combinations
  const results = run(maxCandidates)((q: Var) =>
    exist((structure: Var, pattern: Var) => [
      programStructureo(structure),
      patterno(pattern),
      eq(q, { structure, pattern }),
    ])
  );

  return results as Array<{ structure: unknown; pattern: string }>;
}

// ============================================================================
// Candidate Compilation
// ============================================================================

/**
 * Compile a candidate { structure, pattern } into an Expr AST
 */
function compileCandidate(candidate: { structure: { kind: string; group: number }; pattern: string }): Expr {
  const { structure, pattern } = candidate;
  const inputVar: Expr = { type: "var", name: "input" };

  switch (structure.kind) {
    case "parseFloat_match":
      return {
        type: "parseFloat",
        str: {
          type: "match",
          str: inputVar,
          pattern: pattern,
          group: structure.group,
        },
      };

    case "parseInt_match":
      return {
        type: "parseInt",
        str: {
          type: "match",
          str: inputVar,
          pattern: pattern,
          group: structure.group,
        },
      };

    case "parseFloat_replace_match":
      return {
        type: "parseFloat",
        str: {
          type: "replace",
          str: {
            type: "match",
            str: inputVar,
            pattern: pattern,
            group: structure.group,
          },
          pattern: ",",
          replacement: "",
        },
      };

    case "match":
      return {
        type: "match",
        str: inputVar,
        pattern: pattern,
        group: structure.group,
      };

    default:
      // Fallback: direct match
      return {
        type: "match",
        str: inputVar,
        pattern: pattern,
        group: 0,
      };
  }
}

/**
 * Execute an Expr and return the result
 */
function executeExpr(expr: Expr, input: unknown): unknown {
  const code = exprToCode(expr);
  try {
    const fn = new Function("input", `return ${code}`);
    return fn(input);
  } catch {
    return null;
  }
}

// ============================================================================
// Program Synthesis
// ============================================================================

/**
 * Synthesize a program from input/output examples
 *
 * Uses miniKanren to enumerate candidate program structures,
 * then tests each candidate against the examples using JavaScript execution.
 *
 * This is a two-phase approach:
 * 1. miniKanren enumerates possible program shapes (inner loop)
 * 2. JavaScript tests candidates against examples (verification)
 *
 * @param examples - Array of { input, output } pairs
 * @param maxResults - Maximum number of successful programs to find
 * @returns Array of candidate programs that pass all examples
 */
export function synthesizeProgram(
  examples: Example[],
  maxResults: number = 5
): Expr[] {
  if (examples.length === 0) {
    return [];
  }

  const successfulPrograms: Expr[] = [];

  // Use miniKanren to enumerate candidate structures
  const candidates = enumerateCandidates(100);

  for (const candidate of candidates) {
    if (successfulPrograms.length >= maxResults) {
      break;
    }

    try {
      // Compile candidate to Expr
      const expr = compileCandidate(candidate as { structure: { kind: string; group: number }; pattern: string });

      // Test against all examples
      let allPassed = true;
      for (const { input, output } of examples) {
        const result = executeExpr(expr, input);
        if (result !== output) {
          allPassed = false;
          break;
        }
      }

      if (allPassed) {
        successfulPrograms.push(expr);
      }
    } catch {
      // Skip invalid candidates
    }
  }

  return successfulPrograms;
}

/**
 * Convert an expression AST to executable JavaScript code
 */
export function exprToCode(expr: Expr): string {
  switch (expr.type) {
    case "lit":
      return typeof expr.value === "string" ? JSON.stringify(expr.value) : String(expr.value);

    case "var":
      // Sanitize variable names to prevent code injection
      if (!/^[a-zA-Z_$][a-zA-Z0-9_$]*$/.test(expr.name)) {
        return "undefined";
      }
      return expr.name;

    case "add":
      return `(${exprToCode(expr.left)} + ${exprToCode(expr.right)})`;

    case "sub":
      return `(${exprToCode(expr.left)} - ${exprToCode(expr.right)})`;

    case "mul":
      return `(${exprToCode(expr.left)} * ${exprToCode(expr.right)})`;

    case "div":
      return `(${exprToCode(expr.left)} / ${exprToCode(expr.right)})`;

    case "concat":
      return `(String(${exprToCode(expr.left)}) + String(${exprToCode(expr.right)}))`;

    case "match": {
      const escapedPattern = expr.pattern.replace(/\//g, "\\/").replace(/\n/g, "\\n").replace(/\r/g, "\\r");
      return `((_s) => _s == null ? null : _s.match(/${escapedPattern}/)?.[${expr.group}])(${exprToCode(expr.str)})`;
    }

    case "replace": {
      const escapedReplacePattern = expr.pattern.replace(/\//g, "\\/").replace(/\n/g, "\\n").replace(/\r/g, "\\r");
      return `((_s) => _s == null ? null : _s.replace(/${escapedReplacePattern}/g, ${JSON.stringify(expr.replacement)}))(${exprToCode(expr.str)})`;
    }

    case "parseInt":
      return `((_v) => { const _r = parseInt(_v, 10); return isNaN(_r) ? null : _r; })(${exprToCode(expr.str)})`;

    case "parseFloat":
      return `((_v) => { const _r = parseFloat(_v); return isNaN(_r) ? null : _r; })(${exprToCode(expr.str)})`;

    case "if":
      return `(${exprToCode(expr.cond)} ? ${exprToCode(expr.then)} : ${exprToCode(expr.else)})`;

    default:
      return "/* unknown expr */";
  }
}

/**
 * Test a synthesized program against examples
 */
export function testProgram(expr: Expr, examples: Example[]): boolean {
  try {
    const code = exprToCode(expr);
    const fn = new Function("input", `return ${code}`);

    for (const { input, output } of examples) {
      const result = fn(input);
      if (result !== output) {
        return false;
      }
    }
    return true;
  } catch {
    return false;
  }
}
