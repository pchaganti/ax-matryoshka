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

- **RLM Entry** (`src/rlm.ts`): Main entry point, document loading, config
- **FSM Engine** (`src/fsm/engine.ts`): Generic finite state machine runner
- **RLM States** (`src/fsm/rlm-states.ts`): Analysis pipeline states (query_llm → parse_response → validate → execute → analyze → check_final_answer → done)
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

### Handle System

Query results are stored server-side as handles (e.g., `$res1`). You receive compact stubs instead of full data, saving 97%+ tokens. Use `lattice_expand` to inspect actual content when needed.

- **`lattice_expand`** - View full data from a handle (supports `limit`, `offset`, `format`)
- **`lattice_bindings`** - Show all active handles and their stubs
- **`lattice_reset`** - Clear all handles but keep the document loaded
- **`lattice_status`** - Session info, active handles, timeout

### Common Queries

#### Search
```scheme
(grep "pattern")                    ; Regex search
(bm25 "query terms" 10)            ; BM25 ranked keyword search
(semantic "query terms" 10)         ; TF-IDF cosine similarity search
(fuzzy_search "query" 10)          ; Fuzzy text search
(text_stats)                        ; Document statistics
(lines 10 20)                       ; Get specific line range (1-indexed)
```

#### Symbol Operations (.ts, .js, .py, .go, .md, etc.)
```scheme
(list_symbols)                      ; List all symbols (functions, classes, headings, etc.)
(list_symbols "function")           ; Filter by kind: "function", "class", "method", "interface", "type", "struct"
(get_symbol_body "funcName")        ; Get source code for a symbol
(get_symbol_body RESULTS)           ; Get source code from previous query result
(find_references "identifier")      ; Find all references to an identifier
```

#### Graph Operations (knowledge graph for code structure)
```scheme
(callers "funcName")                ; Who calls this function?
(callees "funcName")                ; What does this function call?
(ancestors "ClassName")             ; Inheritance chain (extends)
(descendants "ClassName")           ; All subclasses (transitive)
(implementations "InterfaceName")   ; Classes implementing this interface
(dependents "name")                 ; All transitive dependents
(dependents "name" 2)               ; Dependents within depth limit
(symbol_graph "name" 1)             ; Neighborhood subgraph around symbol
```

#### Collection Operations
```scheme
(count RESULTS)                     ; Count items
(sum RESULTS)                       ; Sum numeric values
(reduce RESULTS init fn)            ; Generic reduce
(map RESULTS (lambda (x) (match x "regex" 1)))   ; Extract/transform data
(filter RESULTS (lambda (x) (match x "pat" 0)))  ; Filter results
```

#### Predicates (for filter)
```scheme
(lambda (x) (match x "pattern" group))           ; Regex match predicate
(classify "line1" true "line2" false)             ; Build classifier from examples
```

#### String Operations
```scheme
(match str "pattern" 1)             ; Extract regex group
(replace str "from" "to")          ; Replace pattern in string
(split str "delim" index)          ; Split and get part at index
(parseInt str)                      ; Parse string to integer
(parseFloat str)                    ; Parse string to float
```

#### Type Coercion
```scheme
(parseDate str)                     ; Parse date string to ISO format
(parseCurrency str)                 ; Parse currency string to number
(parseNumber str)                   ; Parse numeric string with separators
(coerce term "type")                ; Coerce to: date/currency/number/boolean/string
```

#### Synthesis
```scheme
(synthesize (example "in1" out1) (example "in2" out2) ...)  ; Synthesize function from examples
```

#### Variables
```scheme
RESULTS                             ; Last array result (auto-bound)
_1, _2, _3, ...                    ; Results from turn N (auto-bound)
context                             ; Raw document content
```

Note: `$res1`, `$res2`, etc. are handle stubs for `lattice_expand` only. Use `RESULTS` or `_1`, `_2`, `_3` to reference previous results in queries.

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

### Example Workflows

#### Symbol Workflow
```
1. (list_symbols "function")         → $res1: Array(15) [preview]
2. (get_symbol_body "myFunction")    → Returns source code directly
3. (find_references "myFunction")    → $res2: Array(8) [references]
```

#### Graph Workflow
```
1. (callers "handleRequest")         → $res1: Array(3) [who calls it]
2. (callees "handleRequest")         → $res2: Array(5) [what it calls]
3. (ancestors "MyService")           → $res3: [BaseService, EventEmitter]
4. (symbol_graph "handleRequest" 2)  → Subgraph: 12 nodes, 15 edges
```

#### Markdown Workflow
```
1. (list_symbols)                    → $res1: Array(12) [# Intro, ## Setup, ...]
2. (grep "## Installation")         → Find specific section content
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
