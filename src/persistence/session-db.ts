/**
 * SessionDB - In-memory SQLite database for session state
 *
 * Provides:
 * - FTS5 full-text search for document lines
 * - Handle storage for result sets
 * - Checkpoint persistence for session resume
 * - Symbol storage for tree-sitter extracted symbols
 */

import Database from "better-sqlite3";
import type { Symbol, SymbolKind } from "../treesitter/types.js";

export interface DocumentLine {
  lineNum: number;
  content: string;
}

export interface HandleMetadata {
  handle: string;
  type: string;
  count: number;
  createdAt: number;
}

/**
 * Derive a short descriptive slug from a Nucleus command string.
 *
 * Examples:
 *   (grep "ERROR")              → "grep_error"
 *   (bm25 "database timeout" 10) → "bm25_database_timeout"
 *   (filter RESULTS (lambda …)) → "filter"
 *   (list_symbols "function")   → "list_symbols_function"
 *
 * Returns "res" as a fallback when no command is provided or parseable.
 */
export function commandToSlug(command?: string): string {
  if (!command) return "res";

  // Extract the top-level command name: first word after "("
  const cmdMatch = command.match(/\(\s*(\w+)/);
  const cmdName = cmdMatch ? cmdMatch[1] : "";

  // Extract the first quoted string argument
  const strMatch = command.match(/"([^"]*)"/);
  const firstArg = strMatch ? strMatch[1] : "";

  let slug = cmdName;
  if (firstArg) {
    const argSlug = firstArg
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_|_$/g, "")
      .slice(0, 20);
    if (argSlug) {
      slug += "_" + argSlug;
    }
  }

  // Normalise to valid identifier chars
  slug = slug
    .toLowerCase()
    .replace(/[^a-z0-9_]/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_|_$/g, "");

  // Cap length so handle names stay compact
  if (slug.length > 30) slug = slug.slice(0, 30).replace(/_$/, "");

  // Prevent collision with the $memo namespace used by createMemoHandle
  if (/^memo\d*$/.test(slug) || /^memo\d*_/.test(slug)) {
    slug = "q_" + slug;
  }

  return slug || "res";
}

export class SessionDB {
  private db: Database.Database | null;
  /** Tracks usage count per slug base for collision disambiguation */
  private slugCounts: Map<string, number> = new Map();

  constructor() {
    // Create in-memory database
    this.db = new Database(":memory:");
    this.db.pragma("foreign_keys = ON");
    this.initSchema();
  }

