# Barliman-Style Program Synthesis Architecture

## Understanding Barliman

Barliman uses a **relational interpreter** written in miniKanren. The key insight is that a relational interpreter can run **bidirectionally**:
- Forward: given program + input → compute output
- Backward: given input + output → **synthesize program**

This is the essence of program synthesis from examples.

## Current (Broken) Architecture

```
LLM writes code → Execute → Return results → LLM writes more code (often wrong)
```

Problems:
- LLM hallucinates data instead of extracting it
- Synthesis tools are passive (optional functions LLM might call)
- No program evolution or constraint-based search
- No inner/outer loop structure

## Correct Architecture

### Two-Loop Structure

**Inner Loop (Synthesis):**
```
Constraints (from LLM) → miniKanren Search → Candidate Programs → Test on Data
                              ↑                                         ↓
                              └─────────── Refine if fails ────────────┘
```

**Outer Loop (Refinement):**
```
User Query → LLM understands intent → LLM provides constraints
                                              ↓
                                    Inner Loop synthesizes code
                                              ↓
                                    Execute on full data
                                              ↓
                                    LLM evaluates results
                                              ↓
                                    Accept OR provide more constraints
```

### Role Separation

**LLM Role:**
1. Understand user query and data structure
2. Generate **constraints** (NOT code):
   - Input/output examples from data exploration
   - Pattern descriptions ("lines starting with SALES_DATA")
   - Expected transformations ("extract currency, parse as number")
3. Evaluate synthesized code results
4. Provide refinements if needed

**Synthesis Engine Role:**
1. Accept constraints from LLM
2. Use miniKanren to search for programs satisfying constraints
3. Test candidate programs on actual data
4. Return successful programs or request more constraints

### Relational Interpreter

Following Barliman, we need a relational interpreter for a JavaScript subset:

```javascript
// The interpreter as a relation: evalo(expr, env, result)
// Can run forward: evalo(program, input, ???) → finds output
// Can run backward: evalo(???, input, output) → synthesizes program

const evalo = Rel((expr, env, result) =>
  conde(
    // Literal: evaluates to itself
    [eq(expr, result), literalo(expr)],

    // Variable lookup
    exist((name, val) => [
      eq(expr, { type: 'var', name }),
      lookupo(name, env, val),
      eq(result, val)
    ]),

    // Addition
    exist((a, b, va, vb) => [
      eq(expr, { type: 'add', left: a, right: b }),
      evalo(a, env, va),
      evalo(b, env, vb),
      pluso(va, vb, result)
    ]),

    // String match
    exist((str, pattern, match) => [
      eq(expr, { type: 'match', str, pattern }),
      evalo(str, env, str_val),
      matcho(str_val, pattern, result)
    ]),

    // ... more expression types
  )
);
```

### Synthesis from Examples

```javascript
// Given input/output examples, synthesize a program
function synthesize(examples) {
  // examples: [{ input: "$1,000", output: 1000 }, ...]

  const results = run(5)(program =>
    // For all examples, the program must produce correct output
    examples.every(({ input, output }) =>
      evalo(program, { input }, output)
    )
  );

  return results; // List of programs that satisfy all examples
}
```

### JavaScript Subset for Synthesis

We don't need full JavaScript - a focused subset for data extraction:

1. **Literals**: numbers, strings, regex patterns
2. **Variables**: input, intermediate values
3. **Operators**: +, -, *, /, string concatenation
4. **String ops**: match, replace, split, substring
5. **Number ops**: parseInt, parseFloat
6. **Conditionals**: if expressions
7. **Array ops**: map, filter, reduce (for processing grep results)

### Integration with RLM

**Turn 1: Exploration**
```
LLM: grep("SALES") → finds sales data lines
System: Collects examples automatically
System: Detects patterns (SALES_DATA_REGION: $X,XXX,XXX)
```

**Turn 2: Constraint Generation**
```
System: "I found 5 currency values. Provide constraints for extraction."
LLM: "Extract numeric value after $ symbol, remove commas, parse as integer"
     Examples: "$2,340,000" → 2340000, "$3,120,000" → 3120000
```

**Turn 3: Synthesis (Inner Loop)**
```
System: Uses miniKanren to search for programs
Candidate 1: input.match(/\$([0-9,]+)/)[1].replace(/,/g, '') → parseInt
Test on all examples: PASS
Return synthesized code
```

**Turn 4: Execution**
```
System: Runs synthesized code on all grep results
Result: Total = $13,000,000
LLM: Accepts result, provides final answer
```

## Implementation Plan

### Phase 1: Core Synthesis Engine
1. Install and integrate ramo (miniKanren for JS)
2. Build relational interpreter for JS subset
3. Implement synthesis function from examples

### Phase 2: LLM Integration
1. Modify LLM prompts to generate constraints, not code
2. Build constraint parser (LLM output → synthesis request)
3. Implement example collector from grep results

### Phase 3: Evolution Loop
1. Implement inner loop (synthesis search with refinement)
2. Implement outer loop (LLM evaluation and re-constraint)
3. Add knowledge base for reusable components

### Phase 4: Testing & Refinement
1. Test on scattered-data.txt benchmark
2. Tune synthesis search parameters
3. Optimize for common patterns

## Key Differences from Current Implementation

| Aspect | Current (Wrong) | Correct (Barliman) |
|--------|----------------|-------------------|
| LLM role | Writes code | Provides constraints |
| Synthesis | Optional tool | Core engine |
| Search | None | miniKanren search |
| Evolution | None | Inner/outer loops |
| Code quality | LLM quality | Provably correct |
