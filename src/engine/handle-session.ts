/**
 * HandleSession - Handle-based document analysis session
 *
 * Wraps NucleusEngine with handle-based persistence for 97%+ token savings.
 * Query results are stored in SQLite and only handle stubs are returned to the LLM.
 */

import { readFile } from "node:fs/promises";
import { extname } from "node:path";
import { NucleusEngine } from "./nucleus-engine.js";
import { SessionDB } from "../persistence/session-db.js";
import { HandleRegistry } from "../persistence/handle-registry.js";
import { HandleOps } from "../persistence/handle-ops.js";
import { ParserRegistry } from "../treesitter/parser-registry.js";
import { SymbolExtractor } from "../treesitter/symbol-extractor.js";
import {
  getLanguageForExtension,
  getSymbolMappings,
  isLanguageAvailable,
} from "../treesitter/language-map.js";

const MAX_DOCUMENT_SIZE = 50 * 1024 * 1024; // 50MB
const CHARS_PER_TOKEN = 4; // Approximate token estimation heuristic

/**
 * Estimate token count from a string or data size using ~4 chars/token heuristic
 */
function estimateTokens(charCount: number): number {
  return Math.ceil(charCount / CHARS_PER_TOKEN);
}

/**
 * Token cost metadata for a result
 */
export interface TokenMetadata {
  /** Estimated tokens if full data were returned */
  estimatedFullTokens: number;
  /** Tokens used by the stub */
  stubTokens: number;
  /** Percentage savings from using handle */
  savingsPercent: number;
}

/**
 * Token cost metadata for an expanded result
 */
export interface ExpandTokenMetadata {
  /** Tokens in the returned (possibly limited) data */
  returnedTokens: number;
  /** Estimated tokens for the full dataset */
  totalTokens: number;
}

/**
 * Result of a handle-based query execution
 */
export interface HandleResult {
  success: boolean;
  /** Handle reference (e.g., "$res1") if result is an array */
  handle?: string;
  /** Handle stub for LLM context (e.g., "$res1: Array(1000) [preview...]") */
  stub?: string;
  /** Scalar value if result is not an array */
  value?: unknown;
  /** Execution logs */
  logs: string[];
  /** Error message if failed */
  error?: string;
  /** Inferred type */
  type?: string;
  /** Token cost metadata (present for array results) */
  tokenMetadata?: TokenMetadata;
}

/**
 * Options for expanding a handle
 */
export interface ExpandOptions {
  /** Maximum number of items to return (default: all) */
  limit?: number;
  /** Offset for pagination */
  offset?: number;
  /** Format: 'full' returns all fields, 'lines' returns just line content */
  format?: "full" | "lines";
}

/**
 * Result of expanding a handle
 */
export interface ExpandResult {
  success: boolean;
  data?: unknown[];
  total?: number;
  offset?: number;
  limit?: number;
  error?: string;
  /** Token cost metadata for the expanded data */
  tokenMetadata?: ExpandTokenMetadata;
}

/**
 * HandleSession - combines NucleusEngine with handle-based storage
 */
export interface HandleSessionOptions {
  /** Enable verbose logging on the underlying NucleusEngine */
  verbose?: boolean;
}

export class HandleSession {
  private engine: NucleusEngine;
  private db: SessionDB;
  private registry: HandleRegistry;
  private ops: HandleOps;
  private parserRegistry: ParserRegistry;
  private symbolExtractor: SymbolExtractor;
  private parserInitialized: boolean = false;
  private initPromise: Promise<void> | null = null;
  private documentPath: string = "";
  private documentSize: number = 0;
  private loadedAt: Date | null = null;
  private lastAccessedAt: Date | null = null;
  private queryCount: number = 0;

  private canExtractSymbols(ext: string): boolean {
    try {
      const language = getLanguageForExtension(ext);
      if (!language) return false;
      if (!isLanguageAvailable(language)) return false;
      return getSymbolMappings(language) !== null;
    } catch {
      return false;
    }
  }

