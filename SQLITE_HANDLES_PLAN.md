# SQLite Handle-Based Architecture Plan

## Overview

Transform Matryoshka from an in-memory, token-heavy architecture to a handle-based, SQLite-backed system that dramatically reduces context window usage while enabling powerful server-side data operations.

## Current Architecture Pain Points

1. **Token Burn**: Full results are serialized into LLM context (`memory.push(results)`)
2. **No Persistence**: State lost between sessions
3. **Linear Search**: `grep()` scans entire document every turn
4. **No Indexing**: Same queries re-executed repeatedly
5. **Memory Growth**: Large results stay in RAM indefinitely

## Proposed Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                         LLM Context                              │
│  Sees: $res1: Array(1500) [preview: {status: "error"}, ...]     │
│  NOT:  1500 full objects                                         │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                    Handle Registry                               │
│  $res1 → table: results_1, rows: 1500, schema: {status, msg}    │
│  $res2 → table: results_2, rows: 23, schema: {status, msg}      │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                 SQLite In-Memory Database                        │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────────┐  │
│  │ document_idx │  │ results_1    │  │ session_checkpoints  │  │
│  │ (FTS5)       │  │ (JSON rows)  │  │ (bindings, state)    │  │
│  └──────────────┘  └──────────────┘  └──────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
```

---

## Phase 1: SQLite Foundation (Core Infrastructure)

### 1.1 Create SQLite Session Manager

**File**: `src/persistence/session-db.ts`

```typescript
interface SessionDB {
  // Lifecycle
  create(sessionId?: string): string;  // Returns sessionId
  close(sessionId: string): void;

  // Document indexing
  indexDocument(content: string): void;

  // Handle operations
  storeResult(data: unknown[]): Handle;  // Returns $resN
  getHandle(handleId: string): HandleMetadata;

  // Queries
  search(pattern: string): Handle;  // FTS5 search
  sql(query: string, params?: unknown[]): Handle;
}

interface Handle {
  id: string;           // "$res1"
  table: string;        // "results_1"
  rowCount: number;
  schema: ColumnInfo[];
  preview: unknown[];   // First 3-5 items
}

interface HandleMetadata {
  id: string;
  rowCount: number;
  schema: ColumnInfo[];
  createdAt: Date;
  sourceOp: string;     // "grep", "filter", etc.
}
```

### 1.2 Schema Design

```sql
-- Document line index with FTS5
CREATE VIRTUAL TABLE document_lines USING fts5(
  line_num,
  content,
  tokenize='porter unicode61'
);

-- Dynamic result tables (created per handle)
-- Example: results_1, results_2, etc.
CREATE TABLE results_N (
  row_id INTEGER PRIMARY KEY,
  data JSON  -- Full row data
);

