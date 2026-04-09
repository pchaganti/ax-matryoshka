/**
 * Session Manager for Persistent Sandbox State
 *
 * Keeps sandbox instances alive between queries for faster follow-ups.
 * NOTE: This is for standalone mode only, NOT for MCP!
 *
 * Wraps repl-sandbox's generic session manager with matryoshka-specific
 * sandbox creation (builtins, LLM bridge).
 */

import {
  createSandbox,
  createSessionManager as createGenericSessionManager,
  hashContent,
  GREP_IMPL,
  FUZZY_SEARCH_IMPL,
  COUNT_TOKENS_IMPL,
  LOCATE_LINE_IMPL,
  LLM_QUERY_IMPL,
} from "repl-sandbox";
import type { Sandbox, SandboxOptions } from "repl-sandbox";
import type { LLMQueryFn } from "./llm/types.js";

/**
 * Session Manager interface
 */
export interface SessionManager {
  getOrCreate(
    filePath: string,
    content: string,
    llmFn: LLMQueryFn,
    options?: SandboxOptions
  ): Promise<Sandbox>;
  get(filePath: string): Sandbox | undefined;
  clear(filePath: string): void;
  clearAll(): void;
  listSessions(): string[];
}

const MAX_SESSIONS = 100;

/**
 * Create a new session manager
 */
export function createSessionManager(): SessionManager {
  const mgr = createGenericSessionManager<Sandbox>({
    maxSessions: MAX_SESSIONS,
    dispose: (s) => s.dispose(),
  });
  // Track the last llmFn used per filePath to detect changes
  const llmFnMap = new Map<string, LLMQueryFn>();

  return {
    async getOrCreate(
      filePath: string,
      content: string,
      llmFn: LLMQueryFn,
      options?: SandboxOptions
    ): Promise<Sandbox> {
      // If llmFn changed for this path, invalidate the cached sandbox
      const prevLlmFn = llmFnMap.get(filePath);
      if (prevLlmFn !== undefined && prevLlmFn !== llmFn) {
        mgr.clear(filePath);
      }
      llmFnMap.set(filePath, llmFn);

      const hash = hashContent(content);
      return mgr.getOrCreate(filePath, hash, async () =>
        createSandbox(content, {
          ...options,
          globals: {
            ...options?.globals,
            __llmQueryBridge: llmFn,
          },
          builtins: [
            GREP_IMPL,
            FUZZY_SEARCH_IMPL,
            COUNT_TOKENS_IMPL,
            LOCATE_LINE_IMPL,
            LLM_QUERY_IMPL,
            ...(options?.builtins ?? []),
          ],
        }),
      );
    },

    get(filePath: string): Sandbox | undefined {
      return mgr.get(filePath);
    },

    clear(filePath: string): void {
      mgr.clear(filePath);
      llmFnMap.delete(filePath);
    },

    clearAll(): void {
      mgr.clearAll();
      llmFnMap.clear();
    },

    listSessions(): string[] {
      return mgr.listSessions();
    },
  };
}
