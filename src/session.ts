/**
 * Session Manager for Persistent Sandbox State
 *
 * Keeps sandbox instances alive between queries for faster follow-ups.
 * NOTE: This is for standalone mode only, NOT for MCP!
 */

import { createSandbox, Sandbox, SandboxOptions } from "./sandbox.js";
import type { LLMQueryFn } from "./llm/types.js";
import { createHash } from "node:crypto";

interface Session {
  sandbox: Sandbox;
  filePath: string;
  contentHash: string;
  createdAt: Date;
}

/**
 * Create a hash of content for change detection
 */
function hashContent(content: string): string {
  return createHash("md5").update(content).digest("hex");
}

/**
 * Session Manager interface
 */
export interface SessionManager {
  /**
   * Get existing sandbox or create new one for the given file path
   */
  getOrCreate(
    filePath: string,
    content: string,
    llmFn: LLMQueryFn,
    options?: SandboxOptions
  ): Promise<Sandbox>;

  /**
   * Get existing sandbox for path (undefined if not found)
   */
  get(filePath: string): Sandbox | undefined;

  /**
   * Clear a specific session
   */
  clear(filePath: string): void;

  /**
   * Clear all sessions
   */
  clearAll(): void;

  /**
   * List all active session paths
   */
  listSessions(): string[];
}

/**
 * Create a new session manager
 *
 * @example
 * const sessionManager = createSessionManager();
 *
 * // First query - creates new sandbox
 * const sandbox = await sessionManager.getOrCreate('/path/to/doc.txt', content, llmFn);
 * await sandbox.execute('memory.push("found something")');
 *
 * // Follow-up query - reuses same sandbox with preserved memory
 * const sameSandbox = await sessionManager.getOrCreate('/path/to/doc.txt', content, llmFn);
 * const result = await sameSandbox.execute('memory'); // Still has previous data
 */
const MAX_SESSIONS = 100;
const MAX_PATH_LENGTH = 4096;

export function createSessionManager(): SessionManager {
  const sessions = new Map<string, Session>();

  return {
    async getOrCreate(
      filePath: string,
      content: string,
      llmFn: LLMQueryFn,
      options?: SandboxOptions
    ): Promise<Sandbox> {
      if (filePath.length > MAX_PATH_LENGTH) {
        throw new Error(`File path too long (${filePath.length} chars, max ${MAX_PATH_LENGTH})`);
      }
      const newHash = hashContent(content);

      // Check for existing session
      const existing = sessions.get(filePath);
      if (existing) {
        // If content changed, dispose old sandbox and create new one
        if (existing.contentHash !== newHash) {
          existing.sandbox.dispose();
          sessions.delete(filePath);
        } else {
          return existing.sandbox;
        }
      }

      // Create new sandbox
      const sandbox = await createSandbox(content, llmFn, options);

      // Evict oldest session if at capacity
      if (sessions.size >= MAX_SESSIONS) {
        const oldest = sessions.keys().next().value;
        if (oldest !== undefined) {
          const oldSession = sessions.get(oldest);
          if (oldSession) oldSession.sandbox.dispose();
          sessions.delete(oldest);
        }
      }

      // Store session with content hash
      sessions.set(filePath, {
        sandbox,
        filePath,
        contentHash: newHash,
        createdAt: new Date(),
      });

      return sandbox;
    },

    get(filePath: string): Sandbox | undefined {
      return sessions.get(filePath)?.sandbox;
    },

    clear(filePath: string): void {
      const session = sessions.get(filePath);
      if (session) {
        session.sandbox.dispose();
        sessions.delete(filePath);
      }
    },

    clearAll(): void {
      for (const session of sessions.values()) {
        session.sandbox.dispose();
      }
      sessions.clear();
    },

    listSessions(): string[] {
      return Array.from(sessions.keys());
    },
  };
}
