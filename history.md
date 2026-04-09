This is a sophisticated move. By using **SQLite** as a "Long-Term Memory," you transform Matryoshka from a stateless tool into a **learning agent**. For a model like `qwen2.5-coder:7b`, having a persistent library of "what worked last time" compensates for its limited reasoning capacity.

Here is a 4-stage implementation plan to integrate SQLite-backed persistent memory and Code Blueprints into the Matryoshka architecture.

---

### 1. The Schema: "The Library of Success"

We need a table that stores not just the code, but the *context* of why it was written. Claude should implement a database schema that supports both keyword and semantic retrieval.

| Table: `blueprints` | Description |
| --- | --- |
| **id** | Primary Key |
| **task_type** | e.g., 'table_extraction', 'summarization', 'log_parsing' |
| **query_intent** | The original user prompt (for semantic matching) |
| **code_snippet** | The successful JavaScript block |
| **success_score** | Counter: increment when the model reaches `<<<FINAL>>>` |
| **metadata** | JSON blob: model used, document size, execution time |

---

### 2. The Retrieval Loop (RAG-lite)

Before Qwen starts its first turn, the system performs a "Memory Check."

1. **Intent Categorization:** The system runs a fast, cheap classification (or simple keyword match) on the user's query.
2. **Top-K Retrieval:** Query the SQLite DB:
* *Search 1:* `SELECT code_snippet FROM blueprints WHERE task_type = ? ORDER BY success_score DESC LIMIT 2`
* *Search 2 (Semantic):* If you use a vector extension like `sqlite-vec`, find code used for similar natural language intents.


3. **Context Injection:** The retrieved blueprints are injected into the system prompt as **"Expert Techniques for this Task."**

---

### 3. The Reinforcement Plan (Self-Improvement)

The system "improves through usage" by closing the feedback loop at the end of every successful run.

* **Positive Reinforcement:** When the model outputs `<<<FINAL>>>` and the user doesn't signal an error, the code block used in the final (or most productive) turn is saved/updated in the `blueprints` table.
* **Averaging Logic:** If a specific code structure fails (throws a sandbox error), we can decrement its `success_score` in the database so the RAG stops suggesting it.

---

### 4. Implementation Steps for Claude

#### Step 1: Initialize Persistent Storage

Create `src/db/memory.ts`.

> **Claude's Goal:** Set up `better-sqlite3` and define the `blueprints` table. Include a "seed" function to prepopulate the DB with your initial 3 Blueprints (Summarization, Regex, Table Extraction).

#### Step 2: The "Expert Witness" Adapter

Modify `src/adapters/base.ts`.

> **Claude's Goal:** Update the `buildSystemPrompt` function to be asynchronous. It should now call `db.getRelevantBlueprints(query)` and format the results as a "Reference Manual" for Qwen.

#### Step 3: The Post-Run "Commit"

Update the main RLM loop in `src/rlm.ts`.

> **Claude's Goal:** Add a `finally` block or a success handler that captures the `history` of the conversation. It should extract the code blocks that didn't crash and save them as new entries in SQLite.

---

### Example Blueprint: "Table Extraction"

If the user asks for a table, the RAG would feed Qwen this **Code Blueprint**:

```javascript
// Expert Pattern: Structural Extraction
const lines = context.split('\n');
const tableData = lines
  .filter(l => l.includes('|')) // Target markdown/ASCII tables
  .map(l => l.split('|').map(c => c.trim()));
memory.push(tableData);

```

**Why this helps Qwen:** Small models often try to process the whole document as a single string. This blueprint teaches it to **stream and filter**, which is much safer for the sandbox.

Starting with a solid foundation is key for a model like Qwen. We will focus on a **hybrid retrieval** approach: using SQLite for both metadata (task type) and semantic search (query intent) using the modern `sqlite-vec` extension, which is more lightweight and easier to bundle in Node.js than older alternatives.

### 1. The SQLite Schema

