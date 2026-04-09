# Analysis Method Comparison: Lattice-MCP vs Direct Tools

## Executive Summary

Both methods successfully analyzed the anki-connect project and arrived at identical conclusions about the codebase
structure. The key difference lies in token efficiency vs depth of insight.

| Metric | Lattice-MCP | Direct Tools |
|--------|-------------|--------------|
| Estimated Tokens | ~2,030 | ~5,590 |
| Token Efficiency | 63% savings | baseline |
| Depth of Insight | Pattern-based | Full context |
| Best For | Large file scanning | Understanding implementation |

## Identical Findings

Both methods discovered:
- 1 main class (`AnkiConnect`)
- 146 instance methods
- 120 API endpoints (`@util.api()` decorated)
- 8 documentation categories
- 118 documented API actions
- 124 example JSON requests

## Method Comparison

### Lattice-MCP Approach

**How it works:**
1. Load file → returns only metadata (line count, size)
2. Query with S-expressions → returns only matching lines
3. Chain queries using `RESULTS` variable
4. Close session when done

**Strengths:**
- Dramatic token savings on large files
- Ideal for statistical analysis (counts, patterns)
- Can scan files of any size without context overflow
- Query results are immediately actionable

**Weaknesses:**
- No surrounding context for matches
- Cannot understand implementation details
- Requires learning S-expression query syntax
- Session-based (must load before querying)

**Example workflow:**
```
lattice_load("/path/to/large-file.py")     → "Loaded: 2,186 lines"
lattice_query('(grep "^class ")')          → "[65] class AnkiConnect:"
lattice_query('(grep "@util.api")')        → 120 matches shown
lattice_query('(count RESULTS)')           → "Result: 120"
lattice_close()
```

### Direct Tools Approach

**How it works:**
1. Glob to find files
2. Grep to search patterns (returns matches or counts)
3. Read to load full file contents when needed

**Strengths:**
- Full context available for understanding code
- No special syntax to learn
- Can read and understand implementation
- Better for code review/modification tasks

**Weaknesses:**
- Reading large files consumes many tokens
- May hit context limits on very large files
- Less efficient for pure pattern-matching tasks

**Example workflow:**
```
Glob("**/*.py")                            → 15 files found
Grep("^class ", path="file.py")            → "65:class AnkiConnect:"
Read("util.py")                            → Full 107 lines loaded
```

## Token Usage Breakdown

| Operation | Lattice-MCP | Direct Tools | Winner |
|-----------|-------------|--------------|--------|
| Load 2,186-line file | ~80 (metadata) | N/A | Lattice |
| Search for classes | ~50 | ~50 | Tie |
| Count 146 methods | ~400 (samples + count) | ~60 (count only) | Direct |
| Read util.py (107 lines) | N/A | ~1,100 | N/A |
| Read web.py (301 lines) | N/A | ~3,100 | N/A |
| **Total** | **~2,030** | **~5,590** | **Lattice** |

## When to Use Each Method

### Use Lattice-MCP When:
- File is >500 lines
- You need multiple searches on the same file
- Task is pattern-matching or statistical (counts, aggregations)
- You're exploring and don't know what you're looking for
- Context window is a concern

### Use Direct Tools When:
- File is <100 lines (just read it)
- You need to understand implementation details
- You'll modify the code after analysis
- You need surrounding context for matches
- Single search is sufficient

## Hybrid Approach (Recommended)

For comprehensive analysis, combine both methods:

1. **Discovery phase** (Lattice-MCP): Scan large files to identify patterns and locations
2. **Deep dive phase** (Direct Tools): Read specific small files or sections identified in discovery
3. **Verification phase** (Either): Confirm findings with targeted queries

This approach was demonstrated in this analysis:
- Lattice-MCP found the 120 API endpoints efficiently
- Direct Tools revealed the actual decorator implementation in util.py
- Both confirmed the same structural statistics

## Conclusion

Lattice-MCP provides ~63% token savings for pattern-matching tasks on large files. Direct tools provide deeper insight
when implementation understanding is required. The best approach combines both: use Lattice-MCP for discovery and
statistics, then Direct Tools for targeted deep dives into relevant code sections.
