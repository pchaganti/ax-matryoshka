# Phase 2: Advanced Barliman Integration

Moving from "prompting an LLM to write a script" to "constraining an LLM to solve for a program."

## Overview

| Phase | Feature | Barliman Equivalent | Implementation |
|-------|---------|---------------------|----------------|
| 1 | Constraint Injection | `(== output expected)` | Schema validation, typed constraints |
| 2 | Symbolic Feedback | Unification Failure | Document-hit traces, structured failure reasons |
| 3 | Program Sketches | Logic Variables (Holes) | Templates with `{{HOLE}}` markers |
| 4 | Parallel Synthesis | Interleaved Search | Multi-candidate generation + referee |

---

## Phase 1: Constraint-First Synthesis

### Goal
Shift from "explore and find" to "synthesize a function that satisfies these constraints."

### Implementation

#### 1.1 Add `--constraints` CLI Flag

**File:** `src/index.ts`

```typescript
program
  .option('--constraints <json>', 'Output constraints as JSON schema or type hints')
  .option('--output-type <type>', 'Expected output type: number, string, array, object')
```

**Example usage:**
```bash
rlm "Find total sales" ./data.txt --output-type number
rlm "Extract all errors" ./logs.txt --constraints '{"type": "array", "items": {"type": "string"}}'
```

#### 1.2 Create Constraint Types

**File:** `src/constraints/types.ts`

```typescript
export interface OutputConstraint {
  type: "number" | "string" | "boolean" | "array" | "object";

  // For numbers
  min?: number;
  max?: number;
  integer?: boolean;

  // For strings
  pattern?: string;
  minLength?: number;
  maxLength?: number;

  // For arrays
  items?: OutputConstraint;
  minItems?: number;
  maxItems?: number;

  // For objects
  properties?: Record<string, OutputConstraint>;
  required?: string[];
}

export interface SynthesisConstraint {
  output: OutputConstraint;
  examples?: Array<{ input: string; output: unknown }>;
  invariants?: string[]; // e.g., "result > 0", "result.length > 0"
}
```

#### 1.3 Update System Prompt with Verification Section

**File:** `src/adapters/base.ts` or new `src/adapters/constraint-aware.ts`

Add to system prompt:
```typescript
function buildConstraintSection(constraint: SynthesisConstraint): string {
  return `
## OUTPUT CONSTRAINTS

Your final answer MUST satisfy these constraints:

Type: ${constraint.output.type}
${constraint.output.min !== undefined ? `Minimum: ${constraint.output.min}` : ''}
${constraint.output.max !== undefined ? `Maximum: ${constraint.output.max}` : ''}
${constraint.invariants?.map(inv => `Invariant: ${inv}`).join('\n') || ''}

