/**
 * Constraint Verifier
 *
 * Verifies that results satisfy specified output constraints.
 * Part of the Barliman-style constraint-first synthesis approach.
 */

import type {
  OutputConstraint,
  SynthesisConstraint,
  VerificationResult,
} from "./types.js";
import { validateRegex } from "../logic/lc-solver.js";

/**
 * Verify that a result satisfies all constraints.
 *
 * @param result - The value to verify
 * @param constraint - The constraints to check against
 * @returns Verification result with validity and errors
 */
export function verifyResult(
  result: unknown,
  constraint: SynthesisConstraint
): VerificationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  // Handle undefined
  if (result === undefined) {
    errors.push("Result is undefined");
    return { valid: false, errors, warnings };
  }

  // Verify the output constraint
  verifyOutputConstraint(result, constraint.output, errors, "result");

  // Verify invariants
  if (constraint.invariants) {
    for (const invariant of constraint.invariants) {
      if (!verifyInvariant(result, invariant)) {
        errors.push(`Invariant failed: ${invariant}`);
      }
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings: warnings.length > 0 ? warnings : undefined,
  };
}

/**
 * Verify an output constraint recursively.
 */
const MAX_CONSTRAINT_DEPTH = 50;

function verifyOutputConstraint(
  value: unknown,
  constraint: OutputConstraint,
  errors: string[],
  path: string,
  depth: number = 0
): void {
  if (depth > MAX_CONSTRAINT_DEPTH) {
    errors.push(`${path}: constraint verification exceeded maximum depth (${MAX_CONSTRAINT_DEPTH})`);
    return;
  }
  // Type checking
  const actualType = getValueType(value);

  if (actualType !== constraint.type) {
    errors.push(`Expected type ${constraint.type}, got ${actualType}`);
    return; // No point checking further constraints if type is wrong
  }

  // Type-specific checks
  switch (constraint.type) {
    case "number":
      verifyNumberConstraint(value as number, constraint, errors, path);
      break;
    case "string":
      verifyStringConstraint(value as string, constraint, errors, path);
      break;
    case "array":
      verifyArrayConstraint(value as unknown[], constraint, errors, path, depth);
      break;
    case "object":
      verifyObjectConstraint(
        value as Record<string, unknown>,
        constraint,
        errors,
        path,
        depth
      );
      break;
  }
}

/**
 * Get the type of a value for constraint checking.
 */
function getValueType(
  value: unknown
): "number" | "string" | "boolean" | "array" | "object" | "null" | "undefined" | "function" | "bigint" | "symbol" {
  if (value === null) return "null";
  if (value === undefined) return "undefined";
  if (Array.isArray(value)) return "array";
  const t = typeof value;
  if (t === "number" || t === "string" || t === "boolean" || t === "function" || t === "bigint" || t === "symbol") return t;
  if (t === "object") return "object";
  return "undefined";
}

/**
 * Verify numeric constraints.
 */
function verifyNumberConstraint(
  value: number,
  constraint: OutputConstraint,
  errors: string[],
  path: string
): void {
  // Check for NaN
  if (Number.isNaN(value)) {
    errors.push(`${path} is NaN`);
    return;
  }

  // Check for Infinity
  if (!Number.isFinite(value)) {
    errors.push(`${path} is not finite (got ${value})`);
    return;
  }

  // Validate constraint bounds are finite
  if (constraint.min !== undefined && !Number.isFinite(constraint.min)) {
    errors.push(`${path} has invalid constraint: min is not finite`);
    return;
  }
  if (constraint.max !== undefined && !Number.isFinite(constraint.max)) {
    errors.push(`${path} has invalid constraint: max is not finite`);
    return;
  }

  // Validate min <= max
  if (constraint.min !== undefined && constraint.max !== undefined && constraint.min > constraint.max) {
    errors.push(`${path} has invalid constraint: min (${constraint.min}) > max (${constraint.max})`);
    return;
  }

  // Min constraint
  if (constraint.min !== undefined && value < constraint.min) {
    errors.push(
      `${path} value ${value} is below minimum ${constraint.min}`
    );
  }

  // Max constraint
  if (constraint.max !== undefined && value > constraint.max) {
    errors.push(
      `${path} value ${value} is above maximum ${constraint.max}`
    );
  }

  // Integer constraint
  if (constraint.integer && !Number.isInteger(value)) {
    errors.push(`${path} must be an integer, got ${value}`);
  }
}

/**
 * Verify string constraints.
 */
