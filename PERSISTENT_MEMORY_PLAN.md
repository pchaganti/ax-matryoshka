# Persistent Memory Implementation Plan

## Overview

Upgrade the in-memory RAG system to SQLite-backed persistent storage, enabling the system to learn from successful runs and improve over time.

## Current State

We already have:
- `src/rag/knowledge-base.ts` - Static expert examples
- `src/rag/similarity.ts` - TF-IDF similarity without external deps
- `src/rag/manager.ts` - RAG manager with hint retrieval and session failure memory
- Integration with adapters via `RAGHints` interface
- Integration with RLM loop for failure recording

## Design Principles

1. **Incremental Enhancement** - SQLite is optional; system falls back to in-memory
2. **Lightweight** - Use existing TF-IDF similarity, defer vector search
3. **Learn from Success** - Record blueprints that reach `<<<FINAL>>>`
4. **Local-First** - No external API calls for embeddings

---

## Phase 1: SQLite Storage Layer

### 1.1 Add Dependency

```bash
npm install better-sqlite3
npm install -D @types/better-sqlite3
```

### 1.2 Create Database Schema (`src/rag/db/schema.ts`)

```typescript
export const SCHEMA = `
-- Learned blueprints from successful runs
CREATE TABLE IF NOT EXISTS blueprints (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  task_type TEXT NOT NULL,           -- 'aggregation', 'search', 'extraction', etc.
  query_intent TEXT NOT NULL,        -- Original user query
  code_snippet TEXT NOT NULL,        -- The successful code
  success_count INTEGER DEFAULT 1,   -- Incremented on reuse success
  failure_count INTEGER DEFAULT 0,   -- Incremented on reuse failure
  avg_turns REAL,                    -- Average turns to completion
  created_at TEXT DEFAULT (datetime('now')),
  last_used_at TEXT DEFAULT (datetime('now'))
);