  constructor(options: HandleSessionOptions = {}) {
    this.engine = new NucleusEngine({ verbose: options.verbose });
    this.db = new SessionDB();
    this.registry = new HandleRegistry(this.db);
    this.ops = new HandleOps(this.db, this.registry);
    this.parserRegistry = new ParserRegistry();
    this.symbolExtractor = new SymbolExtractor(this.parserRegistry);
  }

  /**
   * Initialize the parser registry (call before loading code files)
   * This is called automatically by loadContent but can be called early
   * to avoid initialization delay on first code file load.
   */
  async init(): Promise<void> {
    if (!this.parserInitialized) {
      if (!this.initPromise) {
        this.initPromise = this.parserRegistry.init().then(() => {
          this.parserInitialized = true;
        }).catch((err) => {
          // Reset so the next call can retry
          this.initPromise = null;
          throw err;
        });
      }
      await this.initPromise;
    }
  }

  /**
   * Load a document from file
   * Automatically extracts symbols for supported code files
   */
  async loadFile(filePath: string): Promise<{ lineCount: number; size: number }> {
    const content = await readFile(filePath, "utf-8");
    if (content.length > MAX_DOCUMENT_SIZE) {
      throw new Error(`File too large (${(content.length / 1024 / 1024).toFixed(1)}MB, max ${MAX_DOCUMENT_SIZE / 1024 / 1024}MB)`);
    }
    return this.loadContentWithSymbols(content, filePath);
  }

  /**
   * Load a document from string content
   * Automatically extracts symbols for supported code files
   */
  loadContent(content: string, path: string = "<string>"): { lineCount: number; size: number } {
    // Load into NucleusEngine for query execution
    this.engine.loadContent(content);

    // Also load into SessionDB for FTS5 search and handle storage
    const lineCount = this.db.loadDocument(content);

    // Clear any existing symbols before loading new content
    this.db.clearSymbols();

    // Extract symbols for code files (async, but we fire and forget for sync API)
    const ext = extname(path);
    if (ext && this.canExtractSymbols(ext)) {
      this.extractSymbolsAsync(content, ext);
    }

    // Set SessionDB binding for solver access
    this.engine.setBinding("_sessionDB", this.db);

    this.documentPath = path;
    this.documentSize = content.length;
    this.loadedAt = new Date();
    this.lastAccessedAt = new Date();
    this.queryCount = 0;

    return { lineCount, size: content.length };
  }

  /**
   * Load a document and wait for symbol extraction to complete
   * Use this when you need to query symbols immediately after loading
   */
  async loadContentWithSymbols(content: string, path: string = "<string>"): Promise<{ lineCount: number; size: number }> {
    // Load into NucleusEngine for query execution
    this.engine.loadContent(content);

    // Also load into SessionDB for FTS5 search and handle storage
    const lineCount = this.db.loadDocument(content);

    // Clear any existing symbols before loading new content
    this.db.clearSymbols();

    // Extract symbols for code files
    const ext = extname(path);
    if (ext && this.canExtractSymbols(ext)) {
      await this.init();
      try {
        await this.extractAndStoreSymbols(content, ext);
      } catch (err) {
        console.error("[HandleSession] Symbol extraction failed:", err instanceof Error ? err.message : String(err));
      }
    }

    // Set SessionDB binding for solver access
    this.engine.setBinding("_sessionDB", this.db);

    this.documentPath = path;
    this.documentSize = content.length;
    this.loadedAt = new Date();
    this.lastAccessedAt = new Date();
    this.queryCount = 0;

    return { lineCount, size: content.length };
  }

  private symbolExtractionPromise: Promise<void> | null = null;
  private loadGeneration: number = 0;

  /**
   * Extract and store symbols (async, fire-and-forget for sync load)
   * Uses a generation counter to discard stale results from previous loads.
   */
  private extractSymbolsAsync(content: string, ext: string): void {
    const gen = ++this.loadGeneration;
    this.symbolExtractionPromise = this.init()
      .then(() => {
        if (gen !== this.loadGeneration) return; // stale load, skip
        return this.extractAndStoreSymbols(content, ext);
      })
      .catch((err) => {
        console.error("[HandleSession] Symbol extraction failed:", err instanceof Error ? err.message : String(err));
      });
  }

