/**
 * HandleOps - Operations on handles (server-side execution)
 *
 * All operations work on handles and return new handles,
 * avoiding the need to transfer full datasets to the LLM.
 */

import type { SessionDB } from "./session-db.js";
import type { HandleRegistry } from "./handle-registry.js";
import { PredicateCompiler } from "./predicate-compiler.js";

export interface DescribeResult {
  count: number;
  fields: string[];
  sample: unknown[];
}

export class HandleOps {
  private db: SessionDB;
  private registry: HandleRegistry;
  private compiler: PredicateCompiler;

  constructor(db: SessionDB, registry: HandleRegistry) {
    this.db = db;
    this.registry = registry;
    this.compiler = new PredicateCompiler();
  }

  /**
   * Count items in a handle
   */
  count(handle: string): number {
    const meta = this.db.getHandleMetadata(handle);
    if (!meta) {
      throw new Error(`Invalid handle: ${handle}`);
    }
    return meta.count;
  }

  /**
   * Sum a numeric field across all items (chunked to avoid loading all at once)
   */
  sum(handle: string, field: string): number {
    if (!/^[a-zA-Z_$][a-zA-Z0-9_$]*$/.test(field) || field.length > 256) {
      throw new Error("Invalid field name");
    }
    // acc/result overflow guarded inline with Number.isFinite below
    const meta = this.db.getHandleMetadata(handle);
    if (!meta) throw new Error(`Invalid handle: ${handle}`);
    let acc = 0;
    const CHUNK = 5000;
    for (let offset = 0; offset < meta.count; offset += CHUNK) {
      const chunk = this.db.getHandleDataSlice(handle, CHUNK, offset);
      for (const item of chunk) {
        if (typeof item === "object" && item !== null && field in item) {
          const value = (item as Record<string, unknown>)[field];
          if (typeof value === "number" && Number.isFinite(value)) {
            const result = acc + value;
            if (Number.isFinite(result)) {
              acc = result;
            }
          }
        }
      }
    }
    return acc;
  }

  /**
   * Sum by extracting numbers from the line field (chunked)
   */
  sumFromLine(handle: string): number {
    const meta = this.db.getHandleMetadata(handle);
    if (!meta) {
      throw new Error(`Invalid handle: ${handle}`);
    }

    let acc = 0;
    const CHUNK = 5000;
    for (let offset = 0; offset < meta.count; offset += CHUNK) {
      const chunk = this.db.getHandleDataSlice(handle, CHUNK, offset);
      for (const item of chunk) {
        if (typeof item === "object" && item !== null && "line" in item) {
          const line = String((item as { line: string }).line);
          // Extract the FIRST numeric token only (preferring $-prefixed values).
          // Summing all numbers per line silently conflates unrelated values —
          // see lc-solver.ts sum case for the matching behavior.
          const dollarMatch = line.match(/\$([\d,]+(?:\.\d+)?)/);
          const firstMatch = dollarMatch ?? line.match(/([\d,]+(?:\.\d+)?)/);
          if (firstMatch) {
            const num = parseFloat(firstMatch[1].replace(/,/g, ""));
            if (!isNaN(num) && Number.isFinite(num)) {
              const result = acc + num;
              if (Number.isFinite(result)) {
                acc = result;
              }
            }
          }
        }
      }
    }
    return acc;
  }

  /**
   * Filter items by predicate, return new handle
   */
  filter(handle: string, predicate: string): string {
    const meta = this.db.getHandleMetadata(handle);
    if (!meta) throw new Error(`Invalid handle: ${handle}`);

    const predicateFn = this.compiler.compile(predicate);
    const filtered: unknown[] = [];
    const CHUNK = 5000;
    for (let offset = 0; offset < meta.count; offset += CHUNK) {
      const chunk = this.db.getHandleDataSlice(handle, CHUNK, offset);
      for (const item of chunk) {
        if (predicateFn(item)) filtered.push(item);
      }
    }
    return this.registry.store(filtered);
  }