Before returning, VERIFY your result:
\`\`\`javascript
const result = /* your computed result */;
console.log("Type check:", typeof result === "${constraint.output.type}");
${constraint.invariants?.map(inv => `console.log("Invariant check:", ${inv});`).join('\n') || ''}
\`\`\`

If ANY check fails, revise your approach.
`;
}
```

#### 1.4 Add Verification Step

**File:** `src/verification/verifier.ts`

```typescript
export function verifyResult(
  result: unknown,
  constraint: SynthesisConstraint
): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  // Type check
  if (typeof result !== constraint.output.type) {
    errors.push(`Expected type ${constraint.output.type}, got ${typeof result}`);
  }

  // Numeric constraints
  if (constraint.output.type === "number" && typeof result === "number") {
    if (constraint.output.min !== undefined && result < constraint.output.min) {
      errors.push(`Value ${result} is below minimum ${constraint.output.min}`);
    }
    if (constraint.output.max !== undefined && result > constraint.output.max) {
      errors.push(`Value ${result} is above maximum ${constraint.output.max}`);
    }
  }

  // Array constraints
  if (constraint.output.type === "array" && Array.isArray(result)) {
    if (constraint.output.minItems !== undefined && result.length < constraint.output.minItems) {
      errors.push(`Array has ${result.length} items, minimum is ${constraint.output.minItems}`);
    }
  }

  return { valid: errors.length === 0, errors };
}
```

### Tests

```typescript
describe("Constraint Verification", () => {
  it("should validate numeric output", () => {
    const result = verifyResult(42, { output: { type: "number", min: 0 } });
    expect(result.valid).toBe(true);
  });

  it("should reject wrong type", () => {
    const result = verifyResult("hello", { output: { type: "number" } });
    expect(result.valid).toBe(false);
    expect(result.errors).toContain("Expected type number, got string");
  });
});
```

---

## Phase 2: Execution Trace Feedback Loop

### Goal
When code fails, tell the LLM *why* with structured feedback about what was accessed and what failed.

### Implementation

#### 2.1 Create Execution Trace Type

**File:** `src/tracing/types.ts`

```typescript
export interface ExecutionTrace {
  // What parts of the document were accessed
  documentAccess: {
    grepCalls: Array<{
      pattern: string;
      matchCount: number;
      lineNumbers: number[];
    }>;
    sliceRanges: Array<{ start: number; end: number }>;
    fuzzySearches: Array<{
      query: string;
      resultCount: number;
    }>;
  };

  // Intermediate values
  intermediates: Array<{
    expression: string;
    value: unknown;
    type: string;
  }>;

  // What went wrong
  failure?: {
    type: "no_data" | "wrong_type" | "parse_error" | "runtime_error";
    message: string;
    suggestion: string;
  };
}
```

#### 2.2 Instrument Sandbox with Tracing

**File:** `src/synthesis/sandbox-tools.ts`

```typescript
// Add tracing to grep
function createTracingGrep(trace: ExecutionTrace) {
  return function grep(pattern: string, flags?: string) {
    const results = originalGrep(pattern, flags);

    trace.documentAccess.grepCalls.push({
      pattern,
      matchCount: results.length,
      lineNumbers: results.map(r => r.lineNum),
    });

    return results;
  };
}
```

#### 2.3 Generate Structured Feedback

**File:** `src/feedback/trace-analyzer.ts`

```typescript
export function analyzeTrace(trace: ExecutionTrace): string {
  const feedback: string[] = [];

  // Analyze document access
  if (trace.documentAccess.grepCalls.length === 0) {
    feedback.push("WARNING: You did not search the document. Use grep() or fuzzy_search() first.");
  }

  const zeroResultSearches = trace.documentAccess.grepCalls.filter(c => c.matchCount === 0);
  if (zeroResultSearches.length > 0) {
    feedback.push(`ISSUE: These searches returned 0 results:`);
    for (const search of zeroResultSearches) {
      feedback.push(`  - grep("${search.pattern}") → 0 matches`);
      feedback.push(`    SUGGESTION: Try a broader pattern or check for typos`);
    }
  }

  // Analyze result
  if (trace.failure) {
    feedback.push(`FAILURE: ${trace.failure.type}`);
    feedback.push(`  ${trace.failure.message}`);
    feedback.push(`  SUGGESTION: ${trace.failure.suggestion}`);
  }

  return feedback.join("\n");
}
```

#### 2.4 Integrate with RLM Loop

**File:** `src/rlm.ts`

```typescript
// After code execution
const trace = sandbox.getExecutionTrace();
const traceAnalysis = analyzeTrace(trace);