  /**
   * Wait for symbol extraction to complete (if any is in progress)
   */
  async waitForSymbols(): Promise<void> {
    if (this.symbolExtractionPromise) {
      await this.symbolExtractionPromise;
    }
  }

  /**
   * Extract symbols and store them in the database
   */
  private async extractAndStoreSymbols(content: string, ext: string): Promise<void> {
    const symbols = await this.symbolExtractor.extractSymbols(content, ext);
    for (const symbol of symbols) {
      this.db.storeSymbol(symbol);
    }
  }

  /**
   * Check if a document is loaded
   */
  isLoaded(): boolean {
    return this.engine.isLoaded();
  }

  /**
   * Get document statistics
   */
  getStats(): { path: string; lineCount: number; size: number; loadedAt: Date | null } | null {
    const engineStats = this.engine.getStats();
    if (!engineStats) return null;

    return {
      path: this.documentPath,
      lineCount: engineStats.lineCount,
      size: this.documentSize,
      loadedAt: this.loadedAt,
    };
  }

  /**
   * Execute a Nucleus query and return handle-based result
   *
   * Arrays are stored in SQLite and a handle stub is returned.
   * Scalars are returned directly.
   */
  execute(command: string): HandleResult {
    this.lastAccessedAt = new Date();
    this.queryCount++;

    // Execute via NucleusEngine
    const result = this.engine.execute(command);

    if (!result.success) {
      return {
        success: false,
        logs: result.logs,
        error: result.error,
        type: result.type,
      };
    }

    // If result is an array, store in handle registry
    const MAX_HANDLES = 200;
    if (Array.isArray(result.value)) {
      // Evict oldest handle if over limit
      if (this.registry.handleCount() > MAX_HANDLES) {
        this.registry.evictOldest();
      }
      const handle = this.registry.store(result.value);
      this.registry.setResults(handle);

      // Get the stub for LLM context
      const stub = this.registry.getStub(handle);

      // Compute token metadata
      const fullDataSize = JSON.stringify(result.value).length;
      const stubSize = stub.length;
      const estimatedFullTokens = estimateTokens(fullDataSize);
      const stubTokens = estimateTokens(stubSize);
      const savingsPercent = estimatedFullTokens > 0
        ? Math.round(((estimatedFullTokens - stubTokens) / estimatedFullTokens) * 100)
        : 0;

      return {
        success: true,
        handle,
        stub,
        logs: result.logs,
        type: result.type,
        tokenMetadata: {
          estimatedFullTokens,
          stubTokens,
          savingsPercent,
        },
      };
    }

    // Scalar result - return directly
    return {
      success: true,
      value: result.value,
      logs: result.logs,
      type: result.type,
    };
  }

