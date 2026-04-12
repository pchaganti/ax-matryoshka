/**
 * AI SDK Tool Definitions for Lattice
 *
 * Provides typed tool definitions that can be used programmatically
 * with any AI SDK (Vercel AI SDK, LangChain, custom agents, etc.).
 *
 * Each tool has:
 * - name: Tool identifier
 * - description: What the tool does (for LLM)
 * - parameters: JSON Schema for input validation
 * - execute: Async function to run the tool
 *
 * Usage:
 *   import { createLatticeTools } from "matryoshka-rlm/tool";
 *   const tools = createLatticeTools();
 *   await tools.load.execute({ filePath: "./data.log" });
 *   const result = await tools.query.execute({ command: '(grep "ERROR")' });
 */

import { HandleSession } from "../engine/handle-session.js";
import type {
  HandleResult,
  ExpandResult,
  ExpandOptions,
} from "../engine/handle-session.js";

// ── Tool parameter types ────────────────────────────────────────

interface LoadParams {
  filePath: string;
}

interface QueryParams {
  command: string;
}

interface ExpandParams {
  handle: string;
  limit?: number;
  offset?: number;
  format?: "full" | "lines";
}

// eslint-disable-next-line @typescript-eslint/no-empty-interface
interface EmptyParams {}

// ── Tool result types ───────────────────────────────────────────

interface LoadResult {
  success: boolean;
  message?: string;
  error?: string;
  lineCount?: number;
  size?: number;
}

interface StatusResult {
  success: boolean;
  data?: {
    documentPath: string;
    documentSize: number;
    queryCount: number;
    handleCount: number;
  };
  error?: string;
}

interface BindingsResult {
  success: boolean;
  data?: Record<string, string>;
  error?: string;
}

// ── Tool definition type ────────────────────────────────────────

interface ToolDefinition<TParams, TResult> {
  name: string;
  description: string;
  parameters: {
    type: "object";
    properties: Record<string, unknown>;
    required: string[];
  };
  execute: (params: TParams) => Promise<TResult>;
}

// ── Generic tool definition for getToolDefinitions ──────────────

export interface GenericToolDefinition {
  name: string;
  description: string;
  parameters: {
    type: "object";
    properties: Record<string, unknown>;
    required: string[];
  };
  execute: (params: Record<string, unknown>) => Promise<unknown>;
}

// ── Tool set type ───────────────────────────────────────────────

export interface LatticeToolSet {
  load: ToolDefinition<LoadParams, LoadResult>;
  query: ToolDefinition<QueryParams, HandleResult>;
  expand: ToolDefinition<ExpandParams, ExpandResult>;
  close: ToolDefinition<EmptyParams, { success: boolean }>;
  status: ToolDefinition<EmptyParams, StatusResult>;
  bindings: ToolDefinition<EmptyParams, BindingsResult>;
  /** Get all tools as an array for SDK integration */
  getToolDefinitions: () => GenericToolDefinition[];
}

/**
 * Create a set of Lattice tools for programmatic use.
 *
 * Returns typed tool definitions that wrap a HandleSession.
 * Each tool has a name, description, JSON Schema parameters, and execute function.
 */