function verifyStringConstraint(
  value: string,
  constraint: OutputConstraint,
  errors: string[],
  path: string
): void {
  // Pattern constraint
  if (constraint.pattern !== undefined) {
    const validation = validateRegex(constraint.pattern);
    if (!validation.valid) {
      errors.push(`Invalid pattern: ${constraint.pattern}`);
    } else {
      try {
        const regex = new RegExp(constraint.pattern);
        if (!regex.test(value)) {
          errors.push(
            `${path} does not match pattern /${constraint.pattern}/`
          );
        }
      } catch {
        errors.push(`Invalid pattern: ${constraint.pattern}`);
      }
    }
  }

  // Validate minLength/maxLength are non-negative integers
  if (constraint.minLength !== undefined && (!Number.isInteger(constraint.minLength) || constraint.minLength < 0)) {
    errors.push(`${path} has invalid constraint: minLength must be a non-negative integer`);
    return;
  }
  if (constraint.maxLength !== undefined && (!Number.isInteger(constraint.maxLength) || constraint.maxLength < 0)) {
    errors.push(`${path} has invalid constraint: maxLength must be a non-negative integer`);
    return;
  }

  // Validate minLength <= maxLength
  if (constraint.minLength !== undefined && constraint.maxLength !== undefined && constraint.minLength > constraint.maxLength) {
    errors.push(`${path} has invalid constraint: minLength (${constraint.minLength}) > maxLength (${constraint.maxLength})`);
    return;
  }

  // MinLength constraint
  if (constraint.minLength !== undefined && value.length < constraint.minLength) {
    errors.push(
      `${path} length ${value.length} is below minimum length ${constraint.minLength}`
    );
  }

  // MaxLength constraint
  if (constraint.maxLength !== undefined && value.length > constraint.maxLength) {
    errors.push(
      `${path} length ${value.length} is above maximum length ${constraint.maxLength}`
    );
  }
}

/**
 * Verify array constraints.
 */
function verifyArrayConstraint(
  value: unknown[],
  constraint: OutputConstraint,
  errors: string[],
  path: string,
  depth: number = 0
): void {
  // Validate minItems/maxItems are non-negative integers
  if (constraint.minItems !== undefined && (!Number.isInteger(constraint.minItems) || constraint.minItems < 0)) {
    errors.push(`${path} has invalid constraint: minItems must be a non-negative integer`);
    return;
  }
  if (constraint.maxItems !== undefined && (!Number.isInteger(constraint.maxItems) || constraint.maxItems < 0)) {
    errors.push(`${path} has invalid constraint: maxItems must be a non-negative integer`);
    return;
  }

  // Validate minItems <= maxItems
  if (constraint.minItems !== undefined && constraint.maxItems !== undefined && constraint.minItems > constraint.maxItems) {
    errors.push(`${path} has invalid constraint: minItems (${constraint.minItems}) > maxItems (${constraint.maxItems})`);
    return;
  }

  // MinItems constraint
  if (constraint.minItems !== undefined && value.length < constraint.minItems) {
    errors.push(
      `${path} has ${value.length} items, minimum is ${constraint.minItems}`
    );
  }

  // MaxItems constraint
  if (constraint.maxItems !== undefined && value.length > constraint.maxItems) {
    errors.push(
      `${path} has ${value.length} items, maximum is ${constraint.maxItems}`
    );
  }

  // Items constraint — recursively verify each item (capped to prevent OOM)
  if (constraint.items) {
    const MAX_ITEMS_TO_VERIFY = 1000;
    const limit = Math.min(value.length, MAX_ITEMS_TO_VERIFY);
    for (let i = 0; i < limit; i++) {
      verifyOutputConstraint(
        value[i],
        constraint.items,
        errors,
        `${path}[${i}]`,
        depth + 1
      );
    }
    if (value.length > MAX_ITEMS_TO_VERIFY) {
      errors.push(`${path} has ${value.length} items, only first ${MAX_ITEMS_TO_VERIFY} verified`);
    }
  }
}

/**
 * Verify object constraints.
 */
const MAX_PROPERTIES = 1000;

