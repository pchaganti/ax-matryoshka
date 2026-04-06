# Claude Code Guidelines for recursive-language-model

## CRITICAL: No Hardcoding

**DO NOT hardcode specific use cases into the prompts or code.**

This is a GENERAL-PURPOSE document analysis tool. It can be used for:
- Log analysis
- Financial documents
- Scientific data
- Weather reports
- Any structured or semi-structured text

When writing prompts or examples:
- Use GENERIC patterns, not domain-specific ones
- Say "data" not "sales data"
- Say "values" not "currency values"
- Say "pattern" not "$1,000"
- Let the LLM discover the actual data format from the document

**Bad examples (too specific):**
```javascript
const hits = grep("SALES_DATA");
const extractor = synthesize_extractor([
  { input: "$1,000", output: 1000 }
]);
```

**Good examples (generic):**
```javascript
const hits = grep("YOUR_PATTERN");
const extractor = synthesize_extractor([
  { input: examples[0], output: expectedOutput0 }
]);
```

## Architecture Overview

- **RLM Loop** (`src/rlm.ts`): Main execution loop
- **Adapters** (`src/adapters/`): Model-specific prompting
- **Synthesis** (`src/synthesis/`): miniKanren-based program synthesis
- **Sandbox** (`src/synthesis/sandbox-tools.ts`): Safe code execution

## Key Principle: Barliman-Style Synthesis

The LLM provides CONSTRAINTS (input/output examples), NOT code implementations.
The synthesizer builds programs automatically from examples.

## Using Nucleus for Large File Analysis

When you need to analyze files larger than ~500 lines, use the Nucleus tool instead of reading files directly. This saves 80%+ tokens.

### Recommended Workflow for Codebase Analysis
1. **Use Glob first** to discover all relevant files (e.g., `**/*.py`, `**/*.ts`)
2. **Read small files directly** (<300 lines) - Nucleus is overkill for these
3. **Use Nucleus only for large files** (>500 lines)
4. **Aggregate data across ALL files**, not just the largest one

This workflow ensures complete analysis. Using Nucleus alone misses:
- Small config/utility files with important details
- Multi-file patterns (imports, classes across files)
- File discovery and project structure

### When to Use Nucleus
- File is >500 lines
- You need multiple searches on the same file
- You're extracting or aggregating structured data
- Exploratory analysis (don't know what you're looking for)

### When NOT to Use
- File is <300 lines (just read it directly)
- You only need one search
- You need full document context/structure
- You haven't discovered files yet (use Glob first)

### Quick Start (Programmatic)
```typescript
import { PipeAdapter } from "./src/tool/adapters/pipe.ts";

const nucleus = new PipeAdapter();
await nucleus.executeCommand({ type: "load", filePath: "./large-file.txt" });

// Search - returns only matching lines
const result = await nucleus.executeCommand({
  type: "query",
  command: '(grep "pattern")'
});

// Chain operations - RESULTS persists
await nucleus.executeCommand({ type: "query", command: "(count RESULTS)" });
await nucleus.executeCommand({ type: "query", command: "(sum RESULTS)" });
```

### Common Queries
```scheme
(grep "pattern")                    ; Search for regex pattern
(bm25 "query terms" 10)            ; BM25 ranked keyword search
(semantic "query terms" 10)         ; TF-IDF cosine similarity search
(fuzzy_search "query" 10)          ; Fuzzy text search
(count RESULTS)                     ; Count matches
(sum RESULTS)                       ; Sum numeric values
(map RESULTS (lambda x (match x "regex" 1)))  ; Extract data
(filter RESULTS (lambda x (match x "pat" 0))) ; Filter results
(lines 10 20)                       ; Get specific line range
```

### Multi-Signal Search Pipeline
```scheme
;; Fuse multiple search signals using Reciprocal Rank Fusion
(fuse (grep "ERROR") (bm25 "error handling") (semantic "failure"))

;; Remove false positives with gravity dampening
(dampen (bm25 "database error") "database error")

;; Q-value learning reranker (learns across turns)
(rerank (fuse (grep "ERROR") (bm25 "error")))

;; Full pipeline
(rerank (dampen (fuse (grep "ERROR") (bm25 "error") (semantic "failure")) "error"))
```

### HTTP Server Option
```bash
# Start server
npx tsx src/tool/adapters/http.ts --port 3456

# Load document
curl -X POST http://localhost:3456/load -d '{"filePath":"./file.txt"}'

# Query
curl -X POST http://localhost:3456/query -d '{"command":"(grep \"ERROR\")"}'
```