export function createLatticeTools(): LatticeToolSet {
  let session: HandleSession | null = null;

  function getSession(): HandleSession {
    if (!session) {
      session = new HandleSession();
    }
    return session;
  }

  const load: ToolDefinition<LoadParams, LoadResult> = {
    name: "lattice_load",
    description:
      "Load a document for analysis. Use for files >500 lines. " +
      "Returns line count and size. Session stays open until close.",
    parameters: {
      type: "object",
      properties: {
        filePath: {
          type: "string",
          description: "Path to the document to analyze",
        },
      },
      required: ["filePath"],
    },
    async execute(params: LoadParams): Promise<LoadResult> {
      // Close existing session if any
      if (session) {
        session.close();
        session = null;
      }
      const s = getSession();
      try {
        const stats = await s.loadFile(params.filePath);
        return {
          success: true,
          message: `Loaded: ${stats.lineCount} lines, ${(stats.size / 1024).toFixed(1)} KB`,
          lineCount: stats.lineCount,
          size: stats.size,
        };
      } catch (err) {
        return {
          success: false,
          error: err instanceof Error ? err.message : String(err),
        };
      }
    },
  };

  const query: ToolDefinition<QueryParams, HandleResult> = {
    name: "lattice_query",
    description:
      "Execute a Nucleus S-expression query on the loaded document. " +
      "Array results return handle stubs; scalars return directly. " +
      "Chain operations via RESULTS variable.",
    parameters: {
      type: "object",
      properties: {
        command: {
          type: "string",
          description: 'Nucleus S-expression, e.g., (grep "ERROR")',
        },
      },
      required: ["command"],
    },
    async execute(params: QueryParams): Promise<HandleResult> {
      if (!session || !session.isLoaded()) {
        return {
          success: false,
          logs: [],
          error: "No document loaded. Use load first.",
        };
      }
      return session.execute(params.command);
    },
  };

  const expand: ToolDefinition<ExpandParams, ExpandResult> = {
    name: "lattice_expand",
    description:
      "Get full data from a handle stub. Use limit for large results. " +
      "Supports pagination via offset.",
    parameters: {
      type: "object",
      properties: {
        handle: {
          type: "string",
          description: 'Handle reference, e.g., "$grep_error"',
        },
        limit: {
          type: "number",
          description: "Max items to return (default: all)",
        },
        offset: {
          type: "number",
          description: "Skip first N items",
        },
        format: {
          type: "string",
          enum: ["full", "lines"],
          description: "Output format",
        },
      },
      required: ["handle"],
    },
    async execute(params: ExpandParams): Promise<ExpandResult> {
      if (!session) {
        return { success: false, error: "No active session." };
      }
      const opts: ExpandOptions = {};
      if (params.limit !== undefined) opts.limit = params.limit;
      if (params.offset !== undefined) opts.offset = params.offset;
      if (params.format !== undefined) opts.format = params.format;
      return session.expand(params.handle, opts);
    },
  };

  const closeTool: ToolDefinition<EmptyParams, { success: boolean }> = {
    name: "lattice_close",
    description: "Close the session and free memory.",
    parameters: {
      type: "object",
      properties: {},
      required: [],
    },
    async execute(): Promise<{ success: boolean }> {
      if (session) {
        session.close();
        session = null;
      }
      return { success: true };
    },
  };

  const status: ToolDefinition<EmptyParams, StatusResult> = {
    name: "lattice_status",
    description: "Get current session status.",
    parameters: {
      type: "object",
      properties: {},
      required: [],
    },
    async execute(): Promise<StatusResult> {
      if (!session) {
        return { success: false, error: "No active session." };
      }
      const info = session.getSessionInfo();
      return {
        success: true,
        data: {
          documentPath: info.documentPath,
          documentSize: info.documentSize,
          queryCount: info.queryCount,
          handleCount: info.handleCount,
        },
      };
    },
  };

  const bindings: ToolDefinition<EmptyParams, BindingsResult> = {
    name: "lattice_bindings",
    description: "Show current handle bindings.",
    parameters: {
      type: "object",
      properties: {},
      required: [],
    },
    async execute(): Promise<BindingsResult> {
      if (!session) {
        return { success: false, error: "No active session." };
      }
      return {
        success: true,
        data: session.getBindings(),
      };
    },
  };

  const toolSet: LatticeToolSet = {
    load,
    query,
    expand,
    close: closeTool,
    status,
    bindings,
    getToolDefinitions(): GenericToolDefinition[] {
      return [load, query, expand, closeTool, status, bindings] as GenericToolDefinition[];
    },
  };

  return toolSet;
}