  /**
   * Expand a handle to get full data
   *
   * Use this when the LLM needs to see actual data for decision-making.
   */
  expand(handle: string, options: ExpandOptions = {}): ExpandResult {
    this.lastAccessedAt = new Date();

    // Check handle exists via metadata (avoids loading all data)
    const meta = this.db.getHandleMetadata(handle);
    if (!meta) {
      return {
        success: false,
        error: `Invalid handle: ${handle}`,
      };
    }

    const MAX_DEFAULT_EXPAND_LIMIT = 1000;
    const total = meta.count;
    const rawOffset = options.offset ?? 0;
    const offset = Math.max(0, Number.isFinite(rawOffset) ? Math.floor(rawOffset) : 0);
    const rawLimit = options.limit ?? Math.min(total, MAX_DEFAULT_EXPAND_LIMIT);
    const limit = Math.min(Math.max(0, Number.isFinite(rawLimit) ? Math.floor(rawLimit) : 0), MAX_DEFAULT_EXPAND_LIMIT);

    // Use database-level pagination instead of loading all data then slicing
    let sliced = this.db.getHandleDataSlice(handle, limit, offset);

    // Format if requested
    if (options.format === "lines") {
      sliced = sliced.map((item) => {
        if (typeof item === "object" && item !== null) {
          const obj = item as Record<string, unknown>;
          // Extract line content
          const line = obj.line ?? obj.content ?? obj.text;
          if (line !== undefined) {
            const lineNum = obj.lineNum ?? obj.lineNumber ?? obj.num;
            if (lineNum !== undefined) {
              return `[${lineNum}] ${line}`;
            }
            return String(line);
          }
        }
        return item;
      });
    }

    // Compute token metadata for expanded data
    const returnedSize = JSON.stringify(sliced).length;
    const returnedTokens = estimateTokens(returnedSize);
    // Estimate total tokens proportionally
    const totalTokens = total > 0 && sliced.length > 0
      ? Math.ceil((returnedTokens / sliced.length) * total)
      : returnedTokens;

    return {
      success: true,
      data: sliced,
      total,
      offset,
      limit,
      tokenMetadata: {
        returnedTokens,
        totalTokens,
      },
    };
  }

  /**
   * Get a preview of handle contents (first N items)
   */
  preview(handle: string, n: number = 5): unknown[] {
    this.lastAccessedAt = new Date();
    return this.ops.preview(handle, n);
  }

  /**
   * Get a random sample from a handle
   */
  sample(handle: string, n: number = 5): unknown[] {
    this.lastAccessedAt = new Date();
    return this.ops.sample(handle, n);
  }

  /**
   * Describe handle contents (schema + stats)
   */
  describe(handle: string): { count: number; fields: string[]; sample: unknown[] } {
    this.lastAccessedAt = new Date();
    return this.ops.describe(handle);
  }

  /**
   * Get current handle bindings as stubs
   */
  getBindings(): Record<string, string> {
    const handles = this.registry.listHandles();
    const bindings: Record<string, string> = {};

    for (const handle of handles) {
      bindings[handle] = this.registry.getStub(handle);
    }

    // Mark current RESULTS
    const resultsHandle = this.registry.getResults();
    if (resultsHandle) {
      bindings["RESULTS"] = `-> ${resultsHandle}`;
    }

    return bindings;
  }

  /**
   * Get a specific binding value from the underlying engine
   */
  getBinding(name: string): unknown {
    return this.engine.getBinding(name);
  }

  /**
   * Build context string with all handle stubs
   */
  buildContext(): string {
    return this.registry.buildContext();
  }

  /**
   * Reset bindings but keep document loaded
   */
  reset(): void {
    // Clear handles
    const handles = this.registry.listHandles();
    for (const handle of handles) {
      this.registry.delete(handle);
    }

    // Reset engine state
    this.engine.reset();
  }

  /**
   * Get session info
   */
  getSessionInfo(): {
    documentPath: string;
    documentSize: number;
    loadedAt: Date | null;
    lastAccessedAt: Date | null;
    queryCount: number;
    handleCount: number;
  } {
    return {
      documentPath: this.documentPath,
      documentSize: this.documentSize,
      loadedAt: this.loadedAt,
      lastAccessedAt: this.lastAccessedAt,
      queryCount: this.queryCount,
      handleCount: this.registry.listHandles().length,
    };
  }

  /**
   * Close the session and free resources
   */
  close(): void {
    try {
      this.engine.dispose();
    } catch (err) {
      console.error("[HandleSession] Engine dispose failed:", err instanceof Error ? err.message : String(err));
    }
    try {
      this.parserRegistry.dispose();
    } catch (err) {
      console.error("[HandleSession] Parser registry dispose failed:", err instanceof Error ? err.message : String(err));
    }
    try {
      this.db.close();
    } catch (err) {
      console.error("[HandleSession] Database close failed:", err instanceof Error ? err.message : String(err));
    }
  }

  /**
   * Get command reference
   */
  static getCommandReference(): string {
    return NucleusEngine.getCommandReference();
  }
}
