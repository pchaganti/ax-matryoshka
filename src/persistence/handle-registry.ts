/**
 * HandleRegistry - Manages handles for result data
 *
 * Handles are opaque references to data stored in SQLite.
 * The LLM sees only metadata stubs, not the full data, achieving 97%+ token savings.
 */

import type { SessionDB } from "./session-db.js";

export interface HandleStub {
  handle: string;
  type: string;
  count: number;
  preview: string;
}

function buildPreview(firstItem: unknown): string {
  if (typeof firstItem === "object" && firstItem !== null) {
    const obj = firstItem as Record<string, unknown>;
    const lineContent = obj.line ?? obj.content ?? obj.text;
    if (lineContent !== undefined) {
      const line = String(lineContent);
      return line.length > 50 ? line.slice(0, 50) + "..." : line;
    }
    const keys = Object.keys(obj).slice(0, 3);
    return keys.join(", ");
  }
  return String(firstItem).slice(0, 50);
}

export class HandleRegistry {
  private db: SessionDB;
  private resultsHandle: string | null = null;

  constructor(db: SessionDB) {
    this.db = db;
  }

  /**
   * Store an array of data and return a handle reference
   */
  store(data: unknown[]): string {
    return this.db.createHandle(data);
  }

  /**
   * Get full data from a handle
   */
  get(handle: string): unknown[] | null {
    const meta = this.db.getHandleMetadata(handle);
    if (!meta) return null;
    return this.db.getHandleData(handle);
  }

  /**
   * Get a compact stub representation for context building
   */
  getStub(handle: string): string {
    const meta = this.db.getHandleMetadata(handle);
    if (!meta) return `${handle}: <invalid handle>`;

    const data = this.db.getHandleDataSlice(handle, 1);
    const preview = data.length > 0 ? buildPreview(data[0]) : "";

    return `${handle}: Array(${meta.count}) [${preview}]`;
  }

  /**
   * Build context string with all handle stubs for LLM (batch query)
   */
  buildContext(): string {
    const metas = this.db.listHandleMetadata();
    if (metas.length === 0) return "";

    const stubs = metas.map((meta) => {
      const data = this.db.getHandleDataSlice(meta.handle, 1);
      const preview = data.length > 0 ? buildPreview(data[0]) : "";
      return `${meta.handle}: Array(${meta.count}) [${preview}]`;
    });
    return "## Variable Bindings\n" + stubs.join("\n");
  }

  /**
   * Set the current RESULTS handle
   */
  setResults(handle: string): void {
    this.resultsHandle = handle;
  }

  /**
   * Clear the current RESULTS handle
   */
  clearResults(): void {
    this.resultsHandle = null;
  }

  /**
   * Get the current RESULTS handle
   */
  getResults(): string | null {
    return this.resultsHandle;
  }

  /**
   * Resolve RESULTS to actual data
   */
  resolveResults(): unknown[] | null {
    if (!this.resultsHandle) return null;
    return this.get(this.resultsHandle);
  }

  /**
   * Delete a handle
   */
  delete(handle: string): void {
    this.db.deleteHandle(handle);
    if (this.resultsHandle === handle) {
      this.resultsHandle = null;
    }
  }

  /**
   * List all active handles
   */
  listHandles(): string[] {
    return this.db.listHandles();
  }

  /**
   * Get count of items in a handle
   */
  getCount(handle: string): number {
    const meta = this.db.getHandleMetadata(handle);
    return meta?.count ?? 0;
  }

  /**
   * Get the number of active handles
   */
  handleCount(): number {
    return this.db.handleCount();
  }

  /**
   * Evict the oldest non-memo handle to free space
   */
  evictOldest(): void {
    const handles = this.db.listHandles();
    const target = handles.find(h => !h.startsWith("$memo"));
    if (target) {
      this.delete(target);
    }
  }
}