-- Keyword index for fast retrieval
CREATE TABLE IF NOT EXISTS blueprint_keywords (
  blueprint_id INTEGER NOT NULL,
  keyword TEXT NOT NULL,
  FOREIGN KEY (blueprint_id) REFERENCES blueprints(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_keywords ON blueprint_keywords(keyword);
CREATE INDEX IF NOT EXISTS idx_task_type ON blueprints(task_type);
CREATE INDEX IF NOT EXISTS idx_success ON blueprints(success_count DESC);
`;
```

### 1.3 Create Storage Service (`src/rag/db/storage.ts`)

```typescript
interface Blueprint {
  id: number;
  task_type: string;
  query_intent: string;
  code_snippet: string;
  success_count: number;
  failure_count: number;
  avg_turns: number | null;
}

interface BlueprintStorage {
  // Retrieval
  findByKeywords(keywords: string[], limit?: number): Blueprint[];
  findByTaskType(taskType: string, limit?: number): Blueprint[];
  findBest(limit?: number): Blueprint[];

  // Learning
  recordSuccess(query: string, code: string, taskType: string, turns: number): void;
  incrementSuccess(id: number, turns: number): void;
  incrementFailure(id: number): void;

  // Management
  prune(minScore?: number): number;  // Remove low-scoring blueprints
  getStats(): { total: number; byType: Record<string, number> };
}
```

### 1.4 Implement SQLite Storage (`src/rag/db/sqlite-storage.ts`)

Key implementation details:
- Use `better-sqlite3` synchronous API for simplicity
- Extract keywords using existing `tokenize()` from similarity.ts
- Calculate score as: `success_count / (success_count + failure_count)`
- Support optional DB path (defaults to `~/.matryoshka/memory.db`)

---

## Phase 2: Unified RAG Manager

### 2.1 Extend RAGManager (`src/rag/manager.ts`)

Add persistence layer integration:

```typescript
interface RAGManagerOptions {
  /** Enable SQLite persistence (default: false for backwards compat) */
  persistent?: boolean;
  /** Custom DB path */
  dbPath?: string;
}

class RAGManager {
  private storage: BlueprintStorage | null = null;

  constructor(options: RAGManagerOptions = {}) {
    if (options.persistent) {
      this.storage = createSQLiteStorage(options.dbPath);
    }
    // ... existing initialization
  }

  getHints(query: string, topK: number = 2): Hint[] {
    const hints: Hint[] = [];

    // 1. Static expert examples (always available)
    hints.push(...this.getStaticHints(query, topK));

    // 2. Learned blueprints from DB (if persistent)
    if (this.storage) {
      hints.push(...this.getLearnedHints(query, topK));
    }

    // Merge, deduplicate, sort by score
    return this.mergeAndRank(hints, topK);
  }
}
```

### 2.2 Add Learning Interface

```typescript
interface LearningOutcome {
  query: string;
  code: string;
  taskType: string;
  turns: number;
  success: boolean;
}

class RAGManager {
  recordOutcome(outcome: LearningOutcome): void {
    if (!this.storage) return;

    if (outcome.success) {
      // Check if similar blueprint exists
      const existing = this.findSimilarBlueprint(outcome.code);
      if (existing) {
        this.storage.incrementSuccess(existing.id, outcome.turns);
      } else {
        this.storage.recordSuccess(
          outcome.query,
          outcome.code,
          outcome.taskType,
          outcome.turns
        );
      }
    } else {
      // Record failure if we used a learned blueprint
      const used = this.lastUsedBlueprint;
      if (used) {
        this.storage.incrementFailure(used.id);
      }
    }
  }
}
```

---

## Phase 3: RLM Integration

### 3.1 Update RLMOptions (`src/rlm.ts`)

```typescript
interface RLMOptions {
  // ... existing options

  /** Enable persistent memory (default: false) */
  persistentMemory?: boolean;

  /** Path to memory database */
  memoryDbPath?: string;
}
```

### 3.2 Track Successful Code

Modify the RLM loop to:
1. Track which code blocks executed successfully
2. On `<<<FINAL>>>`, record the successful patterns
3. Classify the task type based on the query

```typescript
// In runRLM, after successful completion:
if (ragManager && options.persistentMemory) {
  const taskType = classifyTaskType(query);  // Simple keyword classifier
  const successfulCode = extractSuccessfulCode(history);

  ragManager.recordOutcome({
    query,
    code: successfulCode,
    taskType,
    turns: turn,
    success: true,
  });
}
```

### 3.3 Task Type Classifier (`src/rag/classifier.ts`)

Simple keyword-based classifier:

```typescript
const TASK_PATTERNS: Record<string, RegExp[]> = {
  aggregation: [/sum|total|add up|count|average|mean/i],
  search: [/find|search|locate|where|which/i],
  extraction: [/extract|parse|get|pull out/i],
  table: [/table|csv|column|row|grid/i],
  currency: [/dollar|\$|price|cost|money|revenue|sales/i],
  date: [/date|time|when|year|month|day/i],
};

function classifyTaskType(query: string): string {
  for (const [type, patterns] of Object.entries(TASK_PATTERNS)) {
    if (patterns.some(p => p.test(query))) {
      return type;
    }
  }
  return 'general';
}
```

---

## Phase 4: Seed Data & Golden Blueprints

### 4.1 Initial Seed (`src/rag/db/seed.ts`)

Pre-populate with proven patterns:

```typescript
const GOLDEN_BLUEPRINTS = [
  {
    task_type: 'aggregation',
    query_intent: 'sum currency values',
    code_snippet: `// Pattern: Currency Aggregation
const hits = grep("\\\\$");
let total = 0;
for (const hit of hits) {
  const match = hit.line.match(/\\$([\\d,]+)/);
  if (match) {
    total += parseFloat(match[1].replace(/,/g, ""));
  }
}
console.log("Total:", total);`,
    success_count: 10,  // Start with high confidence
  },
  // ... more golden blueprints
];
```

### 4.2 Seed on First Run

```typescript
function initializeDatabase(db: Database): void {
  db.exec(SCHEMA);

  const count = db.prepare('SELECT COUNT(*) as n FROM blueprints').get();
  if (count.n === 0) {
    seedGoldenBlueprints(db, GOLDEN_BLUEPRINTS);
  }
}
```

---

## Phase 5: Future Enhancements (Deferred)

### 5.1 Vector Search (Optional)

If needed later, add `sqlite-vec` for semantic search:

```typescript
// Only if @xenova/transformers is available
import { pipeline } from '@xenova/transformers';

async function getEmbedding(text: string): Promise<Float32Array> {
  const embedder = await pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2');
  const output = await embedder(text, { pooling: 'mean', normalize: true });
  return new Float32Array(output.data);
}
```

### 5.2 Blueprint Quality Scoring

Decay scores over time, weight by:
- Success rate: `success / (success + failure)`
- Recency: Prefer recently used
- Efficiency: Prefer fewer turns

---

## Implementation Order

| Step | Files | Effort | Risk |
|------|-------|--------|------|
| 1 | `src/rag/db/schema.ts` | Low | Low |
| 2 | `src/rag/db/sqlite-storage.ts` | Medium | Low |
| 3 | `src/rag/classifier.ts` | Low | Low |
| 4 | Update `src/rag/manager.ts` | Medium | Medium |
| 5 | Update `src/rlm.ts` | Medium | Medium |
| 6 | `src/rag/db/seed.ts` | Low | Low |
| 7 | Tests for all new modules | Medium | Low |

**Total Estimate**: ~4-6 hours of implementation

---

## Testing Strategy

1. **Unit Tests**
   - SQLite storage CRUD operations
   - Task type classifier
   - Blueprint deduplication logic

2. **Integration Tests**
   - RAG manager with persistence enabled
   - Learning from successful RLM runs
   - Blueprint retrieval affects hints

3. **E2E Tests**
   - Full RLM run → learns → second run uses learned pattern

---

## Configuration

Add to `config.json`:

```json
{
  "memory": {
    "persistent": true,
    "dbPath": "~/.matryoshka/memory.db",
    "maxBlueprints": 1000,
    "pruneThreshold": 0.2
  }
}
```

---

## Rollback Strategy

The implementation is additive and non-breaking:
- `persistentMemory: false` (default) = current behavior
- SQLite is optional dependency
- Existing in-memory RAG continues to work
- Can disable at runtime via config
