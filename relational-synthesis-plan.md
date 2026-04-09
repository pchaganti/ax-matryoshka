# Implementation Plan: True Relational Synthesis Engine

## Overview

Implement a true relational interpreter (`evalo`) for a Data Extraction DSL that enables:
1. **Backwards reasoning** - synthesize extractors from input/output examples
2. **Early pruning** - reject impossible extractors via type constraints
3. **Interleaved search** - don't get stuck on one test case
4. **Formal guarantees** - if synthesis succeeds, the extractor provably works

## Architecture

```
┌────────────────────────────────────────────────────────────┐
│                    LLM Loop (unchanged)                    │
│  - Document exploration with grep()                        │
│  - Provides examples to synthesize_extractor()             │
└────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌────────────────────────────────────────────────────────────┐
│              src/synthesis/evalo/                          │
│  ├── types.ts        # DSL AST types                       │
│  ├── evalo.ts        # Relational interpreter              │
│  ├── typeo.ts        # Type inference relation             │
│  ├── synthesize.ts   # Multi-example synthesis             │
│  └── compile.ts      # Compile to JavaScript               │
└────────────────────────────────────────────────────────────┘
```

## Phase 1: DSL Types and Basic evalo

### Step 1.1: Define DSL Types
**File:** `src/synthesis/evalo/types.ts`

```typescript
// The extraction DSL - small enough to be relational
export type Extractor =
  | { tag: "input" }                                    // raw input
  | { tag: "lit"; value: string | number }              // literal
  | { tag: "match"; str: Extractor; pattern: string; group: number }
  | { tag: "replace"; str: Extractor; from: string; to: string }
  | { tag: "parseInt"; str: Extractor }
  | { tag: "parseFloat"; str: Extractor }
  | { tag: "slice"; str: Extractor; start: number; end: number }
  | { tag: "split"; str: Extractor; delim: string; index: number }
  | { tag: "add"; left: Extractor; right: Extractor }
  | { tag: "if"; cond: Extractor; then: Extractor; else: Extractor }

// Types for early pruning
export type Type = "string" | "number" | "boolean" | "null" | "unknown"

// Example for synthesis
export interface Example {
  input: string;
  output: string | number | boolean | null;
}
```

**Tests:**
- DSL types are valid TypeScript
- Can construct all extractor forms

### Step 1.2: Basic evalo Relation (Forward Mode)
**File:** `src/synthesis/evalo/evalo.ts`

Implement `evalo(extractor, input, output)` as a miniKanren relation.

**Tests (forward mode):**
```typescript
// input extractor returns the input
evalo({ tag: "input" }, "hello", ?out) => "hello"

// lit extractor returns the literal
evalo({ tag: "lit", value: 42 }, "anything", ?out) => 42

// match extracts regex group
evalo({ tag: "match", str: { tag: "input" }, pattern: "\\$(\\d+)", group: 1 },
      "$100", ?out) => "100"

// parseInt converts to number
evalo({ tag: "parseInt", str: { tag: "lit", value: "42" } },
      "", ?out) => 42
```

### Step 1.3: Backwards Mode (Synthesis)
**File:** `src/synthesis/evalo/evalo.ts`

Make evalo work backwards: given input and output, find extractor.

**Tests (synthesis mode):**
```typescript
// Find extractor that extracts "100" from "$100"
evalo(?extractor, "$100", "100")
=> { tag: "match", str: { tag: "input" }, pattern: "...", group: 1 }

// Find extractor that converts "$100" to number 100
evalo(?extractor, "$100", 100)
=> { tag: "parseInt", str: { tag: "match", ... } }
```

## Phase 2: Type System for Early Pruning

### Step 2.1: Type Inference Relation
**File:** `src/synthesis/evalo/typeo.ts`

Implement `typeo(extractor, type)` - infers the output type of an extractor.

**Tests:**
```typescript
typeo({ tag: "input" }, ?type) => "string"
typeo({ tag: "parseInt", ... }, ?type) => "number"
typeo({ tag: "match", ... }, ?type) => "string"
```

### Step 2.2: Type-Constrained Synthesis
**File:** `src/synthesis/evalo/evalo.ts`

Add type constraint to synthesis: if output is number, only enumerate extractors with numeric output type.

**Tests:**
```typescript
// Should find numeric extractor quickly (not enumerate string-only extractors)
synthesize([{ input: "$100", output: 100 }])
=> Finds parseInt/parseFloat extractor, not raw match
```

## Phase 3: Multi-Example Interleaved Search

### Step 3.1: Interleaved Test Runner
**File:** `src/synthesis/evalo/synthesize.ts`

