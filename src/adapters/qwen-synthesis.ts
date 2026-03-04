/**
 * Qwen Synthesis Adapter
 *
 * Extends the Qwen adapter with synthesis tool guidance.
 * Encourages the model to use automatic synthesis instead of
 * writing regex patterns manually.
 */

import type { ModelAdapter, FinalVarMarker, RAGHints } from "./types.js";
import { createQwenAdapter } from "./qwen.js";
import { analyzeError, formatErrorFeedback } from "../feedback/error-analyzer.js";

/**
 * Build system prompt with synthesis instructions
 */
function buildSystemPrompt(
  contextLength: number,
  toolInterfaces: string,
  hints?: RAGHints
): string {
  if (!Number.isFinite(contextLength) || contextLength < 0) contextLength = 0;
  const formattedLength = contextLength.toLocaleString();

  return `You are a JavaScript code executor. You ONLY output JavaScript code. NO CHAT. NO PYTHON.

⚠️ CRITICAL: JavaScript ONLY! ⚠️
- Output \`\`\`javascript blocks ONLY
- NEVER output Python (no \`\`\`python, no def, no f-strings, no list comprehensions)
- This is a JavaScript sandbox - Python will NOT execute

A document is loaded in \`context\` (${formattedLength} chars). You cannot read it directly.

## TOOLS (pre-loaded JavaScript functions, no imports needed)
${toolInterfaces}

## SYNTHESIS TOOLS - USE THESE INSTEAD OF WRITING REGEX MANUALLY!

You have access to **automatic synthesis** tools. These generate CORRECT patterns from examples.
**DO NOT write regex patterns manually!** Use the synthesizer - it's more accurate and reliable.

### synthesize_regex(positive, negative?)
Generates a regex pattern from example strings.
- \`positive\`: Array of strings that SHOULD match
- \`negative\`: (optional) Array of strings that should NOT match
- Returns: regex pattern string or null

### synthesize_extractor(examples)
Generates an extractor function from input/output pairs.
- \`examples\`: Array of \`{ input: string, output: value }\` pairs
- Returns: extractor function or null

### test_regex(pattern, str)
Tests a regex pattern against a string.
- Returns: true if matches

### extract_with_regex(pattern, str)
Extracts value using regex pattern (first capture group or full match).
- Returns: extracted string or null

## PROBLEM-SOLVING APPROACH (Step-by-Step)

**Step 1 - SEARCH first using grep():**
\`\`\`javascript
// Search for keywords related to what you need
const hits = grep("sales|revenue|total");
console.log(JSON.stringify(hits.slice(0, 5), null, 2));
\`\`\`

**Step 2 - SYNTHESIZE patterns from examples (DO NOT write regex manually!):**
\`\`\`javascript
// Collect example values from the hits
const examples = hits.map(h => h.line).filter(l => l.includes("$")).slice(0, 5);
console.log("Examples:", examples);

// Ask the synthesizer to create a regex - much better than writing your own!
const regex = synthesize_regex(examples, ["Total:", "HEADER"]);
console.log("Synthesized regex:", regex);
\`\`\`

**Step 3 - USE synthesized patterns to extract data:**
\`\`\`javascript
let total = 0;
for (const hit of hits) {
  // Use extract_with_regex instead of manual .match()
  const value = extract_with_regex(regex, hit.line);
  if (value) {
    const num = parseFloat(value.replace(/[$,]/g, ''));
    total += num;
    console.log(hit.line, "->", num);
  }
}
console.log("Total:", total);
\`\`\`

### Alternative: synthesize_extractor for direct conversion
\`\`\`javascript
// If you know input->output pairs, synthesize an extractor directly
const extractor = synthesize_extractor([
  { input: "$1,000", output: 1000 },
  { input: "$2,500", output: 2500 }
]);

// Then use it
const value = extractor("$5,000");  // Returns 5000
console.log(value);
\`\`\`

## FINAL ANSWER
When you have the answer:
\`\`\`javascript
console.log("done");
\`\`\`
<<<FINAL>>>
Your answer here.
<<<END>>>

## CRITICAL RULES
1. **JAVASCRIPT ONLY** - Never output Python. No \`\`\`python, no def, no f-strings.
2. Use \`\`\`javascript code blocks exclusively.
3. **DO NOT write regex patterns manually!** Use synthesize_regex() or synthesize_extractor().
4. ALWAYS use grep() first to find relevant data.
5. grep() returns objects: use hit.line to get the text string.
6. Use JSON.stringify() when logging objects/arrays.
7. Each turn: run NEW code based on previous output. NEVER repeat the same code.
8. Parse numbers: remove $ and commas before parseFloat().

${hints?.hintsText || ""}${hints?.selfCorrectionText || ""}
## BEGIN
Output ONLY JavaScript. Use grep() first, then synthesize patterns.`;
}

/**
 * Error feedback with synthesis suggestions and Levenshtein-based hints
 */