This schema is designed to store "Golden Blueprints" (hand-crafted experts) and "Learned Blueprints" (successful runs from the AI).

```sql
-- Core table for metadata and code
CREATE TABLE IF NOT EXISTS blueprints (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    task_type TEXT NOT NULL,         -- e.g., 'summarization', 'extraction'
    query_intent TEXT NOT NULL,      -- The original natural language prompt
    code_snippet TEXT NOT NULL,      -- The JS code that worked
    success_count INTEGER DEFAULT 1, -- Incremented on successful runs
    average_runtime REAL,            -- To prefer faster solutions
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Virtual table for semantic search (requires sqlite-vec extension)
-- This allows us to find code based on the 'meaning' of the query
CREATE VIRTUAL TABLE IF NOT EXISTS blueprints_vec USING vec0(
    id INTEGER PRIMARY KEY,
    query_embedding FLOAT[384]      -- Standard size for local embeddings (e.g., all-MiniLM-L6-v2)
);

```

---

### 2. The Three "Golden Blueprints" (The Seed Data)

These should be inserted during the first run to give Qwen a "head start."

#### Blueprint A: The "Big Document" Summarizer

* **Task Type:** `summarization`
* **Strategy:** Samples the document and uses recursive sub-calls.

```javascript
// Strategy: Distributed Sampling
const stats = text_stats();
const midPoint = Math.floor(stats.totalLines / 2);
// Sample start, middle, and end to avoid context overflow
const sample = [
  ...context.split('\n').slice(0, 20),
  "...[gap]...",
  ...context.split('\n').slice(midPoint, midPoint + 20),
  "...[gap]...",
  ...context.split('\n').slice(-20)
].join('\n');

const summary = await llm_query(`Summarize this representative sample: ${sample}`);
memory.push(summary);
// Signal completion
return `<<<FINAL>>>${memory.join('\n')}<<<END>>>`;

```

#### Blueprint B: The "Needle in a Haystack" (Regex/Search)

* **Task Type:** `search`
* **Strategy:** Uses `fuzzy_search` for high-speed indexing before deep analysis.

```javascript
// Strategy: Filtered Narrowing
const matches = fuzzy_search(query, 10);
if (matches.length === 0) {
  memory.push("No direct matches found. Expanding search...");
  // Fallback to broader keyword search if fuzzy fails
} else {
  const deepAnalysis = await llm_query(`Analyze these specific matches: ${JSON.stringify(matches)}`);
  memory.push(deepAnalysis);
}

```

#### Blueprint C: The "Structural Miner" (Table/Data Extraction)

* **Task Type:** `extraction`
* **Strategy:** Line-by-line streaming to avoid memory issues.

```javascript
// Strategy: Line-based Parsing
const rows = [];
const lines = context.split('\n');
for (const line of lines) {
  // Look for data patterns like currency or specific headers
  if (line.match(/\d+\.\d{2}/) || line.includes('|')) {
    rows.push(line.trim());
  }
}
memory.push({ extractedRows: rows.slice(0, 50) }); // Buffer results

```

---

### 3. Implementation Plan for Claude

1. **Add Dependencies:** Ask Claude to add `better-sqlite3` and `sqlite-vec` to `package.json`.
2. **Create `MemoryService`:**
* Implement a `findSimilarBlueprints(query)` method.
* Implement a `recordSuccess(query, code)` method that triggers at the end of the `rlm` loop.


3. **Prompt Refactor:** Update the system prompt in `src/adapters/base.ts` to include a section: `### EXAMPLES OF SUCCESSFUL LOGIC`.

---

### The Self-Improvement Diagram

As the system runs, it will populate the `blueprints` table. If Qwen generates a particularly clever way to parse a specific log format, that code is saved. The next time you ask a similar question, the RAG retrieves that *exact* snippet, and Qwen essentially "inherits" its own previous intelligence.

