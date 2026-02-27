/**
 * Nucleus Adapter
 *
 * Prompts the LLM to output Lambda Calculus terms instead of JavaScript.
 * This reduces token entropy and allows formal verification before execution.
 *
 * The LLM outputs S-expressions that map to the evalo DSL:
 * - (grep "pattern") - search document
 * - (classify "line1" true "line2" false) - build classifier
 * - (match input "pattern" 0) - regex match
 * - (parseInt (match input "\\d+" 0)) - parse number
 */

import type { ModelAdapter, FinalVarMarker, RAGHints } from "./types.js";

/**
 * Build the system prompt for Nucleus LC output
 */
function buildSystemPrompt(
  contextLength: number,
  toolInterfaces: string,
  hints?: RAGHints
): string {
  // Determine document size category
  const sizeCategory = contextLength < 2000 ? "SMALL" : "LARGE";

  return `You analyze documents to answer queries. Output ONE command per turn.

COMMANDS:
(grep "pattern")                                    - search document, returns matching lines with line numbers
(lines START END)                                   - get lines START to END (for multi-line content like JSON/code blocks)
(filter RESULTS (lambda x (match x "pattern" 0)))   - filter results
(map RESULTS (lambda x (match x "pattern" 1)))      - extract field from each result
(sum RESULTS)                                       - sum numbers (for "total", "sum")
(count RESULTS)                                     - count items (for "how many")

WORKFLOW for multi-line content (JSON, code blocks, configs):
1. (grep "keyword") to find the line number where the content starts
2. (lines START END) to get the full block - use line numbers from grep results

QUERY TYPES - match your response to the query:
- "find/print/show config/example/JSON" -> use grep to find line, then (lines N M) for full block
- "list/show/what are" -> return the actual items: <<<FINAL>>>item1, item2...<<<END>>>
- "how many/count" -> use (count RESULTS)
- "total/sum" -> use (sum RESULTS)

Output final answer as: <<<FINAL>>>answer<<<END>>>

${hints?.hintsText || ""}${hints?.selfCorrectionText || ""}`;
}

/**
 * Try to convert JSON to S-expression
 * Handles common cases when model outputs JSON instead of S-expressions
 */
/** Validate collection name is a safe S-expression identifier (RESULTS, _N, etc.) */
function validateCollectionName(name: unknown): string | null {
  if (typeof name !== "string") return null;
  // Only allow known safe identifiers: RESULTS, _1, _2, ..., or simple alphanumeric names
  if (/^(RESULTS|_\d+|[A-Za-z]\w*)$/.test(name)) return name;
  return null;
}

