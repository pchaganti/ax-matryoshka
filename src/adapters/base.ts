/**
 * Base Model Adapter
 *
 * Default adapter implementation that works with most models.
 * Other adapters can spread this and override specific methods.
 */

import type { ModelAdapter, FinalVarMarker, RAGHints } from "./types.js";

/**
 * Build the default system prompt for the RLM
 */
function buildSystemPrompt(
  contextLength: number,
  toolInterfaces: string,
  hints?: RAGHints
): string {
  const formattedLength = contextLength.toLocaleString();

  return `You are a headless JavaScript runtime. You have NO EYES. You cannot read the document directly.
The document is loaded in the global variable \`context\` (length: ${formattedLength}).

To "see" the data, you MUST write JavaScript code, execute it, and read the \`console.log\` output in the next turn.

## GLOBAL CONSTANTS & TOOLS
// All tools are pre-loaded. DO NOT use 'import' or 'require'.
${toolInterfaces}

## STRICT EXECUTION RULES
1. **NO CHAT.** do not write any text outside of code blocks.
2. **NO GUESSING.** If you answer without seeing a \`console.log\` proving it, you will be terminated.
3. **NO IMPORTS.** Standard JS objects (Math, JSON, RegExp) are available. File system (fs) is BANNED.
4. **MEMORY.** Use the global \`memory\` array to store findings between turns.
   Example: \`memory.push({ key: "sales_Q1", value: 500 })\`

## HOW TO THINK
Because you cannot chat, write your plan in comments inside the code block.
Example:
\`\`\`javascript
// Step 1: Search for data
const hits = grep("keyword");  // Returns array of {match, line, lineNum}
console.log(JSON.stringify(hits, null, 2));

// Step 2: Process results - use hit.line to get full line content
for (const hit of hits) {
    console.log(hit.line);  // hit.line is the full text of the matching line
}
\`\`\`

## CRITICAL RULES
- **ALWAYS use JSON.stringify()** when logging objects or arrays. Plain console.log shows [object Object].
- **NEVER make up data.** If a search returns empty, try different terms or use locate_line() to scan sections.
- **Use the actual document.** The data is in \`context\`. Do not invent fake examples.
- **fuzzy_search takes ONE word only.** For "sales|revenue" use grep() instead, or call fuzzy_search("sales") then fuzzy_search("revenue") separately.

## FORMAT & TERMINATION
You must output exactly ONE JavaScript code block.

When you have PROVEN the answer via code execution, write your answer between the FINAL tags:
\`\`\`javascript
console.log("done");
\`\`\`
<<<FINAL>>>
Write your actual computed answer here with specific numbers from your code output.
<<<END>>>

OR, to return the raw data structure you built:
FINAL_VAR(memory)

${hints?.hintsText || ""}${hints?.selfCorrectionText || ""}
## BEGIN SESSION
Goal: Extract the requested information from \`context\`.
Reminder: You are blind. Write code to see.`;
}

/**
 * Extract code from LLM response
 */
function extractCode(response: string): string | null {
  // Match typescript, ts, javascript, or js code blocks
  // Use indexOf-based approach to avoid ReDoS with [\s\S]*? on unclosed fences
  const openPattern = /```(?:typescript|ts|javascript|js)\n/;
  const openMatch = response.match(openPattern);
  if (!openMatch || openMatch.index === undefined) return null;

  const codeStart = openMatch.index + openMatch[0].length;
  const closeIdx = response.indexOf("```", codeStart);
  if (closeIdx === -1) return null;

  const code = response.slice(codeStart, closeIdx).trim();
  return code || null;
}

/**
 * Extract final answer from LLM response
 */