  private initSchema(): void {
    if (!this.db) return;

    // Document lines table with FTS5
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS document_lines (
        lineNum INTEGER PRIMARY KEY,
        content TEXT NOT NULL
      );

      CREATE VIRTUAL TABLE IF NOT EXISTS document_lines_fts USING fts5(
        content,
        content='document_lines',
        content_rowid='lineNum'
      );

      -- Triggers to keep FTS in sync
      CREATE TRIGGER IF NOT EXISTS document_lines_ai AFTER INSERT ON document_lines BEGIN
        INSERT INTO document_lines_fts(rowid, content) VALUES (new.lineNum, new.content);
      END;

      CREATE TRIGGER IF NOT EXISTS document_lines_ad AFTER DELETE ON document_lines BEGIN
        INSERT INTO document_lines_fts(document_lines_fts, rowid, content) VALUES('delete', old.lineNum, old.content);
      END;

      CREATE TRIGGER IF NOT EXISTS document_lines_au AFTER UPDATE ON document_lines BEGIN
        INSERT INTO document_lines_fts(document_lines_fts, rowid, content) VALUES('delete', old.lineNum, old.content);
        INSERT INTO document_lines_fts(rowid, content) VALUES (new.lineNum, new.content);
      END;

      -- Handles registry
      CREATE TABLE IF NOT EXISTS handles (
        handle TEXT PRIMARY KEY,
        type TEXT NOT NULL,
        count INTEGER NOT NULL,
        created_at INTEGER NOT NULL
      );

      -- Handle data storage (JSON)
      CREATE TABLE IF NOT EXISTS handle_data (
        handle TEXT NOT NULL,
        idx INTEGER NOT NULL,
        data TEXT NOT NULL,
        PRIMARY KEY (handle, idx),
        FOREIGN KEY (handle) REFERENCES handles(handle) ON DELETE CASCADE
      );

      -- Checkpoints
      CREATE TABLE IF NOT EXISTS checkpoints (
        turn INTEGER PRIMARY KEY,
        bindings TEXT NOT NULL,
        timestamp INTEGER NOT NULL
      );

      -- Symbols table for tree-sitter extracted symbols
      CREATE TABLE IF NOT EXISTS symbols (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        kind TEXT NOT NULL,
        startLine INTEGER NOT NULL,
        endLine INTEGER NOT NULL,
        startCol INTEGER,
        endCol INTEGER,
        signature TEXT,
        parentSymbolId INTEGER NULL,
        FOREIGN KEY (parentSymbolId) REFERENCES symbols(id) ON DELETE CASCADE
      );

      CREATE INDEX IF NOT EXISTS idx_symbols_name ON symbols(name);
      CREATE INDEX IF NOT EXISTS idx_symbols_kind ON symbols(kind);
      CREATE INDEX IF NOT EXISTS idx_symbols_lines ON symbols(startLine, endLine);
    `);
  }

  /**
   * Check if database is open
   */
  isOpen(): boolean {
    return this.db !== null;
  }

  /**
   * Get list of tables in database
   */
  getTables(): string[] {
    if (!this.db) return [];
    const stmt = this.db.prepare(`
      SELECT name FROM sqlite_master
      WHERE type='table' AND name NOT LIKE 'sqlite_%'
      ORDER BY name
    `);
    const rows = stmt.all() as Array<{ name: string }>;
    return rows.map((r) => r.name);
  }

  /**
   * Check if FTS5 virtual table exists
   */
  hasFTS5(): boolean {
    if (!this.db) return false;
    const stmt = this.db.prepare(`
      SELECT name FROM sqlite_master
      WHERE type='table' AND name='document_lines_fts'
    `);
    const row = stmt.get();
    return row !== undefined;
  }

  /**
   * Load document content into the database
   */
  loadDocument(content: string): number {
    if (!this.db) return 0;

    // Handle empty document
    if (!content) {
      this.db.exec("DELETE FROM document_lines");
      return 0;
    }

    // Cap content size before splitting to prevent OOM on huge strings
    const MAX_CONTENT_SIZE = 100_000_000; // 100MB
    if (content.length > MAX_CONTENT_SIZE) {
      content = content.slice(0, MAX_CONTENT_SIZE);
    }

    const MAX_LINES = 500_000;
    let lines = content.replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n", MAX_LINES + 1);
    if (lines.length > MAX_LINES) {
      lines = lines.slice(0, MAX_LINES);
    }
    const insert = this.db.prepare(
      "INSERT INTO document_lines (lineNum, content) VALUES (?, ?)"
    );

    // Wrap DELETE + INSERT in the same transaction for atomicity
    const replaceAll = this.db.transaction((lines: string[]) => {
      this.db!.exec("DELETE FROM document_lines");
      for (let i = 0; i < lines.length; i++) {
        insert.run(i + 1, lines[i]);
      }
    });

    replaceAll(lines);
    return lines.length;
  }

  /**
   * Get lines in range (1-indexed)
   */
  getLines(start: number, end: number): DocumentLine[] {
    if (!this.db) return [];
    if (!Number.isFinite(start) || !Number.isFinite(end)) return [];
    start = Math.floor(start);
    end = Math.floor(end);
    if (end < 1) return [];
    if (start > end) return [];
    if (start < 1) start = 1;
    const stmt = this.db.prepare(`
      SELECT lineNum, content FROM document_lines
      WHERE lineNum >= ? AND lineNum <= ?
      ORDER BY lineNum
    `);
    return stmt.all(start, end) as DocumentLine[];
  }

  /**
   * Get total line count
   */
  getLineCount(): number {
    if (!this.db) return 0;
    const stmt = this.db.prepare("SELECT COUNT(*) as count FROM document_lines");
    const row = stmt.get() as { count: number } | undefined;
    return row?.count ?? 0;
  }

  /**
   * Search document using FTS5
   */
  search(query: string): DocumentLine[] {
    if (!this.db) return [];
    const MAX_QUERY_LENGTH = 10_000;
    if (query.length > MAX_QUERY_LENGTH) query = query.slice(0, MAX_QUERY_LENGTH);

    // Sanitize FTS5 special characters to prevent query injection
    // Strips: quotes, wildcards, grouping, column selectors, boolean ops, prefix tokens
    const sanitized = query.replace(/['"*()\-|{}:^~\[\]+@/\\]/g, " ").replace(/\b(AND|OR|NOT|NEAR)\b/gi, " ").trim();
    if (!sanitized) return [];

    return this.searchRaw(sanitized);
  }

  /**
   * Search with a raw FTS5 query (for trusted internal callers only)
   * WARNING: Do not pass user input directly to this method
   */
  searchRaw(query: string): DocumentLine[] {
    if (!this.db) return [];
    if (!query.trim()) return [];

    const MAX_SEARCH_RESULTS = 100_000;
    // Use FTS5 MATCH query
    const stmt = this.db.prepare(`
      SELECT d.lineNum, d.content
      FROM document_lines d
      JOIN document_lines_fts f ON d.lineNum = f.rowid
      WHERE document_lines_fts MATCH ?
      ORDER BY d.lineNum
      LIMIT ?
    `);

    try {
      return stmt.all(query, MAX_SEARCH_RESULTS) as DocumentLine[];
    } catch (err) {
      console.error("[SessionDB] FTS5 query failed:", err instanceof Error ? err.message : String(err));
      return [];
    }
  }

  /**
   * Search with FTS5 BM25 relevance ranking (server-side scoring)
   */
  searchByRelevance(query: string): DocumentLine[] {
    if (!this.db) return [];
    if (!query.trim()) return [];

    const MAX_SEARCH_RESULTS = 100_000;
    const stmt = this.db.prepare(`
      SELECT d.lineNum, d.content
      FROM document_lines_fts f
      JOIN document_lines d ON d.lineNum = f.rowid
      WHERE document_lines_fts MATCH ?
      ORDER BY bm25(document_lines_fts)
      LIMIT ?
    `);

    try {
      return stmt.all(query, MAX_SEARCH_RESULTS) as DocumentLine[];
    } catch (err) {
      console.error("[SessionDB] FTS5 relevance query failed:", err instanceof Error ? err.message : String(err));
      return this.searchRaw(query);
    }
  }

  /**
   * Generate a unique handle name for a slug.
   *
   * Increments the per-slug counter and checks the candidate name against
   * existing handles in SQLite. If a cross-slug collision is detected
   * (e.g. slug "grep_error" count=2 produces "$grep_error_2" which was
   * already taken by slug "grep_error_2" count=1), keeps incrementing
   * until a free name is found.
   */
  private nextUniqueHandle(slug: string): string {
    const checkExists = this.db!.prepare("SELECT 1 FROM handles WHERE handle = ?");
    const MAX_ATTEMPTS = 1000;
    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
      const count = (this.slugCounts.get(slug) ?? 0) + 1;
      this.slugCounts.set(slug, count);
      const candidate = count === 1 ? `$${slug}` : `$${slug}_${count}`;
      if (!checkExists.get(candidate)) {
        return candidate;
      }
    }
    // Fallback: should never happen in practice
    return `$${slug}_${Date.now()}`;
  }

  /**
   * Create a handle for storing data array.
   *
   * @param data    The array payload to store.
   * @param command Optional Nucleus command string used to derive a
   *                descriptive handle name (e.g. `(grep "ERROR")` → `$grep_error`).
   *                Falls back to `$res`, `$res_2`, … when omitted.
   */
  createHandle(data: unknown[], command?: string): string {
    if (!this.db) throw new Error("Database not open");

    const MAX_HANDLE_ITEMS = 1_000_000;
    if (data.length > MAX_HANDLE_ITEMS) {
      data = data.slice(0, MAX_HANDLE_ITEMS);
    }

    const slug = commandToSlug(command);
    const handle = this.nextUniqueHandle(slug);
    const now = Date.now();

    // Insert handle metadata and data rows atomically in one transaction
    const insertHandle = this.db.prepare(`
      INSERT INTO handles (handle, type, count, created_at)
      VALUES (?, ?, ?, ?)
    `);

    const insertData = this.db.prepare(`
      INSERT INTO handle_data (handle, idx, data) VALUES (?, ?, ?)
    `);

    const insertAll = this.db.transaction((items: unknown[]) => {
      insertHandle.run(handle, "array", items.length, now);
      for (let i = 0; i < items.length; i++) {
        try {
          insertData.run(handle, i, JSON.stringify(items[i]));
        } catch {
          // Skip non-serializable items (circular refs, BigInt, etc.)
          insertData.run(handle, i, "null");
        }
      }
    });

    insertAll(data);
    return handle;
  }

  /**
   * Create a memo handle for storing arbitrary context.
   * Uses $memo prefix and "memo" type to distinguish from query result handles.
   *
   * @param data  The array payload to store.
   * @param label Optional label used to derive a descriptive handle name
   *              (e.g., "auth architecture" → `$memo_auth_architecture`).
   *              Falls back to `$memo`, `$memo_2`, … when omitted.
   */
  createMemoHandle(data: unknown[], label?: string): string {
    if (!this.db) throw new Error("Database not open");

    const MAX_HANDLE_ITEMS = 1_000_000;
    if (data.length > MAX_HANDLE_ITEMS) {
      data = data.slice(0, MAX_HANDLE_ITEMS);
    }

    // Derive slug from label, with "memo" prefix to stay in the memo namespace
    let slug = "memo";
    if (label) {
      const labelSlug = label
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "_")
        .replace(/^_|_$/g, "")
        .slice(0, 24);
      if (labelSlug) {
        slug = "memo_" + labelSlug;
      }
    }

    const handle = this.nextUniqueHandle(slug);
    const now = Date.now();

    const insertHandle = this.db.prepare(`
      INSERT INTO handles (handle, type, count, created_at)
      VALUES (?, ?, ?, ?)
    `);

    const insertData = this.db.prepare(`
      INSERT INTO handle_data (handle, idx, data) VALUES (?, ?, ?)
    `);

    const insertAll = this.db.transaction((items: unknown[]) => {
      insertHandle.run(handle, "memo", items.length, now);
      for (let i = 0; i < items.length; i++) {
        try {
          insertData.run(handle, i, JSON.stringify(items[i]));
        } catch {
          insertData.run(handle, i, "null");
        }
      }
    });

    insertAll(data);
    return handle;
  }

  /**
   * Delete all non-memo handles (query result handles)
   * Preserves memo handles across document reloads
   */
  clearQueryHandles(): void {
    if (!this.db) return;
    this.db.exec("DELETE FROM handles WHERE type != 'memo'");
  }

  /**
   * Get handle metadata
   */
  getHandleMetadata(handle: string): HandleMetadata | null {
    if (!this.db) return null;
    const stmt = this.db.prepare(`
      SELECT handle, type, count, created_at as createdAt
      FROM handles WHERE handle = ?
    `);
    const row = stmt.get(handle) as HandleMetadata | undefined;
    return row ?? null;
  }

  /**
   * Get a slice of data stored in a handle (avoids loading all rows)
   */
  getHandleDataSlice(handle: string, limit: number, offset: number = 0): unknown[] {
    if (!this.db) return [];
    const MAX_SLICE_LIMIT = 100_000;
    if (!Number.isFinite(limit)) limit = 0;
    limit = Math.min(Math.floor(limit), MAX_SLICE_LIMIT);
    if (limit <= 0) return [];
    if (!Number.isFinite(offset)) offset = 0;
    offset = Math.max(0, Math.floor(offset));
    const stmt = this.db.prepare(`
      SELECT data FROM handle_data
      WHERE handle = ?
      ORDER BY idx
      LIMIT ? OFFSET ?
    `);
    const rows = stmt.all(handle, limit, offset) as Array<{ data: string }>;
    const MAX_JSON_DATA_SIZE = 10_000_000; // 10MB per entry
    return rows.map((r) => {
      try {
        if (r.data.length > MAX_JSON_DATA_SIZE) return null;
        return JSON.parse(r.data);
      } catch (e) {
        console.warn(`[SessionDB] Failed to parse handle data: ${e instanceof Error ? e.message : String(e)}`);
        return null;
      }
    });
  }

  /**
   * Get data stored in a handle
   */
  getHandleData(handle: string): unknown[] {
    if (!this.db) return [];
    const MAX_ITEMS = 1_000_000;
    const MAX_JSON_DATA_SIZE = 10_000_000; // 10MB per entry
    const stmt = this.db.prepare(`
      SELECT data FROM handle_data
      WHERE handle = ?
      ORDER BY idx
      LIMIT ?
    `);
    const rows = stmt.all(handle, MAX_ITEMS) as Array<{ data: string }>;
    return rows.map((r) => {
      try {
        if (r.data.length > MAX_JSON_DATA_SIZE) return null;
        return JSON.parse(r.data);
      } catch (e) {
        console.warn(`[SessionDB] Failed to parse handle data: ${e instanceof Error ? e.message : String(e)}`);
        return null;
      }
    });
  }

  /**
   * List all handle names
   */
  listHandles(): string[] {
    if (!this.db) return [];
    const MAX_HANDLES = 100_000;
    const stmt = this.db.prepare("SELECT handle FROM handles ORDER BY created_at LIMIT ?");
    const rows = stmt.all(MAX_HANDLES) as Array<{ handle: string }>;
    return rows.map((r) => r.handle);
  }

  /**
   * Count handles without materializing them
   */
  handleCount(): number {
    if (!this.db) return 0;
    const stmt = this.db.prepare("SELECT COUNT(*) AS cnt FROM handles");
    const row = stmt.get() as { cnt: number } | undefined;
    return row?.cnt ?? 0;
  }

  /**
   * Get the total byte size of a handle's stored JSON rows.
   *
   * Sums `length(data)` over the handle_data rows in a single SQL query,
   * so callers can estimate token costs without re-serializing the whole
   * array on the JS side. The data is already JSON-stringified in SQLite
   * (see `createHandle`), so this is the authoritative serialized size
   * minus the JSON array brackets and commas that would wrap it — close
   * enough for a token-cost estimate.
   *
   * Returns 0 for unknown handles.
   */
  getHandleDataByteSize(handle: string): number {
    if (!this.db) return 0;
    const stmt = this.db.prepare(
      "SELECT COALESCE(SUM(length(data)), 0) AS total FROM handle_data WHERE handle = ?"
    );
    const row = stmt.get(handle) as { total: number } | undefined;
    return row?.total ?? 0;
  }

  /**
   * Get metadata for all handles in one query
   */
  listHandleMetadata(): HandleMetadata[] {
    if (!this.db) return [];
    const stmt = this.db.prepare("SELECT handle, type, count, created_at FROM handles ORDER BY created_at");
    const rows = stmt.all() as Array<{ handle: string; type: string; count: number; created_at: number }>;
    return rows.map(r => ({ handle: r.handle, type: r.type, count: r.count, createdAt: r.created_at }));
  }

  /**
   * Delete a handle and its data
   */
  deleteHandle(handle: string): void {
    if (!this.db) return;
    // Data will be cascade-deleted due to foreign key
    const stmt = this.db.prepare("DELETE FROM handles WHERE handle = ?");
    stmt.run(handle);
  }

  /**
   * Save a checkpoint
   */
  saveCheckpoint(turn: number, bindings: Map<string, string>): void {
    if (!this.db) return;
    if (!Number.isSafeInteger(turn) || turn < 0) {
      throw new Error("Turn must be a non-negative integer");
    }
    const bindingsJson = JSON.stringify(Object.fromEntries(bindings));
    const MAX_CHECKPOINT_SIZE = 10_000_000; // 10MB
    if (bindingsJson.length > MAX_CHECKPOINT_SIZE) {
      throw new Error("Checkpoint too large");
    }
    const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO checkpoints (turn, bindings, timestamp)
      VALUES (?, ?, ?)
    `);
    stmt.run(turn, bindingsJson, Date.now());
  }

  /**
   * Get a checkpoint
   */
  getCheckpointTimestamp(turn: number): number | null {
    if (!this.db) return null;
    const stmt = this.db.prepare("SELECT timestamp FROM checkpoints WHERE turn = ?");
    const row = stmt.get(turn) as { timestamp: number } | undefined;
    return row ? row.timestamp : null;
  }

  getCheckpoint(turn: number): Map<string, string> | null {
    if (!this.db) return null;
    const stmt = this.db.prepare("SELECT bindings FROM checkpoints WHERE turn = ?");
    const row = stmt.get(turn) as { bindings: string } | undefined;
    if (!row) return null;
    try {
      const MAX_CHECKPOINT_JSON_SIZE = 10_000_000; // 10MB
      if (row.bindings.length > MAX_CHECKPOINT_JSON_SIZE) return null;
      const obj = JSON.parse(row.bindings) as Record<string, string>;
      const MAX_CHECKPOINT_KEYS = 100_000;
      const entries = Object.entries(obj);
      if (entries.length > MAX_CHECKPOINT_KEYS) return null;
      return new Map(entries);
    } catch {
      return null;
    }
  }

  /**
   * Get all checkpoint turns
   */
  getCheckpointTurns(): number[] {
    if (!this.db) return [];
    const MAX_CHECKPOINTS = 10_000;
    const stmt = this.db.prepare("SELECT turn FROM checkpoints ORDER BY turn LIMIT ?");
    const rows = stmt.all(MAX_CHECKPOINTS) as Array<{ turn: number }>;
    return rows.map((r) => r.turn);
  }

  /**
   * Delete a specific checkpoint
   */
  deleteCheckpoint(turn: number): void {
    if (!this.db) return;
    if (!Number.isSafeInteger(turn) || turn < 0) return;
    const stmt = this.db.prepare("DELETE FROM checkpoints WHERE turn = ?");
    stmt.run(turn);
  }

  /**
   * Clear all checkpoints
   */
  clearCheckpoints(): void {
    if (!this.db) return;
    this.db.exec("DELETE FROM checkpoints");
  }

  // ========================================
  // Symbol operations
  // ========================================

  /**
   * Store a symbol in the database
   * @returns The ID of the inserted symbol
   */
  storeSymbol(symbol: Omit<Symbol, "id">): number {
    if (!this.db) throw new Error("Database not open");
    const MAX_NAME_LENGTH = 10_000;
    const MAX_SIGNATURE_LENGTH = 50_000;
    if (typeof symbol.name !== "string" || symbol.name.length > MAX_NAME_LENGTH) {
      throw new Error("Invalid or too-long symbol name");
    }
    if (symbol.signature != null && (typeof symbol.signature !== "string" || symbol.signature.length > MAX_SIGNATURE_LENGTH)) {
      throw new Error("Invalid or too-long signature");
    }
    const VALID_KINDS = new Set(["function", "method", "class", "interface", "type", "struct", "variable", "constant", "property", "enum", "module", "namespace", "trait"]);
    if (typeof symbol.kind !== "string" || !VALID_KINDS.has(symbol.kind)) {
      throw new Error("Invalid symbol kind");
    }
    if (!Number.isSafeInteger(symbol.startLine) || !Number.isSafeInteger(symbol.endLine) || symbol.startLine < 1 || symbol.endLine < 1 || symbol.startLine > symbol.endLine) {
      throw new Error("Invalid line numbers");
    }
    if (symbol.startCol != null && !Number.isSafeInteger(symbol.startCol)) {
      throw new Error("Invalid column numbers");
    }
    if (symbol.endCol != null && !Number.isSafeInteger(symbol.endCol)) {
      throw new Error("Invalid column numbers");
    }
    if (symbol.parentSymbolId != null && !Number.isSafeInteger(symbol.parentSymbolId)) {
      throw new Error("Invalid parentSymbolId");
    }

    const stmt = this.db.prepare(`
      INSERT INTO symbols (name, kind, startLine, endLine, startCol, endCol, signature, parentSymbolId)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const result = stmt.run(
      symbol.name,
      symbol.kind,
      symbol.startLine,
      symbol.endLine,
      symbol.startCol ?? null,
      symbol.endCol ?? null,
      symbol.signature ?? null,
      symbol.parentSymbolId ?? null
    );

    return result.lastInsertRowid as number;
  }

  /**
   * Get a symbol by ID
   */
  getSymbol(id: number): Symbol | null {
    if (!this.db) return null;
    if (!Number.isSafeInteger(id)) return null;
    const stmt = this.db.prepare(`
      SELECT id, name, kind, startLine, endLine, startCol, endCol, signature, parentSymbolId
      FROM symbols WHERE id = ?
    `);
    const row = stmt.get(id) as Symbol | undefined;
    return row ?? null;
  }

  /**
   * Get all symbols
   */
  getAllSymbols(): Symbol[] {
    if (!this.db) return [];
    const MAX_SYMBOLS = 100_000;
    const stmt = this.db.prepare(`
      SELECT id, name, kind, startLine, endLine, startCol, endCol, signature, parentSymbolId
      FROM symbols ORDER BY startLine, startCol LIMIT ?
    `);
    return stmt.all(MAX_SYMBOLS) as Symbol[];
  }

  /**
   * Get symbols filtered by kind
   */
  getSymbolsByKind(kind: SymbolKind): Symbol[] {
    if (!this.db) return [];
    const MAX_SYMBOLS = 100_000;
    const stmt = this.db.prepare(`
      SELECT id, name, kind, startLine, endLine, startCol, endCol, signature, parentSymbolId
      FROM symbols WHERE kind = ? ORDER BY startLine, startCol LIMIT ?
    `);
    return stmt.all(kind, MAX_SYMBOLS) as Symbol[];
  }

  /**
   * Get all symbols that contain a specific line
   */
  getSymbolsAtLine(line: number): Symbol[] {
    if (!this.db) return [];
    if (!Number.isFinite(line)) return [];
    line = Math.floor(line);
    const MAX_SYMBOLS = 100_000;
    const stmt = this.db.prepare(`
      SELECT id, name, kind, startLine, endLine, startCol, endCol, signature, parentSymbolId
      FROM symbols WHERE startLine <= ? AND endLine >= ? ORDER BY startLine, startCol LIMIT ?
    `);
    return stmt.all(line, line, MAX_SYMBOLS) as Symbol[];
  }

  /**
   * Find a symbol by name (returns first match)
   */
  findSymbolByName(name: string): Symbol | null {
    if (!this.db) return null;
    const stmt = this.db.prepare(`
      SELECT id, name, kind, startLine, endLine, startCol, endCol, signature, parentSymbolId
      FROM symbols WHERE name = ? LIMIT 1
    `);
    const row = stmt.get(name) as Symbol | undefined;
    return row ?? null;
  }

  /**
   * Clear all symbols
   */
  clearSymbols(): void {
    if (!this.db) return;
    this.db.exec("DELETE FROM symbols");
  }

  /**
   * Clear all data (but keep schema)
   */
  clearAll(): void {
    if (!this.db) return;
    this.db.exec(`
      DELETE FROM document_lines;
      DELETE FROM handles;
      DELETE FROM checkpoints;
      DELETE FROM symbols;
    `);
    // Don't reset slugCounts — preserves uniqueness and prevents
    // handle name collisions with previously issued handles
  }

  /**
   * Close the database connection
   */
  close(): void {
    if (this.db) {
      this.db.close();
      this.db = null;
    }
  }
}