/** Escape a string for embedding in an S-expression string literal */
function escapeForSexp(s: string): string {
  return s.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

function jsonToSexp(json: unknown): string | null {
  if (typeof json !== "object" || json === null) return null;

  const obj = json as Record<string, unknown>;

  // Handle {"action": "grep", "pattern": "..."} or {"operation": "grep", ...}
  const action = obj.action || obj.operation || obj.type;
  if (typeof action !== "string") return null;

  switch (action.toLowerCase()) {
    case "grep":
    case "search": {
      const pattern = obj.pattern || obj.query || obj.term;
      if (typeof pattern === "string") {
        return `(grep "${escapeForSexp(pattern)}")`;
      }
      break;
    }

    case "filter": {
      const rawCollection = obj.collection || obj.input || "RESULTS";
      const collection = validateCollectionName(rawCollection);
      const pattern = obj.pattern || obj.predicate || obj.match;
      if (collection && typeof pattern === "string") {
        return `(filter ${collection} (lambda x (match x "${escapeForSexp(pattern)}" 0)))`;
      }
      break;
    }

    case "map":
    case "extract": {
      const rawCollection = obj.collection || obj.input || "RESULTS";
      const collection = validateCollectionName(rawCollection);
      const pattern = obj.pattern || obj.regex;
      const group = typeof obj.group === "number" && obj.group >= 0 ? obj.group : 0;
      if (collection && typeof pattern === "string") {
        return `(map ${collection} (lambda x (match x "${escapeForSexp(pattern)}" ${group})))`;
      }
      break;
    }

    case "fuzzy":
    case "fuzzy_search": {
      const query = obj.query || obj.term;
      const limit = typeof obj.limit === "number" ? obj.limit : 10;
      if (typeof query === "string") {
        return `(fuzzy_search "${escapeForSexp(query)}" ${limit})`;
      }
      break;
    }
  }

  return null;
}

/**
 * Extract LC term from model response
 * Looks for S-expressions starting with ( or constrained terms starting with [
 * Falls back to JSON conversion if no S-expression found
 */
function extractCode(response: string): string | null {
  // Also check for code blocks first (multi-line S-expressions)
  const codeBlockMatch = response.match(/```(?:lisp|scheme|sexp)?\n?([\s\S]*?)```/);
  if (codeBlockMatch) {
    const code = codeBlockMatch[1].trim();
    if (code.startsWith("(") || code.startsWith("[")) {
      return code;
    }
  }

  // Check for constrained term [Constraint] ⊗ (...) BEFORE checking plain parens
  // This ensures we get the full constrained expression
  const firstBracket = response.indexOf("[");
  const firstParen = response.indexOf("(");

  // If bracket comes before paren (or no paren), check for constrained term
  if (firstBracket >= 0 && (firstParen < 0 || firstBracket < firstParen)) {
    // Look for the pattern [Constraint] ⊗ followed by S-expression
    const tensorIdx = response.indexOf("⊗", firstBracket);
    if (tensorIdx > firstBracket) {
      // Find the S-expression after the tensor
      const parenAfterTensor = response.indexOf("(", tensorIdx);
      if (parenAfterTensor > tensorIdx) {
        // Balance parens to find the end
        let depth = 0;
        let end = -1;
        for (let i = parenAfterTensor; i < response.length; i++) {
          if (response[i] === "(") depth++;
          if (response[i] === ")") depth--;
          if (depth === 0) {
            end = i + 1;
            break;
          }
        }
        if (end > parenAfterTensor) {
          return response.slice(firstBracket, end);
        }
      }
    }
  }

  // Check for plain S-expression in raw text
  // Find opening paren and balance to closing
  const KNOWN_COMMANDS = ["grep", "filter", "map", "reduce", "count", "sum", "lines", "fuzzy_search", "text_stats", "match", "replace", "split", "parseInt", "parseFloat", "parseDate", "parseCurrency", "parseNumber", "coerce", "extract", "synthesize", "lambda", "if", "classify", "predicate", "define-fn", "apply-fn", "list_symbols", "get_symbol_body", "find_references"];

  let searchFrom = firstParen;
  while (searchFrom >= 0 && searchFrom < response.length) {
    const parenIdx = response.indexOf("(", searchFrom);
    if (parenIdx < 0) break;

    let depth = 0;
    let end = -1;
    for (let i = parenIdx; i < response.length; i++) {
      if (response[i] === "(") depth++;
      if (response[i] === ")") depth--;
      if (depth === 0) {
        end = i + 1;
        break;
      }
    }
    if (end > parenIdx) {
      const expr = response.slice(parenIdx, end);
      // Check the expression starts with a known command
      const exprContent = expr.slice(1).trim(); // remove leading (
      const firstWord = exprContent.match(/^(\S+)/)?.[1];
      if (firstWord && KNOWN_COMMANDS.includes(firstWord)) {
        return expr;
      }
      // Not a valid S-expression command, skip and look for next one
      searchFrom = end;
    } else {
      break;
    }
  }

  // FALLBACK: Try to extract and convert JSON to S-expression
  // This handles when model outputs JSON despite being told not to
  const jsonCodeBlock = response.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (jsonCodeBlock) {
    try {
      const parsed = JSON.parse(jsonCodeBlock[1].trim());
      const converted = jsonToSexp(parsed);
      if (converted) {
        return converted;
      }
    } catch {
      // Not valid JSON
    }
  }

  // Try to find inline JSON object using balanced brace extraction
  const extractJson = (text: string): string | null => {
    const start = text.indexOf("{");
    if (start === -1) return null;
    let depth = 0;
    let inString = false;
    let escape = false;
    for (let i = start; i < text.length; i++) {
      const ch = text[i];
      if (escape) { escape = false; continue; }
      if (ch === "\\") { escape = true; continue; }
      if (ch === '"') { inString = !inString; continue; }
      if (inString) continue;
      if (ch === "{") depth++;
      else if (ch === "}") {
        depth--;
        if (depth === 0) return text.slice(start, i + 1);
      }
    }
    return null;
  };
  const inlineJson = extractJson(response);
  if (inlineJson) {
    try {
      const parsed = JSON.parse(inlineJson);
      const converted = jsonToSexp(parsed);
      if (converted) {
        return converted;
      }
    } catch {
      // Not valid JSON
    }
  }

  // FALLBACK: Auto-wrap common commands without parentheses
  // E.g., "sum RESULTS" -> "(sum RESULTS)"
  const noParenCommand = response.match(/\b(sum|count|grep|filter|map)\s+(RESULTS|_\d+|"[^"]+")/i);
  if (noParenCommand) {
    const cmd = noParenCommand[1].toLowerCase();
    const arg = noParenCommand[2];
    return `(${cmd} ${arg})`;
  }

  return null;
}

/**
 * Extract final answer from response
 */
function extractFinalAnswer(
  response: string | undefined | null
): string | FinalVarMarker | null {
  if (!response) return null;

  // Look for FINAL markers with various bracket styles (<<<, >>>, or mixed)
  // Models often get the brackets wrong
  const finalMatch = response.match(/(?:<<<|>>>)FINAL(?:<<<|>>>)([\s\S]*?)(?:<<<|>>>)END(?:<<<|>>>)/);
  if (finalMatch) {
    return finalMatch[1].trim();
  }

  // Look for <<<FINAL>>> inside code block without <<<END>>> (common model error)
  // Match: ```anything\n<<<FINAL>>>\ncontent\n```
  const codeBlockFinal = response.match(/```[^\n]*\n<<<FINAL>>>\n([\s\S]*?)```/);
  if (codeBlockFinal) {
    return codeBlockFinal[1].trim();
  }

  // Look for <<<FINAL>>> at end of response without <<<END>>> (model forgot to close)
  const openFinal = response.match(/<<<FINAL>>>\n([\s\S]+?)(?:$|```)/);
  if (openFinal) {
    const content = openFinal[1].trim();
    // Make sure it's not just code
    if (!content.match(/^\s*\(/)) {
      return content;
    }
  }

  // Also check for FINAL_VAR pattern
  const varMatch = response.match(/FINAL_VAR\((\w+)\)/);
  if (varMatch) {
    return { type: "var", name: varMatch[1] };
  }

  return null;
}

/**
 * Feedback when no LC term found
 */
function getNoCodeFeedback(): string {
  return `Parse error: no valid command. Extract a keyword from the query and search:

(grep "KEYWORD")   <- extract keyword from query, e.g., "SALES", "ERROR", "stage"

Then based on query type:
- "list/show/what": output items directly <<<FINAL>>>item1, item2<<<END>>>
- "how many/count": (count RESULTS)
- "total/sum": (sum RESULTS)

Next:`;
}

/**
 * Feedback when LC parsing fails
 */
function getErrorFeedback(error: string, code?: string): string {
  // Check for Python-style lambda (common mistake)
  if (code && code.includes("lambda") && code.includes(":")) {
    return `Wrong syntax. Use: (filter RESULTS (lambda x (match x "word" 0)))`;
  }

  return `Syntax error. Use:
(grep "word")
(filter RESULTS (lambda x (match x "word" 0)))
(sum RESULTS)`;
}

/**
 * Feedback after successful execution
 * @param resultCount - Number of results from execution
 * @param previousCount - Number of results before this operation
 * @param query - The original query for context
 */
function getSuccessFeedback(resultCount?: number, previousCount?: number, query?: string): string {
  if (resultCount === 0 && previousCount && previousCount > 0) {
    return `Filter matched nothing. Try different pattern.

Next:`;
  }

  if (resultCount === 0) {
    return `No matches. Try different search terms.

Next:`;
  }

  if (resultCount && resultCount > 0) {
    return `Found ${resultCount} matches.

Check: Do these results answer "${query || 'the query'}"?
- For "list/show/what": output the items directly <<<FINAL>>>item1, item2...<<<END>>>
- For "how many/count": (count RESULTS)
- For "total/sum": (sum RESULTS)
- If too broad: (filter RESULTS (lambda x (match x "specific_term" 0)))

Next:`;
  }

  return `Done. Output your answer.

Next:`;
}

/**
 * Feedback when model repeats the same term
 */
function getRepeatedCodeFeedback(resultCount?: number): string {
  if (resultCount === 0) {
    return `Already tried. Use different keyword.

Next:`;
  }

  return `Already done. RESULTS has ${resultCount ?? "your"} data.

Output: (sum RESULTS) or <<<FINAL>>>answer<<<END>>>

Next:`;
}

/**
 * Create the Nucleus adapter
 */
export function createNucleusAdapter(): ModelAdapter {
  return {
    name: "nucleus",
    buildSystemPrompt,
    extractCode,
    extractFinalAnswer,
    getNoCodeFeedback,
    getErrorFeedback,
    getSuccessFeedback,
    getRepeatedCodeFeedback,
  };
}