To implement this, we’ll use **`better-sqlite3`** for the database and **`sqlite-vec`** for the vector operations. To generate the embeddings locally (staying true to Matryoshka's local-first philosophy), we'll use **`@xenova/transformers`**.

Here is the TypeScript implementation for the `MemoryService`.

### 1. The Memory Service Implementation

```typescript
import Database from 'better-sqlite3';
import * as path from 'path';
import { pipeline } from '@xenova/transformers';

export interface Blueprint {
  task_type: string;
  query_intent: string;
  code_snippet: string;
  success_count: number;
}

export class MemoryService {
  private db: any;
  private embedder: any;

  constructor(dbPath: string = 'memory.db') {
    this.db = new Database(dbPath);
    this.init();
  }

  private async init() {
    // 1. Initialize Tables
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS blueprints (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        task_type TEXT,
        query_intent TEXT,
        code_snippet TEXT,
        success_count INTEGER DEFAULT 1
      );
      
      -- Vector table for semantic search
      -- Note: sqlite-vec must be loaded as an extension
      CREATE VIRTUAL TABLE IF NOT EXISTS blueprints_vec USING vec0(
        id INTEGER PRIMARY KEY,
        query_embedding FLOAT[384]
      );
    `);

    // 2. Load the embedding model (local all-MiniLM-L6-v2)
    this.embedder = await pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2');
  }

  // Generate 384-dimension vector
  private async getEmbedding(text: string): Promise<number[]> {
    const output = await this.embedder(text, { pooling: 'mean', normalize: true });
    return Array.from(output.data);
  }

  /**
   * Hybrid Search: Finds blueprints by task type AND semantic similarity
   */
  async findSimilarBlueprints(query: string, taskType?: string, limit: number = 2): Promise<Blueprint[]> {
    const embedding = await this.getEmbedding(query);
    const blob = new Float32Array(embedding).buffer;

    // Search for semantically similar intents
    const results = this.db.prepare(`
      SELECT b.task_type, b.query_intent, b.code_snippet, b.success_count
      FROM blueprints b
      JOIN blueprints_vec v ON b.id = v.id
      WHERE b.task_type = ? OR ? IS NULL
      ORDER BY vec_distance_l2(v.query_embedding, ?) ASC
      LIMIT ?
    `).all(taskType, taskType, blob, limit);

    return results;
  }

  /**
   * The "Learning" function: Persists a successful code block
   */
  async recordSuccess(query: string, code: string, taskType: string) {
    const embedding = await this.getEmbedding(query);
    
    // Use a transaction to ensure both tables stay in sync
    const insert = this.db.transaction((intent: string, snippet: string, type: string, vector: number[]) => {
      const res = this.db.prepare(
        'INSERT INTO blueprints (query_intent, code_snippet, task_type) VALUES (?, ?, ?)'
      ).run(intent, snippet, type);
      
      const lastId = res.lastInsertRowid;
      this.db.prepare(
        'INSERT INTO blueprints_vec (id, query_embedding) VALUES (?, ?)'
      ).run(lastId, new Float32Array(vector).buffer);
    });

    insert(query, code, taskType, embedding);
  }
}

```

---

### 2. Integration into the RLM Loop

To make this functional, Claude should modify the main execution loop (`src/rlm.ts`) to follow this logic:

1. **Pre-Turn:** Call `memory.findSimilarBlueprints(userQuery)`.
2. **Prompting:** Concatenate the retrieved snippets into the system prompt:
> "You are an expert synthesizer. Similar tasks have been solved using these patterns: [SNIPPETS]. Adapt these to the current document."


3. **Post-Turn:** If the LLM returns a final answer that passes a basic validation (e.g., not an empty string), trigger `memory.recordSuccess()`.

### 3. Why this solves the "Small Model" Problem

Models like **Qwen 7B** often struggle with **structural consistency**—they forget to use the `memory` array or fail to call `llm_query` correctly. By retrieving a successful "Template," you are effectively providing the model with a "Correctness Anchor." It no longer has to reinvent the logic; it just has to fill in the parameters.
