---
name: analyze
description: Analyze documents larger than the context window using the RLM (Recursive Language Model) approach. Use this when you need to extract specific data, find patterns, or answer questions about large documents with precision.
---

# Document Analysis with RLM

Use the `analyze_document` tool from the RLM MCP server to analyze documents that are too large for direct context or require precise data extraction.

## When to Use

- Document exceeds context window
- Need to find specific data scattered throughout a file
- Require precise numerical calculations (sums, counts, etc.)
- Want to avoid hallucination on factual queries

## How It Works

The RLM approach has the LLM output Nucleus S-expression commands that a logic engine executes against the document:

1. Uses `(grep "pattern")` to search for relevant data
2. Uses `(filter RESULTS ...)` to narrow results
3. Uses `(count RESULTS)` or `(sum RESULTS)` to aggregate
4. Returns verified, grounded results

Results are stored server-side as handles, achieving 97%+ token savings.

## Usage

Call the `analyze_document` tool with:

| Parameter | Required | Description |
|-----------|----------|-------------|
| `query` | Yes | The question or task (be specific for best results) |
| `filePath` | Yes | Absolute path to the document |
| `maxTurns` | No | Max exploration iterations (default: 10) |
| `timeoutMs` | No | Timeout per turn in ms (default: 30000) |

## Examples

**Find and count patterns:**
```
Use analyze_document to find all entries matching a pattern in /path/to/data.txt and count them
```

**Extract specific data:**
```
Use analyze_document to find all lines matching a pattern in /path/to/logs.txt and count occurrences
```

**Summarize structure:**
```
Use analyze_document to find all section headers in /path/to/document.md and list them with line numbers
```

## Tips for Best Results

- Be specific about what patterns or data to look for
- Mention data formats if known (e.g., "lines starting with a specific prefix")
- For numerical queries, ask for the calculation method