function extractFinalAnswer(
  response: string | undefined | null
): string | FinalVarMarker | null {
  if (!response) {
    return null;
  }

  // Check for FINAL_VAR(variableName)
  const DANGEROUS_VAR_NAMES = /^(__proto__|constructor|prototype|__defineGetter__|__defineSetter__|__lookupGetter__|__lookupSetter__)$/i;
  const varMatch = response.match(/FINAL_VAR\((\w+)\)/);
  if (varMatch && !DANGEROUS_VAR_NAMES.test(varMatch[1])) {
    return { type: "var", name: varMatch[1] };
  }

  // Check for <<<FINAL>>>...<<<END>>> delimiters
  const finalMatch = response.match(/<<<FINAL>>>([\s\S]*?)<<<END>>>/);
  if (finalMatch) {
    return finalMatch[1].trim();
  }

  // Check for JSON code block with common answer fields (model trying to provide final answer)
  const jsonMatch = response.match(/```json\s*([\s\S]*?)```/);
  if (jsonMatch) {
    try {
      const parsed = JSON.parse(jsonMatch[1]);
      // Check for common answer field names (must be strings)
      if (typeof parsed.summary === "string") return parsed.summary;
      if (typeof parsed.response === "string") return parsed.response;
      if (typeof parsed.answer === "string") return parsed.answer;
      // Check for any field that looks like a final value (case-insensitive)
      const valueFields = ['total', 'result', 'value', 'totalsales', 'total_sales', 'count', 'sum', 'answer', 'totals'];
      const keys = Object.keys(parsed);
      const foundKey = keys.find(k => valueFields.includes(k.toLowerCase().replace(/_/g, '')));

      if (foundKey !== undefined) {
        const value = parsed[foundKey];
        if (parsed.notes) {
          return `${parsed.notes}\n\nResult: ${typeof value === 'number' ? value.toLocaleString() : value}`;
        }
        return JSON.stringify(parsed, null, 2);
      }
    } catch {
      // Not valid JSON, ignore
    }
  }

  return null;
}

/**
 * Get feedback message when model provides no code block
 */
function getNoCodeFeedback(): string {
  return `No code block found. You MUST write JavaScript code:
\`\`\`javascript
const hits = grep("keyword");
console.log(JSON.stringify(hits, null, 2));
\`\`\``;
}

/**
 * Get feedback message when code execution fails
 */
function getErrorFeedback(error: string, code?: string): string {
  let feedback = `The previous code had an error: ${error}\nFix the code and try again.`;
  if (code) {
    feedback += `\nCode that failed: ${code.slice(0, 200)}`;
  }
  return feedback;
}

/**
 * Get feedback message after successful code execution
 * Generic reminder about continuing exploration or providing final answer
 */
function getSuccessFeedback(resultCount?: number, previousCount?: number, query?: string): string {
  if (resultCount === 0) {
    return `No results found. Try different search terms or approach.`;
  }
  if (resultCount !== undefined && resultCount > 0) {
    return `Found ${resultCount} results. Continue exploring, OR output final answer using <<<FINAL>>> and <<<END>>> tags.`;
  }
  return `Variables persist between turns. Continue exploring, OR output final answer using <<<FINAL>>> and <<<END>>> tags.`;
}

/**
 * Get feedback message when model repeats the same code
 * Encourages a different approach
 */
function getRepeatedCodeFeedback(resultCount?: number): string {
  return `ERROR: You are repeating the same code. This will give the same output.${resultCount !== undefined ? ` (${resultCount} results already available)` : ""}

Try a DIFFERENT approach:
- Use different search terms with grep()
- Process data differently
- Look at different sections of the document

Write NEW code now.`;
}

/**
 * Create the base adapter instance
 */
export function createBaseAdapter(): ModelAdapter {
  return {
    name: "base",
    buildSystemPrompt,
    extractCode,
    extractFinalAnswer,
    getNoCodeFeedback,
    getErrorFeedback,
    getSuccessFeedback,
    getRepeatedCodeFeedback,
  };
}

// Export individual functions for use by other adapters that want to extend
export {
  buildSystemPrompt as baseBuildSystemPrompt,
  extractCode as baseExtractCode,
  extractFinalAnswer as baseExtractFinalAnswer,
  getNoCodeFeedback as baseGetNoCodeFeedback,
  getErrorFeedback as baseGetErrorFeedback,
  getSuccessFeedback as baseGetSuccessFeedback,
  getRepeatedCodeFeedback as baseGetRepeatedCodeFeedback,
};