if (result.error || !isValidResult(result)) {
  feedback += `\n\n## EXECUTION TRACE\n${traceAnalysis}`;
  feedback += `\n\nBased on this trace, revise your approach.`;
}
```

### Tests

```typescript
describe("Trace Analysis", () => {
  it("should detect zero-result searches", () => {
    const trace: ExecutionTrace = {
      documentAccess: {
        grepCalls: [{ pattern: "NONEXISTENT", matchCount: 0, lineNumbers: [] }],
        sliceRanges: [],
        fuzzySearches: [],
      },
      intermediates: [],
    };

    const feedback = analyzeTrace(trace);
    expect(feedback).toContain("0 results");
    expect(feedback).toContain("SUGGESTION");
  });
});
```

---

## Phase 3: Program Sketches (Holes)

### Goal
Provide templates with holes that the LLM fills in, reducing syntax errors and focusing on semantics.

### Implementation

#### 3.1 Define Sketch Types

**File:** `src/sketches/types.ts`

```typescript
export interface ProgramSketch {
  name: string;
  description: string;
  template: string;
  holes: Array<{
    id: string;
    type: "expression" | "predicate" | "transform";
    description: string;
    examples?: string[];
  }>;
}

export const STANDARD_SKETCHES: ProgramSketch[] = [
  {
    name: "filter-extract",
    description: "Filter lines matching a pattern, then extract data from each",
    template: `
const matches = grep({{HOLE:pattern}});
const results = matches.filter(m => {{HOLE:filter}}).map(m => {{HOLE:extract}});
console.log("Found:", results.length);
console.log("Total:", results.reduce((a, b) => a + b, 0));
`,
    holes: [
      { id: "pattern", type: "expression", description: "Regex pattern to search for" },
      { id: "filter", type: "predicate", description: "Boolean condition to filter matches" },
      { id: "extract", type: "transform", description: "Expression to extract value from each match" },
    ],
  },
  {
    name: "aggregate",
    description: "Search, extract values, and aggregate (sum/count/average)",
    template: `
const hits = grep({{HOLE:pattern}});
let total = 0;
for (const hit of hits) {
  const value = {{HOLE:extract_value}};
  if (value !== null && !isNaN(value)) {
    total += value;
  }
}
console.log("Total:", total);
`,
    holes: [
      { id: "pattern", type: "expression", description: "Pattern to find data entries" },
      { id: "extract_value", type: "transform", description: "How to extract numeric value from hit.line" },
    ],
  },
];
```

#### 3.2 Sketch-Based Adapter

**File:** `src/adapters/sketch-adapter.ts`

```typescript
export function createSketchAdapter(): ModelAdapter {
  return {
    name: "sketch",

    buildSystemPrompt(contextLength: number, toolInterfaces: string): string {
      return `You are a HOLE-FILLING synthesizer.

I will give you PROGRAM SKETCHES with {{HOLE:name}} markers.
Your job is to FILL THE HOLES with concrete code.

## AVAILABLE SKETCHES

${STANDARD_SKETCHES.map(s => `
### ${s.name}
${s.description}

Template:
\`\`\`javascript
${s.template}
\`\`\`

Holes to fill:
${s.holes.map(h => `- {{HOLE:${h.id}}} (${h.type}): ${h.description}`).join('\n')}
`).join('\n')}

## YOUR TASK

1. CHOOSE a sketch that fits the query
2. FILL each {{HOLE:...}} with concrete code
3. Output the COMPLETE filled sketch

## FORMAT

\`\`\`javascript
// Using sketch: [sketch-name]
[your filled code here]
\`\`\`
`;
    },
    // ... other methods
  };
}
```

#### 3.3 Hole-Filling Engine

**File:** `src/sketches/filler.ts`

```typescript
export function fillSketch(
  sketch: ProgramSketch,
  fillings: Record<string, string>
): { code: string; errors: string[] } {
  let code = sketch.template;
  const errors: string[] = [];

  for (const hole of sketch.holes) {
    const filling = fillings[hole.id];
    if (!filling) {
      errors.push(`Missing filling for {{HOLE:${hole.id}}}`);
      continue;
    }

    code = code.replace(`{{HOLE:${hole.id}}}`, filling);
  }

  // Check for unfilled holes
  const remaining = code.match(/\{\{HOLE:\w+\}\}/g);
  if (remaining) {
    errors.push(`Unfilled holes: ${remaining.join(", ")}`);
  }

  return { code, errors };
}
```

### Tests

```typescript
describe("Sketch Filling", () => {
  it("should fill all holes in template", () => {
    const sketch = STANDARD_SKETCHES.find(s => s.name === "aggregate")!;

    const result = fillSketch(sketch, {
      pattern: '"SALES"',
      extract_value: 'parseFloat(hit.line.match(/\\$(\\d+)/)[1])',
    });

    expect(result.errors).toHaveLength(0);
    expect(result.code).not.toContain("{{HOLE:");
    expect(result.code).toContain("SALES");
  });
});
```

---

## Phase 4: Multi-Candidate Beam Search

### Goal
Generate multiple candidate approaches in parallel, test on sample data, and pick the winner.

### Implementation

#### 4.1 Beam Search Types

**File:** `src/beam/types.ts`

```typescript
export interface Candidate {
  id: string;
  code: string;
  sketch?: string;