function verifyObjectConstraint(
  value: Record<string, unknown>,
  constraint: OutputConstraint,
  errors: string[],
  path: string,
  depth: number = 0
): void {
  // Required properties
  if (constraint.required) {
    if (constraint.required.length > MAX_PROPERTIES) {
      errors.push(`${path} has too many required properties (${constraint.required.length}, max ${MAX_PROPERTIES})`);
      return;
    }
    for (const prop of constraint.required) {
      if (!Object.prototype.hasOwnProperty.call(value, prop)) {
        errors.push(`${path} is missing required property "${prop}"`);
      }
    }
  }

  // Property type constraints
  if (constraint.properties) {
    const entries = Object.entries(constraint.properties);
    if (entries.length > MAX_PROPERTIES) {
      errors.push(`${path} has too many property constraints (${entries.length}, max ${MAX_PROPERTIES})`);
      return;
    }
    for (const [prop, propConstraint] of entries) {
      if (Object.prototype.hasOwnProperty.call(value, prop)) {
        verifyOutputConstraint(
          value[prop],
          propConstraint,
          errors,
          `${path}.${prop}`,
          depth + 1
        );
      }
    }
  }
}

/**
 * Verify an invariant expression against a result.
 *
 * @param result - The value to check
 * @param invariant - Expression like "result > 0" or "result.length > 0"
 * @returns true if invariant holds, false otherwise
 */
export function verifyInvariant(result: unknown, invariant: string): boolean {
  if (typeof invariant !== "string" || !invariant.trim()) {
    return false;
  }
  const MAX_INVARIANT_LENGTH = 10_000;
  if (invariant.length > MAX_INVARIANT_LENGTH) {
    return false;
  }
  // Safety: only allow safe expressions
  if (!isSafeInvariant(invariant)) {
    return false;
  }

  try {
    // Create a sandboxed evaluation
    const fn = new Function("result", `"use strict"; return (${invariant});`);
    return Boolean(fn(result));
  } catch {
    return false;
  }
}

/**
 * Check if an invariant expression is safe to evaluate.
 *
 * Only allows basic comparisons and property access.
 */
function isSafeInvariant(expr: string): boolean {
  // Normalize Unicode to NFKC to prevent confusable bypasses (e.g. fullwidth chars)
  expr = expr.normalize("NFKC");

  // Disallow dangerous patterns
  const dangerous = [
    /\bprocess\b/,
    /\brequire\b/,
    /\bimport\b/,
    /\beval\b/,
    /\bFunction\b/,
    /\bsetTimeout\b/,
    /\bsetInterval\b/,
    /\bfetch\b/,
    /\bXMLHttpRequest\b/,
    /\b__proto__\b/,
    /\bconstructor\b/,
    /\bprototype\b/,
    /\bglobalThis\b/,
    /\bProxy\b/,
    /\bReflect\b/,
    /\bWeakRef\b/,
    /\bFinalizationRegistry\b/,
    /\bthis\b/,
    /\bglobal\b/,
    /\bwindow\b/,
    /\bself\b/,
    /\bvalueOf\b/,
    /\btoString\b/,
    /\bhasOwnProperty\b/,
    /\bAtomics\b/,
    /\bSharedArrayBuffer\b/,
    /\bWebAssembly\b/,
    /\bBuffer\b/,
  ];

  for (const pattern of dangerous) {
    if (pattern.test(expr)) {
      return false;
    }
  }

  // Reject function calls — word character followed by '(' indicates invocation
  // Allow grouping parentheses for expressions like (a > 0 && a < 10)
  if (/\w\s*\(/.test(expr)) {
    return false;
  }

  // Ensure balanced parentheses
  let parenDepth = 0;
  for (const ch of expr) {
    if (ch === "(") parenDepth++;
    else if (ch === ")") parenDepth--;
    if (parenDepth < 0) return false;
  }
  if (parenDepth !== 0) return false;

  // Reject all bracket notation access (prevents bypassing keyword blocklist)
  if (/\[/.test(expr)) {
    return false;
  }

  // Reject unicode and hex escape sequences that could bypass keyword checks
  if (/\\u[\da-fA-F]{4}|\\u\{[\da-fA-F]+\}|\\x[\da-fA-F]{2}|\\[0-7]{1,3}/.test(expr)) {
    return false;
  }

  // Only allow: result, numbers, strings, comparisons, typeof, length, basic operators, dot property access, grouping parens
  // Reject quotes to prevent string concatenation bypass of keyword blocklist
  const safePattern =
    /^[\s\w.<>=!+\-*/%&|?:()]+$/;

  if (!safePattern.test(expr)) return false;

  // Reject assignment operators (= not preceded by !, <, >, or another =)
  if (/(?<![!=<>])=(?!=)/.test(expr)) return false;

  return true;
}
