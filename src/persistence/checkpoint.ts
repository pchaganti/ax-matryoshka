/**
 * CheckpointManager - Session state persistence
 *
 * Enables:
 * - Saving session state at any turn
 * - Restoring to previous turn
 * - Session resume across runs (with sessionId)
 */

import type { SessionDB } from "./session-db.js";
import type { HandleRegistry } from "./handle-registry.js";

export interface CheckpointMetadata {
  turn: number;
  timestamp: number;
  handleCount: number;
}

export class CheckpointManager {
  private db: SessionDB;
  private registry: HandleRegistry;
  private sessionId: string;
  private autoCheckpointEnabled: boolean = false;

  constructor(db: SessionDB, registry: HandleRegistry) {
    this.db = db;
    this.registry = registry;
    this.sessionId = `session-${Date.now()}`;
  }

  /**
   * Save checkpoint at current turn
   */
  save(turn: number): void {
    if (!Number.isSafeInteger(turn) || turn < 0) {
      throw new Error("Invalid turn number");
    }
    // Collect all handle references
    const handles = this.registry.listHandles();
    const resultsHandle = this.registry.getResults();

    // Build bindings map
    const bindings = new Map<string, string>();
    for (const handle of handles) {
      bindings.set(handle, handle);  // Self-reference for handles
    }
    if (resultsHandle) {
      bindings.set("RESULTS", resultsHandle);
    }

    this.db.saveCheckpoint(turn, bindings);
  }

  /**
   * Restore checkpoint for a turn
   */
  restore(turn: number): boolean {
    if (!Number.isSafeInteger(turn) || turn < 0) return false;
    const bindings = this.db.getCheckpoint(turn);
    if (!bindings) return false;

    // Restore RESULTS binding (or clear stale RESULTS if checkpoint has none)
    const resultsHandle = bindings.get("RESULTS");
    if (resultsHandle && /^\$res\d+$/.test(resultsHandle)) {
      // Verify handle still exists before restoring
      const handleData = this.registry.get(resultsHandle);
      if (handleData === null) {
        // Handle was deleted, clear stale RESULTS
        this.registry.clearResults();
      } else {
        this.registry.setResults(resultsHandle);
      }
    } else {
      this.registry.clearResults();
    }

    return true;
  }

  /**
   * List all checkpoint turns
   */
  listTurns(): number[] {
    return this.db.getCheckpointTurns();
  }

  /**
   * Delete a specific checkpoint
   */
  delete(turn: number): void {
    if (!Number.isSafeInteger(turn) || turn < 0) return;
    this.db.deleteCheckpoint(turn);
  }

  /**
   * Clear all checkpoints
   */
  clearAll(): void {
    this.db.clearCheckpoints();
  }

  /**
   * Get session ID
   */
  getSessionId(): string {
    return this.sessionId;
  }

  /**
   * Set custom session ID
   */
  setSessionId(id: string): void {
    const MAX_SESSION_ID_LENGTH = 1000;
    if (!id || id.length > MAX_SESSION_ID_LENGTH) {
      throw new Error("Invalid session ID length");
    }
    this.sessionId = id;
  }

  /**
   * Get checkpoint metadata
   */
  getMetadata(turn: number): CheckpointMetadata | null {
    const bindings = this.db.getCheckpoint(turn);
    if (!bindings) return null;

    // Count handles in bindings
    const handleCount = Array.from(bindings.values()).filter(v =>
      typeof v === "string" && v.startsWith("$res")
    ).length;

    const timestamp = this.db.getCheckpointTimestamp(turn) ?? Date.now();

    return {
      turn,
      timestamp,
      handleCount,
    };
  }

  /**
   * Enable/disable auto-checkpoint on each operation
   */
  enableAutoCheckpoint(enabled: boolean): void {
    this.autoCheckpointEnabled = enabled;
  }

  /**
   * Called by operations to trigger auto-checkpoint
   */
  onOperation(turn: number): void {
    if (this.autoCheckpointEnabled) {
      this.save(turn);
    }
  }
}