function getErrorFeedback(error: string, code?: string): string {
  // Use the error analyzer for intelligent feedback
  const analysis = analyzeError(error, code);
  const feedback = formatErrorFeedback(analysis);

  // Add specific code examples based on error type
  let codeExample = "";

  switch (analysis.errorType) {
    case "invalid_regex_flags":
      codeExample = `
**CORRECT USAGE:**
\`\`\`javascript
// Search for a pattern (single argument)
const hits = grep("SALES_DATA");

// Search with OR pattern (use | inside the pattern)
const hits = grep("sales|revenue|total");

// Case-insensitive search (second arg is flags only: g, i, m, s, u, y)
const hits = grep("pattern", "gi");
\`\`\``;
      break;

    case "undefined_variable":
      codeExample = `
**FIX:** Define variables in the same code block:
\`\`\`javascript
// Step 1: Search and store results
const hits = grep("SALES_DATA");
console.log("Found", hits.length, "results");

// Step 2: Process in the SAME block
for (const hit of hits) {
  console.log(hit.line);
}
\`\`\``;
      break;

    case "property_of_undefined":
      codeExample = `
**FIX:** Check variables exist before using:
\`\`\`javascript
const hits = grep("pattern");
if (hits && hits.length > 0) {
  const examples = hits.slice(0, 5).map(h => h.line);
  console.log(examples);
} else {
  console.log("No results found, trying different pattern...");
  const hits2 = grep("alternative_pattern");
}
\`\`\``;
      break;

    case "not_a_function":
      codeExample = `
**AVAILABLE FUNCTIONS:**
\`\`\`javascript
// Search
const hits = grep("pattern");

// Synthesis (auto-generate patterns from examples!)
const extractor = synthesize_extractor([
  { input: "$1,000", output: 1000 },
  { input: "$2,500", output: 2500 },
]);
const value = extractor("$5,000"); // Returns 5000

// Regex synthesis
const regex = synthesize_regex(["$100", "$200"]);
const extracted = extract_with_regex(regex, "$500");
\`\`\``;
      break;

    case "invalid_regex":
      codeExample = `
**USE synthesize_regex() INSTEAD OF MANUAL REGEX:**
\`\`\`javascript
// DON'T write regex manually - use synthesize_regex()!
const regex = synthesize_regex(["$1,000", "$2,500", "$10,000"]);
console.log("Synthesized pattern:", regex);

// Then use the synthesized pattern
const value = extract_with_regex(regex, hit.line);
\`\`\``;
      break;

    case "string_method_on_object":
      codeExample = `
**FIX:** Use hit.line to access the string:
\`\`\`javascript
const hits = grep("SALES_DATA");
for (const hit of hits) {
  // WRONG: hit.match(/pattern/)
  // RIGHT: hit.line.match(/pattern/)
  const match = hit.line.match(/\\$[\\d,]+/);
  if (match) {
    console.log("Found:", match[0]);
  }
}
\`\`\``;
      break;

    default:
      codeExample = `
**GENERAL APPROACH:**
\`\`\`javascript
// 1. Search for data
const hits = grep("KEYWORD");
console.log(JSON.stringify(hits.slice(0, 3), null, 2));

// 2. Synthesize extractor from examples
const extractor = synthesize_extractor([
  { input: hits[0].line.match(/\\$[\\d,]+/)[0], output: parseFloat(...) },
  { input: hits[1].line.match(/\\$[\\d,]+/)[0], output: parseFloat(...) },
]);

// 3. Apply to all data
let total = 0;
for (const hit of hits) {
  const match = hit.line.match(/\\$[\\d,]+/);
  if (match) total += extractor(match[0]);
}
console.log("Total:", total);
\`\`\``;
  }

  return `${feedback}
${codeExample}

Output ONLY a \`\`\`javascript code block with the fix:`;
}

/**
 * No code feedback with synthesis reminder
 */
function getNoCodeFeedback(): string {
  return `⚠️ ERROR: Wrong language or no code block!

**PYTHON IS NOT SUPPORTED.** This is a JavaScript-only sandbox.
You MUST output \`\`\`javascript code blocks. Python will NOT execute.

Rewrite your code in JavaScript:

\`\`\`javascript
// JavaScript uses const/let, not Python's variables
const hits = grep("keyword");
console.log(JSON.stringify(hits.slice(0, 3), null, 2));

// JavaScript for loop, not Python list comprehension
let total = 0;
for (const hit of hits) {
  const value = parseFloat(hit.line.match(/\\d+/)?.[0] || "0");
  total += value;
}
console.log("Total:", total);
\`\`\`

Or use synthesis tools:

\`\`\`javascript
const regex = synthesize_regex(["$100", "$200", "$300"]);
console.log(regex);
\`\`\``;
}

/**
 * Success feedback for Qwen Synthesis - emphasizes JavaScript and synthesis tools
 */
function getSuccessFeedback(): string {
  return `REMINDER: Output ONLY \`\`\`javascript code blocks. NO PYTHON.
Use synthesize_regex() or synthesize_extractor() for pattern matching.
Variables persist between turns. Continue exploring, OR output final answer using <<<FINAL>>> and <<<END>>> tags.`;
}

/**
 * Repeated code feedback for Qwen Synthesis - emphasizes JavaScript and synthesis
 */
function getRepeatedCodeFeedback(): string {
  return `ERROR: You are repeating the same code. This will give the same output.

Try a DIFFERENT approach using JavaScript and synthesis:
\`\`\`javascript
// Use synthesis tools for pattern matching
const examples = hits.slice(0, 5).map(h => h.line);
const regex = synthesize_regex(examples);
console.log("Synthesized:", regex);

// Extract data using the synthesized pattern
let total = 0;
for (const hit of hits) {
  const value = extract_with_regex(regex, hit.line);
  if (value) {
    total += parseFloat(value.replace(/[$,]/g, ''));
  }
}
console.log("Total:", total);
\`\`\`

Write NEW JavaScript code now:`;
}

/**
 * Create the Qwen Synthesis adapter
 */
export function createQwenSynthesisAdapter(): ModelAdapter {
  const base = createQwenAdapter();

  return {
    ...base,
    name: "qwen-synthesis",
    buildSystemPrompt,
    getErrorFeedback,
    getNoCodeFeedback,
    getSuccessFeedback,
    getRepeatedCodeFeedback,
  };
}