  /**
   * Transform items, return new handle
   */
  map(handle: string, expression: string): string {
    const meta = this.db.getHandleMetadata(handle);
    if (!meta) throw new Error(`Invalid handle: ${handle}`);

    const transformFn = this.compiler.compileTransform(expression);
    const mapped: unknown[] = [];
    const CHUNK = 5000;
    for (let offset = 0; offset < meta.count; offset += CHUNK) {
      const chunk = this.db.getHandleDataSlice(handle, CHUNK, offset);
      for (const item of chunk) {
        mapped.push(transformFn(item));
      }
    }
    return this.registry.store(mapped);
  }

  /**
   * Sort items by field, return new handle
   */
  sort(handle: string, field: string, direction: "asc" | "desc" = "asc"): string {
    if (!/^[a-zA-Z_$][a-zA-Z0-9_$]*$/.test(field) || field.length > 256) {
      throw new Error("Invalid field name");
    }
    const data = this.registry.get(handle);
    if (data === null) {
      throw new Error(`Invalid handle: ${handle}`);
    }

    const sorted = data.sort((a, b) => {
      const aVal = typeof a === "object" && a !== null ? (a as Record<string, unknown>)[field] : a;
      const bVal = typeof b === "object" && b !== null ? (b as Record<string, unknown>)[field] : b;

      const aMissing = aVal === undefined || aVal === null;
      const bMissing = bVal === undefined || bVal === null;

      if (aMissing && bMissing) return 0;
      if (aMissing) return 1;
      if (bMissing) return -1;

      let cmp = 0;
      if (typeof aVal === "number" && typeof bVal === "number") {
        cmp = aVal - bVal;
        if (!Number.isFinite(cmp)) cmp = 0;
      } else if (typeof aVal === "string" && typeof bVal === "string") {
        cmp = aVal.localeCompare(bVal);
      } else {
        cmp = String(aVal).localeCompare(String(bVal));
      }

      return direction === "desc" ? -cmp : cmp;
    });

    return this.registry.store(sorted);
  }

  /**
   * Get first N items (for limited inspection)
   */
  preview(handle: string, n: number): unknown[] {
    const MAX_PREVIEW = 10000;
    if (!Number.isFinite(n)) n = 0;
    n = Math.floor(n);
    const meta = this.db.getHandleMetadata(handle);
    if (!meta) {
      throw new Error(`Invalid handle: ${handle}`);
    }
    if (n <= 0) return [];
    n = Math.min(n, MAX_PREVIEW);
    return this.db.getHandleDataSlice(handle, n);
  }

  /**
   * Get random N items
   */
  sample(handle: string, n: number): unknown[] {
    const MAX_SAMPLE = 10000;
    if (!Number.isFinite(n)) n = 0;
    n = Math.floor(n);
    const data = this.registry.get(handle);
    if (data === null) {
      throw new Error(`Invalid handle: ${handle}`);
    }

    if (n <= 0) return [];
    n = Math.min(n, MAX_SAMPLE);
    if (data.length <= n) {
      return [...data];
    }

    // Fisher-Yates partial shuffle — O(n) guaranteed, no collision risk
    const indices = Array.from({ length: data.length }, (_, i) => i);
    for (let i = 0; i < n; i++) {
      const j = i + Math.floor(Math.random() * (indices.length - i));
      [indices[i], indices[j]] = [indices[j], indices[i]];
    }
    return indices.slice(0, n).map((i) => data[i]);
  }

  /**
   * Describe handle contents (schema + stats)
   */
  describe(handle: string): DescribeResult {
    const meta = this.db.getHandleMetadata(handle);
    if (!meta) {
      throw new Error(`Invalid handle: ${handle}`);
    }

    // Load only a small slice for field discovery and sample
    const DESCRIBE_SAMPLE = 20;
    const sampleData = this.db.getHandleDataSlice(handle, DESCRIBE_SAMPLE);

    const MAX_FIELDS = 10_000;
    const fields = new Set<string>();
    for (const item of sampleData) {
      if (typeof item === "object" && item !== null) {
        for (const key of Object.keys(item as Record<string, unknown>)) {
          fields.add(key);
          if (fields.size >= MAX_FIELDS) break;
        }
      }
      if (fields.size >= MAX_FIELDS) break;
    }

    return {
      count: meta.count,
      fields: Array.from(fields).slice(0, MAX_FIELDS),
      sample: sampleData.slice(0, 3),
    };
  }
}
