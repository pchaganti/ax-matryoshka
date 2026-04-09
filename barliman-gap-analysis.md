# Barliman Gap Analysis

Comparison of our synthesis implementation vs Barliman's approach.

## Fundamental Distinction

| Aspect | Barliman | Matryoshka |
|--------|----------|------------|
| **Category** | Relational Program Synthesizer | LLM-based Agentic Loop |
| **Core approach** | Solve constraints via logic | Explore via trial and error |
| **Guarantees** | Formal/Mathematical | Probabilistic |
| **Language** | miniScheme (tiny, formal) | JavaScript (full, messy) |
| **Data** | Clean, symbolic | Real-world, unstructured |

**Key Insight**: Matryoshka's "gap" is also its **strength** - by moving away from rigid logic, it handles messy real-world data that Barliman's symbolic logic would struggle with.

- **Barliman** = Surgical tool for perfect algorithms
- **Matryoshka** = Scout for massive data

## The Five Superpowers We're Missing

### 1. Backwards Reasoning (The Relational Gap)

**Barliman**: Uses a relational interpreter (`evalo`) that can run "backwards":
```scheme
;; Synthesis mode: find program that produces output from input
(evalo ?program known-input known-output)
```

**Matryoshka**: Forward-only execution:
```typescript
// Generate code, run it, check result
const result = sandbox.execute(llmGeneratedCode);
if (result !== expected) tryAgain();
```

**Impact**: We cannot "solve for code" - we can only guess and check.

### 2. Logical Pruning (Fail-Fast)

**Barliman**: If halfway through generating a program it realizes the structure *cannot possibly* satisfy constraints, it prunes immediately. Never finishes writing broken code.

**Matryoshka**: Must execute complete code before discovering it's wrong. A fuzzy search that misses data isn't caught until after execution.

**Impact**: We explore many more candidates than necessary.

### 3. Partial Program Evaluation (Holes)

**Barliman**: Can evaluate **incomplete** programs using logic variables (`_.1` = "I don't know yet"):
```scheme
(evalo `(lambda (x) ,?body) input output)  ; ?body is a hole
```

**Matryoshka**: Requires **syntactically complete** JavaScript. Must commit to full implementation every turn.

**Impact**: Cannot reason incrementally about program structure.

### 4. Formal Guarantees vs Probabilities

**Barliman**: If it finds a program satisfying 5 tests, it's **mathematically certain** to produce those outputs.

**Matryoshka**: Results are **probabilistic** - subject to LLM errors, non-determinism, context window issues.

**Impact**: Cannot prove correctness, only demonstrate it empirically.

### 5. Semantic Recursion vs Task Recursion

**Barliman**: Synthesizes **recursive algorithms** (map, filter, append) - understands recursion within code.

**Matryoshka**: Uses **task recursion** (`llm_query()` spawns sub-tasks) - high-level decomposition, not algorithmic recursion.

**Impact**: Cannot synthesize recursive functions.

## What's Actually Missing?

1. **Backtracking**: Cannot revert mid-synthesis decisions; must start new turn
2. **Type/Structure Inference**: Doesn't "know" JavaScript rules; has just "seen" JavaScript
3. **Constraint Interleaving**: Code is built, THEN results checked (not during building)

## The Hybrid Architecture Solution

We don't need to replace the LLM loop - we need to **augment it** with relational synthesis for the parts that benefit from it.

```
┌─────────────────────────────────────────────────────────────┐
│                  LLM ORCHESTRATION LAYER                    │
│    (High-level strategy, document exploration, grep())      │
│    "Find all SALES_DATA entries and extract the values"     │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│              CONSTRAINT INTERFACE LAYER                     │
│    synthesize_extractor([                                   │
│      { input: "$2,340,000", output: 2340000 },              │
│      { input: "$3,120,000", output: 3120000 }               │
│    ])                                                       │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│              RELATIONAL SYNTHESIS LAYER                     │
│    evalo(Extractor, Input, Output)                          │
│    - Backwards reasoning (synthesis mode)                   │
│    - Early pruning via types                                │
│    - Formal guarantee on result                             │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│              GENERATED JAVASCRIPT                           │
│    (input) => parseFloat(input.match(/\$([\d,]+)/)[1]       │
│                              .replace(/,/g, ""))            │
└─────────────────────────────────────────────────────────────┘
```

**The LLM provides examples. The synthesis layer solves for code.**

## Data Extraction DSL

We don't need relational JavaScript - that's too complex. We need a **Data Extraction DSL** small enough to be relational:

```
Extractor ::=
  | input                              -- raw input string
  | lit(Value)                         -- literal value
  | match(Extractor, Pattern, Group)   -- regex match
  | replace(Extractor, Pattern, Repl)  -- string replace
  | parseInt(Extractor)                -- parse as int
  | parseFloat(Extractor)              -- parse as float
  | slice(Extractor, Start, End)       -- substring
  | split(Extractor, Delim, Index)     -- split and index
  | add(Extractor, Extractor)          -- arithmetic
  | if(Pred, Then, Else)               -- conditional
