/**
 * PredicateCompiler - Safely compile JS predicates to functions
 *
 * Converts predicate strings like "item.type === 'error'" into executable functions.
 * Also provides optional SQL conversion for database-level filtering.
 */

// Blacklist of dangerous operations
const DANGEROUS_PATTERNS = [
  /\bprocess\b/,
  /\brequire\b/,
  /\bimport\b/,
  /\beval\b/,
  /\bFunction\b/,
  /\bglobal\b/,
  /\bglobalThis\b/,
  /\bwindow\b/,
  /\bdocument\b/,
  /\bfetch\b/,
  /\bXMLHttpRequest\b/,
  /\bsetTimeout\b/,
  /\bsetInterval\b/,
  /\b__proto__\b/,
  /\bconstructor\b/,
  /\bprototype\b/,
  /\bthis\b/,
  /\bReflect\b/,
  /\bProxy\b/,
  /\bSymbol\b/,
  /\bAtomics\b/,
  /\bSharedArrayBuffer\b/,
  /\bWebAssembly\b/,
  /\bBuffer\b/,
];

export type PredicateFn = (item: unknown) => boolean;
export type TransformFn = (item: unknown) => unknown;

export class PredicateCompiler {
  /**
   * Compile a predicate string to a function
   */
  compile(predicate: string): PredicateFn {
    const fn = this.validateAndCompile(predicate);

    return (item: unknown) => {
      try {
        return Boolean(fn(item));
      } catch {
        return false;
      }
    };
  }

  /**
   * Compile a transform expression to a function
   */
  compileTransform(expression: string): TransformFn {
    const fn = this.validateAndCompile(expression);

    return (item: unknown) => {
      try {
        return fn(item);
      } catch {
        return null;
      }
    };
  }

  /**
   * Validate and compile a predicate/expression in a single step
   */
  private validateAndCompile(code: string): Function {
    if (!code || !code.trim()) {
      throw new Error("Empty predicate");
    }

    // Check for dangerous patterns
    for (const pattern of DANGEROUS_PATTERNS) {
      if (pattern.test(code)) {
        throw new Error(`Dangerous operation detected: ${pattern}`);
      }
    }

    // Block semicolons (prevents statement injection via ); ... ;()
    if (/;/.test(code)) {
      throw new Error("Semicolons are not allowed in predicates");
    }

    // Block template literals (prevent blocklist bypass)
    if (/`/.test(code)) {
      throw new Error("Template literals are not allowed in predicates");
    }

    // Block string concatenation patterns that could bypass the blocklist
    // e.g., 'con' + 'structor' or "con" + "structor"
    if (/['"][^'"]*['"]\s*\+\s*['"]/.test(code)) {
      throw new Error("String concatenation is not allowed in predicates");
    }

    // Block string reconstruction methods that could bypass the blocklist
    // e.g., ['con','structor'].join(''), 'con'.concat('structor'), String.fromCharCode(99,111,110)
    if (/\.join\s*\(/.test(code) || /\.concat\s*\(/.test(code) || /fromCharCode/.test(code)) {
      throw new Error("String reconstruction methods are not allowed in predicates");
    }

    // Block bracket notation with strings (prevents dynamic property access)
    if (/\[\s*['"]/.test(code)) {
      throw new Error("Bracket notation with strings is not allowed in predicates");
    }

    // Block arrow functions (prevents IIFE execution: (()=>code)())
    // Use negative lookbehind to avoid matching >= and <=
    if (/(?<![><!])=>/.test(code)) {
      throw new Error("Arrow functions are not allowed in predicates");
    }

    try {
      // eslint-disable-next-line @typescript-eslint/no-implied-eval
      return new Function("item", `"use strict"; return (${code});`);
    } catch (e) {
      throw new Error(`Invalid predicate syntax: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  /**
   * Validate a field name is a safe SQL identifier
   */
  private isValidFieldName(field: string): boolean {
    return /^[a-zA-Z_][a-zA-Z0-9_]*$/.test(field);
  }

  /**
   * Convert simple predicates to SQL WHERE conditions with parameterized queries.
   * Returns null if conversion is not possible.
   */
  toSQLCondition(predicate: string): { sql: string; params: unknown[] } | null {
    // Simple equality: item.field === 'value' or item.field === "value"
    const eqMatch = predicate.match(/^item\.(\w+)\s*===?\s*(['"])([^'"]*)\2\s*$/);
    if (eqMatch) {
      const field = eqMatch[1];
      const value = eqMatch[3];
      if (!this.isValidFieldName(field)) return null;
      return { sql: `json_extract(data, '$.${field}') = ?`, params: [value] };
    }

    // Also match double-quoted values containing single quotes: item.field === "O'Reilly"
    const eqMatchDQ = predicate.match(/^item\.(\w+)\s*===?\s*"([^"]*)"\s*$/);
    if (eqMatchDQ) {
      const [, field, value] = eqMatchDQ;
      if (!this.isValidFieldName(field)) return null;
      return { sql: `json_extract(data, '$.${field}') = ?`, params: [value] };
    }

    // String includes: item.field.includes('value')
    const includesMatch = predicate.match(/^item\.(\w+)\.includes\s*\(\s*['"]([^'"]+)['"]\s*\)$/);
    if (includesMatch) {
      const [, field, value] = includesMatch;
      if (!this.isValidFieldName(field)) return null;
      // Escape SQL LIKE wildcards in the value to match literally
      const escapedValue = value.replace(/%/g, "\\%").replace(/_/g, "\\_");
      return { sql: `json_extract(data, '$.${field}') LIKE ? ESCAPE '\\'`, params: [`%${escapedValue}%`] };
    }

    // Numeric comparison: item.field > 100
    const numMatch = predicate.match(/^item\.(\w+)\s*([<>]=?|===?|!==?)\s*(-?\d+(?:\.\d+)?)$/);
    if (numMatch) {
      const [, field, op, value] = numMatch;
      if (!this.isValidFieldName(field)) return null;
      const sqlOp = op === "===" || op === "==" ? "=" : op === "!==" || op === "!=" ? "!=" : op;
      return { sql: `CAST(json_extract(data, '$.${field}') AS REAL) ${sqlOp} ?`, params: [Number(value)] };
    }

    // Can't convert - use JS evaluation
    return null;
  }
}