  // Evaluation results
  evaluation?: {
    sampleResult: unknown;
    executionTimeMs: number;
    errors: string[];
    score: number;
  };
}

export interface BeamConfig {
  numCandidates: number;   // How many to generate (default: 3)
  sampleSize: number;      // Lines to test on (default: 100)
  maxParallelEval: number; // Parallel evaluations (default: 3)
}
```

#### 4.2 Multi-Candidate Generator

**File:** `src/beam/generator.ts`

```typescript
export async function generateCandidates(
  query: string,
  llmClient: LLMQueryFn,
  adapter: ModelAdapter,
  config: BeamConfig
): Promise<Candidate[]> {
  // Generate N different approaches
  const prompts = Array.from({ length: config.numCandidates }, (_, i) => `
${adapter.buildSystemPrompt(0, "")}

Query: ${query}

Generate approach #${i + 1} of ${config.numCandidates}.
${i === 0 ? "Use the most straightforward approach." : ""}
${i === 1 ? "Use a different pattern or strategy than approach #1." : ""}
${i >= 2 ? "Try an alternative extraction method." : ""}
`);

  const responses = await Promise.all(
    prompts.map(p => llmClient(p))
  );

  return responses.map((response, i) => ({
    id: `candidate-${i}`,
    code: adapter.extractCode(response) || "",
  }));
}
```

#### 4.3 Referee/Evaluator

**File:** `src/beam/referee.ts`

```typescript
export async function evaluateCandidates(
  candidates: Candidate[],
  sampleContext: string,
  sandbox: SandboxWithSynthesis
): Promise<Candidate[]> {
  const evaluated = await Promise.all(
    candidates.map(async (candidate) => {
      if (!candidate.code) {
        return { ...candidate, evaluation: { score: 0, errors: ["No code"] } };
      }

      const start = Date.now();
      const result = await sandbox.execute(candidate.code, 5000); // 5s timeout
      const timeMs = Date.now() - start;

      // Score the result
      let score = 0;
      const errors: string[] = [];

      if (result.error) {
        errors.push(result.error);
        score = 0;
      } else if (result.result === null || result.result === undefined) {
        errors.push("Returned null/undefined");
        score = 1;
      } else if (typeof result.result === "number" && !isNaN(result.result)) {
        score = 10; // Numeric result is promising
      } else if (Array.isArray(result.result) && result.result.length > 0) {
        score = 8; // Non-empty array is good
      } else if (result.logs.length > 0) {
        score = 5; // At least produced output
      }

      return {
        ...candidate,
        evaluation: {
          sampleResult: result.result,
          executionTimeMs: timeMs,
          errors,
          score,
        },
      };
    })
  );

  // Sort by score descending
  return evaluated.sort((a, b) =>
    (b.evaluation?.score || 0) - (a.evaluation?.score || 0)
  );
}
```

#### 4.4 Integrate with RLM Loop

**File:** `src/rlm.ts`

```typescript
// On first turn, generate multiple candidates
if (turn === 1 && options.useBeamSearch) {
  const candidates = await generateCandidates(query, llmClient, adapter, {
    numCandidates: 3,
    sampleSize: 100,
    maxParallelEval: 3,
  });

  // Create sample sandbox
  const sampleContext = documentContent.slice(0, 5000);
  const sampleSandbox = await createSandboxWithSynthesis(sampleContext, ...);

  // Evaluate and pick winner
  const ranked = await evaluateCandidates(candidates, sampleContext, sampleSandbox);

  log(`[Beam] Evaluated ${candidates.length} candidates:`);
  for (const c of ranked) {
    log(`  ${c.id}: score=${c.evaluation?.score}, errors=${c.evaluation?.errors.length}`);
  }

  // Use the best candidate
  const best = ranked[0];
  if (best.code) {
    history.push({ role: "assistant", content: "```javascript\n" + best.code + "\n```" });
  }
}
```

### Tests

```typescript
describe("Beam Search", () => {
  it("should generate multiple candidates", async () => {
    const candidates = await generateCandidates(
      "Find total sales",
      mockLLMClient,
      adapter,
      { numCandidates: 3, sampleSize: 100, maxParallelEval: 3 }
    );

    expect(candidates).toHaveLength(3);
    expect(candidates.every(c => c.id)).toBe(true);
  });

  it("should rank candidates by score", async () => {
    const ranked = await evaluateCandidates(mockCandidates, sampleContext, sandbox);

    // Best should be first
    expect(ranked[0].evaluation?.score).toBeGreaterThanOrEqual(
      ranked[ranked.length - 1].evaluation?.score || 0
    );
  });
});
```

---

## Files to Create

### Phase 1: Constraints
- `src/constraints/types.ts` - Constraint type definitions
- `src/constraints/verifier.ts` - Result verification
- `src/adapters/constraint-aware.ts` - Constraint-aware prompting
- `tests/constraints/verifier.test.ts`

### Phase 2: Tracing
- `src/tracing/types.ts` - Trace type definitions
- `src/tracing/instrumentation.ts` - Sandbox instrumentation
- `src/feedback/trace-analyzer.ts` - Trace analysis
- `tests/tracing/analyzer.test.ts`

### Phase 3: Sketches
- `src/sketches/types.ts` - Sketch definitions
- `src/sketches/library.ts` - Standard sketches
- `src/sketches/filler.ts` - Hole-filling logic
- `src/adapters/sketch-adapter.ts` - Sketch-based prompting
- `tests/sketches/filler.test.ts`

### Phase 4: Beam Search
- `src/beam/types.ts` - Beam search types
- `src/beam/generator.ts` - Multi-candidate generation
- `src/beam/referee.ts` - Candidate evaluation
- `tests/beam/search.test.ts`

---

## Implementation Order

1. **Phase 1** first - Adds constraint specification and verification
2. **Phase 2** second - Better feedback enables better iteration
3. **Phase 3** third - Sketches reduce synthesis errors
4. **Phase 4** last - Beam search explores multiple paths

Each phase builds on the previous, and all can be developed with TDD.

---

## CLI Changes

```bash
# Phase 1: Constraints
rlm "Find total" ./data.txt --output-type number
rlm "Extract errors" ./logs.txt --constraints '{"type":"array"}'

# Phase 3: Sketches
rlm "Sum sales" ./data.txt --sketch aggregate

# Phase 4: Beam Search
rlm "Find data" ./data.txt --beam 5
```

---

## Success Criteria

1. **Phase 1**: Constraint violations are detected and fed back to LLM
2. **Phase 2**: Trace analysis identifies why searches return empty
3. **Phase 3**: LLM can fill holes in sketches correctly
4. **Phase 4**: Best candidate is selected from multiple approaches

Each phase should have comprehensive tests before integration.