Implement interleaved search across multiple examples.

**Tests:**
```typescript
// Should find extractor that works for all examples
synthesize([
  { input: "$100", output: 100 },
  { input: "$200", output: 200 },
])
=> Single extractor that works for both

// Should fail fast on conflicting examples
synthesize([
  { input: "abc", output: 1 },
  { input: "abc", output: 2 },
])
=> Error: Conflicting examples
```

### Step 3.2: Timeout Per Candidate
Add timeout to prevent infinite loops on bad candidates.

**Tests:**
```typescript
// Should timeout and move on, not hang
synthesize([{ input: "...", output: "..." }], { timeoutMs: 100 })
=> Either finds answer or returns "no solution", never hangs
```

## Phase 4: JavaScript Compilation

### Step 4.1: Compile Extractor to JavaScript
**File:** `src/synthesis/evalo/compile.ts`

Convert DSL extractor to executable JavaScript.

**Tests:**
```typescript
compile({ tag: "parseInt", str: { tag: "match", str: { tag: "input" }, pattern: "\\$(\\d+)", group: 1 } })
=> "(input) => parseInt(input.match(/\\$(\\d+)/)[1], 10)"
```

### Step 4.2: Create Executable Function
Return a callable function, not just code string.

**Tests:**
```typescript
const fn = compileToFunction(extractor);
fn("$100") === 100
fn("$200") === 200
```

## Phase 5: Integration with Sandbox

### Step 5.1: Update synthesize_extractor Tool
**File:** `src/synthesis/sandbox-tools.ts`

Replace current heuristic-based synthesis with relational synthesis.

**Tests:**
```typescript
// In sandbox, call synthesize_extractor
const extractor = synthesize_extractor([
  { input: "$1,234", output: 1234 },
  { input: "$5,678", output: 5678 },
]);
extractor("$9,999") === 9999
```

### Step 5.2: Better Error Messages

When synthesis fails, provide actionable feedback.

**Tests:**
```typescript
// Not enough examples
synthesize([{ input: "x", output: 1 }])
=> Error: "Need at least 2 examples for reliable synthesis"

// No pattern found
synthesize([{ input: "abc", output: 1 }, { input: "xyz", output: 2 }])
=> Error: "Could not find common extraction pattern"
```

## Files to Create

1. `src/synthesis/evalo/types.ts` - DSL types
2. `src/synthesis/evalo/evalo.ts` - Relational interpreter
3. `src/synthesis/evalo/typeo.ts` - Type inference
4. `src/synthesis/evalo/synthesize.ts` - Multi-example synthesis
5. `src/synthesis/evalo/compile.ts` - JavaScript compilation
6. `src/synthesis/evalo/index.ts` - Public exports

## Test Files to Create

1. `tests/evalo/types.test.ts`
2. `tests/evalo/evalo.test.ts`
3. `tests/evalo/typeo.test.ts`
4. `tests/evalo/synthesize.test.ts`
5. `tests/evalo/compile.test.ts`
6. `tests/evalo/integration.test.ts`

## Success Criteria

1. **Backwards reasoning works**: Given examples, synthesize working extractor
2. **Type pruning active**: Numeric outputs don't enumerate string-only extractors
3. **Multi-example interleaving**: Finds extractors that work for all examples
4. **No hangs**: Timeout prevents infinite loops
5. **Compiles to efficient JS**: Generated code is clean and fast
6. **All existing tests pass**: Don't break current functionality

## TDD Implementation Order

### Day 1: Foundation
1. Create `types.ts` with tests
2. Create `evalo.ts` with forward-mode tests
3. Implement forward evaluation for: input, lit, match, replace

### Day 2: Synthesis
4. Add backwards-mode to evalo
5. Implement typeo with tests
6. Add type-constrained synthesis

### Day 3: Multi-Example
7. Implement interleaved synthesis
8. Add conflict detection
9. Add timeout handling

### Day 4: Integration
10. Implement compile.ts
11. Update sandbox-tools.ts
12. Integration tests

## Key Design Decisions

### Why a DSL, Not Full JavaScript?
- Full JavaScript is too complex to make relational
- Our DSL covers 95% of data extraction use cases
- Small DSL = fast synthesis
- Formal guarantees are possible

### Why miniKanren?
- Already have ramo implementation
- Supports backwards reasoning natively
- Lazy streams prevent infinite loops
- Well-understood formal properties

### Why Keep the LLM Loop?
- LLM handles high-level strategy (what to search for)
- LLM handles messy real-world data exploration
- Synthesis handles precise extraction
- Best of both worlds: flexibility + guarantees