-- Handle registry
CREATE TABLE handles (
  handle_id TEXT PRIMARY KEY,  -- "$res1"
  table_name TEXT,
  row_count INTEGER,
  schema JSON,
  source_operation TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Session checkpoints
CREATE TABLE checkpoints (
  checkpoint_id INTEGER PRIMARY KEY,
  session_id TEXT,
  turn_number INTEGER,
  bindings JSON,
  handle_refs JSON,  -- Which handles exist
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

### 1.3 Dependencies

```bash
npm install better-sqlite3
npm install -D @types/better-sqlite3
```

Using `better-sqlite3` for:
- Synchronous API (simpler integration)
- In-memory mode (`:memory:`)
- FTS5 support out of the box
- Fast JSON operations

---

## Phase 2: Handle-Based Variable Registry

### 2.1 Handle Creation & Metadata

**File**: `src/persistence/handle-registry.ts`

```typescript
class HandleRegistry {
  private db: Database;
  private handleCounter = 0;

  // Store array data, return handle
  store(data: unknown[], sourceOp: string): Handle {
    const handleId = `$res${++this.handleCounter}`;
    const tableName = `results_${this.handleCounter}`;

    // Create table and insert data
    this.createResultTable(tableName, data);

    // Register handle
    const schema = this.inferSchema(data[0]);
    const preview = data.slice(0, 5);

    this.db.exec(`
      INSERT INTO handles (handle_id, table_name, row_count, schema, source_operation)
      VALUES (?, ?, ?, ?, ?)
    `, [handleId, tableName, data.length, JSON.stringify(schema), sourceOp]);

    return { id: handleId, table: tableName, rowCount: data.length, schema, preview };
  }

  // Get metadata stub for LLM context
  getStub(handleId: string): string {
    const meta = this.getMetadata(handleId);
    return `${handleId}: Array(${meta.rowCount}) [${this.formatPreview(meta)}]`;
  }
}
```

### 2.2 LLM Context Integration

Modify `src/rlm.ts` to use stubs instead of full data:

```typescript
// BEFORE (current)
solverBindings.set("RESULTS", grepResult);  // Full 1500 objects in context

// AFTER (with handles)
const handle = registry.store(grepResult, "grep");
solverBindings.set("RESULTS", handle.id);  // Just "$res1"

// When building LLM context:
function buildContextWithHandles(bindings: Map<string, unknown>): string {
  const stubs: string[] = [];
  for (const [key, value] of bindings) {
    if (typeof value === 'string' && value.startsWith('$res')) {
      stubs.push(`${key} = ${registry.getStub(value)}`);
    } else {
      stubs.push(`${key} = ${JSON.stringify(value)}`);
    }
  }
  return stubs.join('\n');
}
```

### 2.3 Preview & Describe Tools

**New Nucleus commands**:

```scheme
;; Peek at handle data
(preview $res1 5)        ;; Returns first 5 rows
(preview $res1 5 10)     ;; Returns rows 10-15

;; Get schema and stats
(describe $res1)         ;; Returns {rowCount, schema, sampleValues}

;; Sample random rows
(sample $res1 3)         ;; Returns 3 random rows
```

---

## Phase 3: Server-Side Handle Operations

### 3.1 Filter/Map/Reduce on Handles

**File**: `src/persistence/handle-ops.ts`

```typescript
class HandleOperations {
  // Filter without loading into context
  filter(handleId: string, predicate: string): Handle {
    const meta = registry.getMetadata(handleId);

    // Compile predicate to SQL WHERE clause
    const whereClause = this.predicateToSQL(predicate);

    const newHandle = registry.createHandle();
    this.db.exec(`
      INSERT INTO ${newHandle.table} (data)
      SELECT data FROM ${meta.table}
      WHERE ${whereClause}
    `);

    return newHandle;
  }

  // Count without loading
  count(handleId: string): number {
    const meta = registry.getMetadata(handleId);
    return this.db.prepare(`SELECT COUNT(*) FROM ${meta.table}`).pluck().get();
  }

  // Aggregate operations
  sum(handleId: string, field: string): number {
    const meta = registry.getMetadata(handleId);
    return this.db.prepare(`
      SELECT SUM(json_extract(data, '$.${field}'))
      FROM ${meta.table}
    `).pluck().get();
  }

  // Map transformation (creates new handle)
  map(handleId: string, transform: string): Handle {
    // Transform is a JS expression or SQL projection
    // ...
  }
}
```

### 3.2 Predicate Compilation

Convert JS-style predicates to SQL:

```typescript
function predicateToSQL(predicate: string): string {
  // "item.status === 'error'" → "json_extract(data, '$.status') = 'error'"
  // "item.count > 10" → "json_extract(data, '$.count') > 10"
  // "item.name.includes('test')" → "json_extract(data, '$.name') LIKE '%test%'"

  return compilePredicate(predicate);
}
```

### 3.3 Nucleus Integration

Extend LC solver to recognize handle operations:

```scheme
;; These execute server-side, return new handles
(filter_handle $res1 "item.status === 'error'")  ;; → $res2
(map_handle $res1 "item.id")                      ;; → $res3
(sort_handle $res1 "item.timestamp" "desc")       ;; → $res4

;; These return scalars directly
(count_handle $res1)                              ;; → 1500
(sum_handle $res1 "amount")                       ;; → 45230.50

;; Materialize (bring into context when needed)
(take $res1 3)                                    ;; → [{...}, {...}, {...}]
```

---

## Phase 4: FTS5 Full-Text Search

### 4.1 Document Indexing

When document is loaded:

```typescript
function indexDocument(content: string, db: Database): void {
  const lines = content.split('\n');

  const insert = db.prepare(`
    INSERT INTO document_lines (line_num, content) VALUES (?, ?)
  `);

  const insertMany = db.transaction((lines: string[]) => {
    lines.forEach((line, i) => insert.run(i + 1, line));
  });

  insertMany(lines);
}
```

### 4.2 Search Tools

Replace `grep()` with FTS5:

```typescript
// BEFORE
function grep(pattern: string, context: string): GrepResult[] {
  const regex = new RegExp(pattern, 'gi');
  return context.split('\n')
    .map((line, i) => ({ line, lineNum: i + 1, match: regex.exec(line) }))
    .filter(r => r.match);
}

// AFTER
function search(query: string, db: Database): Handle {
  const results = db.prepare(`
    SELECT line_num, content,
           snippet(document_lines, 1, '<mark>', '</mark>', '...', 32) as snippet
    FROM document_lines
    WHERE content MATCH ?
    ORDER BY rank
  `).all(query);

  return registry.store(results, 'search');
}
```

### 4.3 Nucleus Search Commands

```scheme
;; Full-text search (uses FTS5)
(search "failed webhook")           ;; → $res1 (handle to matches)

;; SQL query (for power users)
(sql "SELECT * FROM document_lines WHERE content LIKE '%ERROR%' LIMIT 10")

;; Proximity search
(search "timeout NEAR/3 connection") ;; FTS5 proximity query
```

---

## Phase 5: Session Checkpoints

### 5.1 Checkpoint Storage

```typescript
interface Checkpoint {
  sessionId: string;
  turnNumber: number;
  bindings: Map<string, unknown>;
  handleRefs: string[];  // Which handles to preserve
  timestamp: Date;
}

class SessionManager {
  // Save checkpoint
  checkpoint(sessionId: string, turnNumber: number, bindings: Map<string, unknown>): void {
    const handleRefs = [...bindings.values()]
      .filter(v => typeof v === 'string' && v.startsWith('$res'));

    this.db.prepare(`
      INSERT INTO checkpoints (session_id, turn_number, bindings, handle_refs)
      VALUES (?, ?, ?, ?)
    `).run(sessionId, turnNumber, JSON.stringify([...bindings]), JSON.stringify(handleRefs));
  }

  // Resume from checkpoint
  resume(sessionId: string): { bindings: Map<string, unknown>, lastTurn: number } {
    const checkpoint = this.db.prepare(`
      SELECT * FROM checkpoints
      WHERE session_id = ?
      ORDER BY turn_number DESC
      LIMIT 1
    `).get(sessionId);

    return {
      bindings: new Map(JSON.parse(checkpoint.bindings)),
      lastTurn: checkpoint.turn_number
    };
  }
}
```

### 5.2 Session Persistence Options

```typescript
interface SessionConfig {
  mode: 'memory' | 'file' | 'shared';

  // memory: In-memory SQLite, lost on exit (default)
  // file: Persisted to disk, survives restart
  // shared: Named in-memory DB, shareable across processes

  dbPath?: string;  // For 'file' mode
  sessionId?: string;  // For 'shared' mode
}

function createSession(config: SessionConfig): SessionDB {
  let dbPath: string;
  switch (config.mode) {
    case 'memory':
      dbPath = ':memory:';
      break;
    case 'file':
      dbPath = config.dbPath!;
      break;
    case 'shared':
      dbPath = `file:${config.sessionId}?mode=memory&cache=shared`;
      break;
  }

  return new Database(dbPath);
}
```

---

## Phase 6: Nucleus Protocol Enhancement

### 6.1 Data-Flow Graph Expressions

Enable pipe-style data transformations:

```scheme
;; Multi-step pipeline as single expression
(pipe
  (search "timeout")                              ;; → $tmp1
  (filter_handle _ "line.includes('connection')") ;; → $tmp2 (uses _ for previous)
  (map_handle _ "lineNum")                        ;; → $tmp3
  (store_as $timeout_lines))                      ;; → $timeout_lines (named handle)

;; Equivalent to:
;; 1. search "timeout" → $res1
;; 2. filter_handle $res1 ... → $res2
;; 3. map_handle $res2 ... → $res3
;; 4. alias $res3 as $timeout_lines
```

### 6.2 Lazy Evaluation

Handles enable lazy evaluation - operations build a query plan, only materialize when needed:

```typescript
class LazyHandle {
  private operations: Operation[] = [];

  filter(predicate: string): LazyHandle {
    this.operations.push({ type: 'filter', predicate });
    return this;
  }

  map(transform: string): LazyHandle {
    this.operations.push({ type: 'map', transform });
    return this;
  }

  // Only execute when materializing
  materialize(limit?: number): unknown[] {
    const sql = this.compileToSQL();
    return this.db.prepare(sql).all();
  }

  private compileToSQL(): string {
    // Build optimized SQL from operation chain
    // SQLite's query planner handles optimization
  }
}
```

---

## Implementation Order

### Week 1: Foundation
1. [ ] Add `better-sqlite3` dependency
2. [ ] Create `src/persistence/session-db.ts` - basic SQLite wrapper
3. [ ] Create `src/persistence/handle-registry.ts` - handle management
4. [ ] Create schema (FTS5 index, handles table, checkpoints)

### Week 2: Integration
5. [ ] Modify `src/rlm.ts` to use handles instead of raw arrays
6. [ ] Update context building to use metadata stubs
7. [ ] Add `preview`, `describe` commands to Nucleus
8. [ ] Replace `grep` with FTS5 search

### Week 3: Operations
9. [ ] Implement `filter_handle`, `count_handle`, `sum_handle`
10. [ ] Add predicate-to-SQL compilation
11. [ ] Implement `map_handle` with SQL projections
12. [ ] Add `sort_handle`, `take`, `skip` operations

### Week 4: Sessions & Polish
13. [ ] Implement session checkpoints
14. [ ] Add session resume capability
15. [ ] Create `pipe` expression support
16. [ ] Performance testing and optimization

---

## Token Savings Estimates

| Operation | Before (tokens) | After (tokens) | Savings |
|-----------|-----------------|----------------|---------|
| Store 1500 grep results | ~15,000 | ~50 (stub) | 99.7% |
| Filter to 23 results | ~15,000 (re-serialize) | ~30 (new stub) | 99.8% |
| Count results | ~15,000 | ~10 (scalar) | 99.9% |
| Sum field | ~15,000 | ~10 (scalar) | 99.9% |
| Preview 5 items | ~15,000 | ~500 | 96.7% |

**Typical 5-turn analysis session:**
- Before: ~75,000 tokens (results re-serialized each turn)
- After: ~2,000 tokens (stubs + final output only)
- **Overall savings: 97%**

---

## Migration Path

### Backward Compatibility

Keep existing tools working during transition:

```typescript
// Detect handle vs raw data
function resolveBinding(value: unknown): unknown {
  if (typeof value === 'string' && value.startsWith('$res')) {
    // It's a handle - materialize if needed
    return registry.materialize(value);
  }
  return value;  // Raw data, use as-is
}
```

### Feature Flags

```typescript
interface RLMConfig {
  useHandles: boolean;      // Default: true (new behavior)
  useFTS5: boolean;         // Default: true
  persistSession: boolean;  // Default: false (in-memory only)
}
```

---

## Files to Create

```
src/persistence/
├── session-db.ts        # SQLite database wrapper
├── handle-registry.ts   # Handle creation and metadata
├── handle-ops.ts        # Server-side operations
├── predicate-compiler.ts # JS predicate → SQL
├── fts5-search.ts       # Full-text search wrapper
└── checkpoint.ts        # Session checkpoint management

tests/persistence/
├── session-db.test.ts
├── handle-registry.test.ts
├── handle-ops.test.ts
└── fts5-search.test.ts
```

## Files to Modify

```
src/rlm.ts                    # Use handles, build stubs for context
src/logic/lc-solver.ts        # Add handle operations
src/tool/nucleus-engine.ts    # Initialize with SQLite
src/sandbox.ts                # Replace grep with search
```
