---
name: lattice
description: Analyze large files (>500 lines) using handle-based Nucleus queries for 97% token savings. Use when you need to search, filter, aggregate, or explore documents too large for direct context.
---

# Lattice - Large File Analysis

Use the Lattice MCP tools to analyze files that are too large to read directly. Lattice stores query results server-side and returns compact handle stubs, achieving 97%+ token savings.

## When to Use

- File is **larger than 500 lines** (for smaller files, use Read directly)
- You need **multiple searches** on the same file
- You're **extracting or aggregating** structured data (counts, sums, patterns)
- You're doing **exploratory analysis** and don't know what you're looking for
- You want to **avoid hallucination** on factual queries about file contents

## Core Workflow

The standard workflow is: **load → query → expand → close**

1. `lattice_load` — Open the file (starts a session)
2. `lattice_query` — Run Nucleus S-expression commands (returns handle stubs like `$res1`)
3. `lattice_expand` — Inspect actual data from a handle when you need to see contents
4. `lattice_close` — End the session when done

### Efficiency Tips

- **Chain operations in sequence** rather than making many independent queries. Use `RESULTS` to refer to the previous result and build a pipeline in a single query session.
- **Start broad, then narrow**: `grep` first, then `filter`, then `count`/`sum`.
- **Only expand when needed**: Handle stubs give you counts and previews — expand only when you need to see actual data for decision-making.
- Prefer `(count RESULTS)` or `(sum RESULTS)` over expanding and counting client-side.

## Nucleus Command Reference

### Search
```scheme
(grep "pattern")              ; Regex search — returns handle to matching lines
(fuzzy_search "query" 10)     ; Fuzzy match — top N results by relevance
(lines 10 20)                 ; Get specific line range (start end)
```

### Transform
```scheme
(filter RESULTS (lambda x (match x "pattern" 0)))   ; Keep matching items
(map RESULTS (lambda x (match x "(\\d+)" 1)))       ; Extract regex group from each item
```

### Aggregate
```scheme
(count RESULTS)               ; Count items (returns scalar directly)
(sum RESULTS)                 ; Sum numeric values (auto-extracts numbers)
```

### Extract
```scheme
(match str "pattern" 1)       ; Extract regex capture group from a string
```

### Code & Document Symbols (for .ts, .js, .py, .go, .rs, .md, etc.)
```scheme
(list_symbols)                ; List all functions, classes, methods, headings, etc.
(list_symbols "function")     ; Filter by kind: "function", "class", "method", "interface", "type"
(get_symbol_body "funcName")  ; Get full source code of a symbol
(find_references "identifier"); Find all usages of an identifier
```

## Variable Bindings

- **`RESULTS`** — Always points to the last array result. Use this in queries to chain operations.
- **`_1`, `_2`, `_3`, ...** — Results from turn N. Use to reference older results in queries.
- **`$res1`, `$res2`, ...** — Handle stubs. Use these ONLY with `lattice_expand`, NOT in queries.

## Complete Workflow Example

**Task: Find and count timeout errors in a log file**

1. Load the document:
   ```
   lattice_load("/path/to/server.log")
   ```
   → `Loaded: 15,234 lines, 2.1 MB`

2. Search for errors:
   ```
   lattice_query('(grep "ERROR")')
   ```
   → `$res1: Array(342) [2024-01-15 ERROR: Connection timeout...]`

3. Filter for timeouts:
   ```
   lattice_query('(filter RESULTS (lambda x (match x "timeout" 0)))')
   ```
   → `$res2: Array(47) [2024-01-15 ERROR: Connection timeout...]`

4. Count them:
   ```
   lattice_query('(count RESULTS)')
   ```
   → `Result: 47`

5. Inspect a sample if needed:
   ```
   lattice_expand("$res2", limit=5)
   ```
   → Shows first 5 actual timeout error lines

6. Close when done:
   ```
   lattice_close()
   ```

## Code Analysis Workflow

**Task: Understand a large TypeScript file**

1. Load and list symbols:
   ```
   lattice_load("/path/to/large-module.ts")
   lattice_query('(list_symbols)')
   ```
   → `$res1: Array(45) [function handleRequest, class Router, ...]`

2. Get a specific function:
   ```
   lattice_query('(get_symbol_body "handleRequest")')
   ```
   → Returns full source code of the function

3. Find all references:
   ```
   lattice_query('(find_references "handleRequest")')
   ```
   → `$res2: Array(8) [line 45: handleRequest(req), ...]`