```

This DSL is:
1. **Small enough** to implement relationally (~10 forms)
2. **Expressive enough** for data extraction (covers 95% of use cases)
3. **Compilable** to efficient JavaScript
4. **Composable** - complex extractors from simple parts

## Implementation Plan

### Phase 1: True Relational Interpreter

Implement `evalo` for the extraction DSL with:
- Backwards reasoning (given input+output, find extractor)
- Type constraints (prune extractors that can't produce required type)
- Proper miniKanren search with interleaving

### Phase 2: Type System for Early Pruning

Add types to enable fail-fast:
```
Type ::= string | number | boolean | null | unknown
```

If output must be `number`, immediately reject extractors that only produce strings.

### Phase 3: Interleaved Multi-Test Search

Use miniKanren streams properly:
- Don't test all examples on one candidate
- Interleave: test 1 on candidates, test 2 on candidates, ...
- Prune candidates that fail any test

### Phase 4: Integration with LLM Loop

Replace current "LLM writes extraction code" with:
1. LLM searches document with grep()
2. LLM provides examples to `synthesize_extractor()`
3. Relational layer returns working function
4. LLM applies function to all matches

## TDD Test Cases

### Backwards Reasoning
```typescript
// Given input and output, synthesize extractor
synthesize([
  { input: "$1,234", output: 1234 },
  { input: "$5,678", output: 5678 },
])
// => parseFloat(replace(match(input, /\$([\d,]+)/, 1), /,/, ""))
```

### Early Pruning
```typescript
// Should NOT enumerate string-only extractors when output is number
synthesize([{ input: "foo", output: 123 }])
// => Only considers extractors that can produce numbers
```

### Conflicting Examples
```typescript
// Should detect impossible constraints
synthesize([
  { input: "abc", output: 1 },
  { input: "abc", output: 2 },  // Same input, different output!
])
// => Error: Conflicting examples
```

### Partial Matching
```typescript
// Should handle examples that need different extraction
synthesize([
  { input: "PRICE: $100", output: 100 },
  { input: "COST: $200", output: 200 },
])
// => Finds common pattern despite different prefixes
```

---

## Implementation Status

### Completed (Phase 1)

We've implemented a true relational synthesis engine in `src/synthesis/evalo/`:

1. **types.ts** - Data Extraction DSL types
   - `Extractor` type with 10 forms: input, lit, match, replace, slice, split, parseInt, parseFloat, add, if
   - `Type` for type inference: string, number, boolean, null, unknown
   - `Example` for synthesis: `{ input: string, output: Value }`

2. **evalo.ts** - Relational interpreter
   - `evalExtractor()` - Forward evaluation
   - `synthesizeExtractor()` - Backwards reasoning (synthesis from examples)
   - Generates candidate extractors using pattern enumeration
   - Tests against ALL examples to find working extractors

3. **typeo.ts** - Type inference
   - `inferType()` - Static type inference for extractors
   - `canProduceType()` - Early pruning based on output type
   - Enables rejecting impossible candidates without execution

4. **compile.ts** - JavaScript compilation
   - `compile()` - Convert DSL to JavaScript code string
   - `compileToFunction()` - Create executable function
   - `prettyPrint()` - Human-readable representation

5. **Integration with sandbox-tools.ts**
   - `synthesize_extractor()` now uses relational synthesis first
   - Falls back to coordinator-based synthesis if needed
   - Transparent to LLM - same API, better synthesis

### Test Results

- **100 tests** for the evalo module alone
- **835 total tests** passing
- End-to-end CLI test: correctly synthesizes currency extractor and computes total

### What's Working

1. **Backwards Reasoning**: Given `[{input: "$1,234", output: 1234}, ...]`, synthesizes `parseInt(replace(match(input, /\$([\d,]+)/, 1), /,/, ""))`

2. **Type Inference**: `inferType()` statically determines output type without running the extractor

3. **Conflict Detection**: Throws error for conflicting examples (same input, different outputs)

4. **Compilation**: Synthesized extractors compile to efficient JavaScript functions

### Completed (Phase 2) - Constraint-First Synthesis

Added Barliman-style constraint verification in `src/constraints/`:

1. **types.ts** - Constraint type definitions
   - `OutputConstraint` - JSON Schema-like type specs (type, min, max, pattern, etc.)
   - `SynthesisConstraint` - Full constraint with examples and invariants
   - `VerificationResult` - Validation result with errors

2. **verifier.ts** - Result verification
   - `verifyResult()` - Check if output satisfies constraints
   - `verifyInvariant()` - Safe evaluation of invariant expressions
   - Type checking, numeric bounds, string patterns, array/object validation

3. **CLI Integration** (`src/index.ts`)
   - `--output-type <type>` - Simple type constraint (number, string, array, etc.)
   - `--constraints <json>` - Full JSON constraint specification
   - Example: `rlm "Find total" ./data.txt --output-type number`

4. **RLM Integration** (`src/rlm.ts`)
   - Constraints added to user message
   - Results verified before returning
   - Invalid results trigger constraint violation feedback
   - Model continues iterating until constraints are satisfied

### Test Results (Updated)

- **43 tests** for constraint verification
- **878 total tests** passing
- Constraint violations trigger appropriate feedback loops

### Remaining Gaps (Future Work)

1. **True Relational Evaluation**: Current synthesis enumerates + tests. True `evalo` would use miniKanren to solve for extractors directly.

2. **Interleaved Search**: Currently tests all examples sequentially on each candidate. Could interleave across tests for better pruning.

3. **Partial Programs with Holes**: No support for templates with logic variables yet.

4. **Recursive Functions**: DSL doesn't include lambda/recursion - limited to straight-line extractors.

5. **Constraint Propagation**: No CLP(FD) or advanced miniKanren features yet.

6. **Execution Trace Feedback**: Need structured traces showing what was accessed and why it failed.

7. **Program Sketches**: Templates with `{{HOLE}}` markers for LLM to fill.

8. **Multi-Candidate Beam Search**: Generate multiple approaches in parallel and pick the best.
