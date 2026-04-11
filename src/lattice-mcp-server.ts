#!/usr/bin/env node
/**
 * Lattice MCP Server - Handle-Based Document Analysis
 *
 * A stateful document analysis tool that achieves 97%+ token savings by
 * storing results in SQLite and returning only handle references to the LLM.
 *
 * KEY CONCEPT:
 * - Query results are stored server-side, LLM sees only compact stubs
 * - Use lattice_expand when you need to see actual data for decision-making
 * - Chain operations via RESULTS without transferring full datasets
 *
 * SESSION LIFECYCLE:
 * - Sessions auto-expire after inactivity (default: 10 minutes)
 * - Loading a new document closes the previous session
 * - Explicit lattice_close tool for cleanup
 *
 * Usage:
 *   1. lattice_load - Load a document (starts session)
 *   2. lattice_query - Run queries (returns handle stubs, not full data)
 *   3. lattice_expand - Get full data when you need to inspect results
 *   4. lattice_close - End session
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  type CallToolResult,
} from "@modelcontextprotocol/sdk/types.js";
import { stat } from "node:fs/promises";
import { resolve, sep } from "node:path";
import { HandleSession } from "./engine/handle-session.js";
import { getVersion } from "./version.js";
import { hasTraversalSegment } from "./utils/path-safety.js";

// Sub-LLM bridge — populated in main() once the server has connected and we
// know whether the client supports `sampling/createMessage`. When set, every
// new HandleSession created by lattice_load / lattice_memo will receive this
// callback and `(llm_query ...)` inside a lattice_query will be routed back
// to the MCP client's LLM via the standard sampling protocol.
let samplingBridge: ((prompt: string) => Promise<string>) | null = null;

// Default cap for sub-LLM responses. The MCP sampling protocol requires a
// maxTokens value; we keep it modest so sub-LLM calls stay cheap and the
// paper's OOLONG pattern remains affordable at scale.
const SAMPLING_MAX_TOKENS = 1024;

// Configuration — timeout is configurable via env var for long sessions
const SESSION_TIMEOUT_MS = parseInt(process.env.LATTICE_TIMEOUT_MS || "") || 10 * 60 * 1000;
const MAX_DOCUMENT_SIZE = 50 * 1024 * 1024; // 50MB limit

// Session state
let session: HandleSession | null = null;
let timeoutHandle: ReturnType<typeof setTimeout> | null = null;

function resetInactivityTimer(): void {
  if (timeoutHandle) {
    clearTimeout(timeoutHandle);
  }

  timeoutHandle = setTimeout(() => {
    if (session) {
      console.error(`[Lattice] Session expired after ${SESSION_TIMEOUT_MS / 1000}s inactivity`);
      try {
        closeSession("timeout");
      } catch (err) {
        console.error("[Lattice] Error closing expired session:", err instanceof Error ? err.message : String(err));
        session = null;
      }
    }
  }, SESSION_TIMEOUT_MS);
}

function closeSession(reason: string): void {
  if (session) {
    const info = session.getSessionInfo();
    const duration = info.loadedAt ? Date.now() - info.loadedAt.getTime() : 0;
    console.error(
      `[Lattice] Session closed: ${reason} | ` +
      `Document: ${info.documentPath} | ` +
      `Duration: ${Math.round(duration / 1000)}s | ` +
      `Queries: ${info.queryCount} | ` +
      `Handles: ${info.handleCount}`
    );
    session.close();
    session = null;
  }

  if (timeoutHandle) {
    clearTimeout(timeoutHandle);
    timeoutHandle = null;
  }
}

function getSessionInfo(): string {
  if (!session) {
    return "No active session";
  }

  const info = session.getSessionInfo();
  const now = new Date();
  const age = info.loadedAt ? Math.round((now.getTime() - info.loadedAt.getTime()) / 1000) : 0;
  const idle = info.lastAccessedAt ? Math.round((now.getTime() - info.lastAccessedAt.getTime()) / 1000) : 0;
  const timeout = Math.round(SESSION_TIMEOUT_MS / 1000 - idle);

  const memo = session.getMemoStats();

  return `Session active:
  Document: ${info.documentPath || "(none)"}
  Size: ${(info.documentSize / 1024).toFixed(1)} KB
  Age: ${age}s
  Idle: ${idle}s
  Timeout in: ${Math.max(0, timeout)}s
  Queries: ${info.queryCount}
  Active handles: ${info.handleCount}
  Memos: ${memo.count}/${memo.maxCount} (${(memo.totalBytes / 1024).toFixed(1)}KB / ${(memo.maxBytes / 1024 / 1024).toFixed(0)}MB)`;
}

const TOOLS = [
  {
    name: "lattice_load",
    description: `Load a document for analysis. Starts a new session (closes any existing session).

RECOMMENDED WORKFLOW:
1. Use Glob first to discover relevant files
2. Read small files (<300 lines) directly
3. Use Lattice for large files (>500 lines) - saves 80%+ tokens
4. Chain queries: grep → filter → count/sum

HOW HANDLES WORK:
- Query results are stored server-side in SQLite
- You receive a compact stub like "$res1: Array(1000) [preview...]"
- Use lattice_expand to see full data when you need to make decisions
- This saves 97%+ tokens compared to returning full results

EFFICIENT QUERY PATTERNS:
- Start broad: (grep "ERROR") to find all errors
- Then narrow: (filter RESULTS (lambda x (match x "timeout" 0)))
- Finally aggregate: (count RESULTS) or (sum RESULTS)
- Inspect when needed: use lattice_expand with limit

SESSION: Document stays loaded for ${SESSION_TIMEOUT_MS / 60000} minutes.
Call lattice_close when done.`,
    inputSchema: {
      type: "object" as const,
      properties: {
        filePath: {
          type: "string",
          description: "Path to the document to analyze",
        },
      },
      required: ["filePath"],
    },
  },
  {
    name: "lattice_query",
    description: `Execute a Nucleus query on the loaded document.

RETURNS HANDLE STUBS (not full data):
- Array results return a handle like "$res1: Array(500) [preview...]"
- Scalar results (count, sum) return the value directly
- Use lattice_expand when you need to see the actual data

SEARCH (returns handle to matches):
  (grep "pattern")              Regex search - returns handle to matching lines
  (fuzzy_search "query" 10)     Fuzzy search - top N matches by relevance
  (lines 10 20)                 Get specific line range

SYMBOL OPERATIONS (.ts, .js, .py, .go, .md, and more):
  (list_symbols)                List all symbols (functions, classes, methods, headings, etc.)
  (list_symbols "function")     Filter by kind: "function", "class", "method", "interface", "type"
  (get_symbol_body "funcName")  Get source code for a symbol
  (find_references "identifier") Find all references to an identifier

GRAPH OPERATIONS (knowledge graph for code structure):
  (callers "funcName")          Who calls this function?
  (callees "funcName")          What does this function call?
  (ancestors "ClassName")       Inheritance chain (extends)
  (descendants "ClassName")     All subclasses (transitive)
  (implementations "IFace")     Classes implementing this interface
  (dependents "name")           All transitive dependents
  (dependents "name" 2)         Dependents within depth limit
  (symbol_graph "name" 1)       Neighborhood subgraph around symbol

AGGREGATE (returns scalar directly):
  (count RESULTS)               Count items in current results
  (sum RESULTS)                 Sum numeric values (auto-extracts from $1,234 format)

TRANSFORM (returns new handle):
  (filter RESULTS (lambda x (match x "pattern" 0)))
  (map RESULTS (lambda x (match x "(\\d+)" 1)))

EXTRACT:
  (match str "pattern" 1)       Extract regex group from string

EXAMPLE WORKFLOW:
1. (grep "ERROR")                    → Returns: $res1: Array(500) [preview]
2. (filter RESULTS (lambda x ...))   → Returns: $res2: Array(50) [preview]
3. (count RESULTS)                   → Returns: 50
4. lattice_expand $res2 limit=10     → See 10 actual error messages

SYMBOL WORKFLOW:
1. (list_symbols "function")         → Returns: $res1: Array(15) [preview]
2. (get_symbol_body "myFunction")    → Returns source code directly
3. (find_references "myFunction")    → Returns: $res2: Array(8) [references]

MARKDOWN WORKFLOW:
1. (list_symbols)                       → Returns: $res1: Array(12) [# Intro, ## Setup, ...]
2. (grep "## Installation")             → Find specific section content

VARIABLE BINDING:
- RESULTS: Always points to the last array result (use in queries)
- _1, _2, _3, ...: Results from turn N (use in queries for older results)
- $res1, $res2, ...: Handle stubs (use ONLY with lattice_expand, NOT in queries)

EFFICIENCY: Minimize the number of separate tool calls by chaining queries.
Build a pipeline (grep → filter → count) rather than making independent calls.
Aim to answer your question in 3-5 queries, not 10+.`,
    inputSchema: {
      type: "object" as const,
      properties: {
        command: {
          type: "string",
          description: 'Nucleus S-expression command, e.g., (grep "ERROR")',
        },
      },
      required: ["command"],
    },
  },
  {
    name: "lattice_expand",
    description: `Get full data from a handle when you need to inspect actual results.

USE THIS WHEN:
- You need to see actual content to make decisions
- You want to verify what's in a result set
- You need to extract specific data for your response

PARAMETERS:
- handle: The handle reference (e.g., "$res1")
- limit: Max items to return (default: all) - use for large result sets
- offset: Skip first N items (for pagination)
- format: "full" (default) or "lines" (just line content with numbers)

EXAMPLES:
  lattice_expand $res1                    → Full data from handle
  lattice_expand $res1 limit=10           → First 10 items only
  lattice_expand $res1 offset=10 limit=10 → Items 11-20 (pagination)
  lattice_expand $res1 format=lines       → "[1] line content..." format

TIP: Start with a small limit to preview, then expand more if needed.`,
    inputSchema: {
      type: "object" as const,
      properties: {
        handle: {
          type: "string",
          description: 'Handle reference to expand (e.g., "$res1")',
        },
        limit: {
          type: "number",
          description: "Maximum number of items to return (default: all)",
        },
        offset: {
          type: "number",
          description: "Number of items to skip (for pagination)",
        },
        format: {
          type: "string",
          enum: ["full", "lines"],
          description: '"full" for complete objects, "lines" for readable line format',
        },
      },
      required: ["handle"],
    },
  },
  {
    name: "lattice_close",
    description:
      "Close the current session and free memory. " +
      "Call this when done analyzing a document. " +
      "Sessions also auto-close after 10 minutes of inactivity.",
    inputSchema: {
      type: "object" as const,
      properties: {},
      required: [],
    },
  },
  {
    name: "lattice_status",
    description: "Get current session status including document info, active handles, and timeout.",
    inputSchema: {
      type: "object" as const,
      properties: {},
      required: [],
    },
  },
  {
    name: "lattice_bindings",
    description: `Show current handle bindings.

Returns all active handles with their stubs:
  $res1: Array(500) [preview of first item...]
  $res2: Array(50) [preview...]
  RESULTS: -> $res2

Use this to see what data you have available before deciding what to expand.`,
    inputSchema: {
      type: "object" as const,
      properties: {},
      required: [],
    },
  },
  {
    name: "lattice_reset",
    description: "Clear all handles and bindings but keep the document loaded. Use this to start fresh analysis.",
    inputSchema: {
      type: "object" as const,
      properties: {},
      required: [],
    },
  },
  {
    name: "lattice_memo",
    description: `Store arbitrary context as a memo handle for token-efficient roundtripping.

USE THIS TO:
- Stash file summaries, analysis results, plans, or any context
- Avoid roundtripping large text in every message
- Pull context back only when actually needed via lattice_expand

RETURNS a handle stub like: $memo1: "auth-module architecture" (2.1KB, 50 lines)
The LLM carries this compact stub (~15 tokens) instead of the full content (~2000 tokens).

WORKFLOW:
1. lattice_memo content="<summary>" label="what this is"  → $memo1 stub
2. Keep a brief index in your response text so you remember what's stashed:
   "Stashed: $memo1 (auth architecture — middleware chain, session flow)"
3. Continue working, carrying just the index (~10 tokens per memo)
4. lattice_expand $memo1  → Full content when you actually need it

IMPORTANT: After stashing, always note the handle + label + a short description
of what's inside in your response. This avoids needing lattice_bindings later
to remember what you stored. Update the index when you add or delete memos.

Memos persist across document loads. No lattice_load required.
Session timeout: ${SESSION_TIMEOUT_MS / 60000} minutes (resets on any tool call).`,
    inputSchema: {
      type: "object" as const,
      properties: {
        content: {
          type: "string",
          description: "The text content to store (file summary, analysis, plan, etc.)",
        },
        label: {
          type: "string",
          description: "Short label describing this memo (shown in handle stub)",
        },
      },
      required: ["content", "label"],
    },
  },
  {
    name: "lattice_memo_delete",
    description: `Delete a memo that is no longer needed to free memory.

Use this when context becomes stale or irrelevant (e.g., after finishing work on a module).
Check lattice_bindings to see current memos and their handles.`,
    inputSchema: {
      type: "object" as const,
      properties: {
        handle: {
          type: "string",
          description: 'Memo handle to delete (e.g., "$memo1")',
        },
      },
      required: ["handle"],
    },
  },
  {
    name: "lattice_help",
    description: "Get complete Nucleus command reference documentation.",
    inputSchema: {
      type: "object" as const,
      properties: {},
      required: [],
    },
  },
];

function formatHandleResult(result: {
  success: boolean;
  handle?: string;
  stub?: string;
  value?: unknown;
  logs: string[];
  error?: string;
  tokenMetadata?: { estimatedFullTokens: number; stubTokens: number; savingsPercent: number };
}): string {
  if (!result.success) {
    return `Error: ${result.error}`;
  }

  // If we have a handle (array result), return the stub
  if (result.handle && result.stub) {
    let text = result.stub;
    if (result.tokenMetadata) {
      text += `\n\nToken savings: ~${result.tokenMetadata.savingsPercent}% (${result.tokenMetadata.stubTokens} vs ~${result.tokenMetadata.estimatedFullTokens} tokens)`;
    }
    text += "\n\nChain with (count RESULTS), (filter RESULTS ...), (map RESULTS ...), etc.";
    text += "\nUse lattice_expand to see full data when needed.";
    return text;
  }

  // Scalar result
  if (typeof result.value === "number") {
    return `Result: ${result.value.toLocaleString()}`;
  }

  if (typeof result.value === "string") {
    return result.value;
  }

  return JSON.stringify(result.value, null, 2);
}

function formatExpandResult(result: {
  success: boolean;
  data?: unknown[];
  total?: number;
  offset?: number;
  limit?: number;
  error?: string;
}): string {
  if (!result.success) {
    return `Error: ${result.error}`;
  }

  const data = result.data ?? [];
  let text = `Showing ${data.length} of ${result.total} items`;
  if (result.offset && result.offset > 0) {
    text += ` (offset: ${result.offset})`;
  }
  text += ":\n\n";

  for (const item of data) {
    if (typeof item === "string") {
      text += item + "\n";
    } else if (typeof item === "object" && item !== null) {
      const obj = item as Record<string, unknown>;
      // Format nicely for line-based results
      if ("lineNum" in obj && "line" in obj) {
        text += `[${obj.lineNum}] ${obj.line}\n`;
      } else if ("lineNum" in obj && "content" in obj) {
        text += `[${obj.lineNum}] ${obj.content}\n`;
      } else {
        text += JSON.stringify(item) + "\n";
      }
    } else {
      text += JSON.stringify(item) + "\n";
    }
  }

  return text;
}

async function handleToolCall(name: string, args: Record<string, unknown>): Promise<CallToolResult> {
  try {
    switch (name) {
      case "lattice_load": {
        const filePath = args.filePath as string;
        if (!filePath) {
          return { content: [{ type: "text", text: "Error: filePath is required" }] };
        }

        // Validate path - reject traversal and paths outside CWD
        if (!skipCwdChecking) {
          if (hasTraversalSegment(filePath)) {
            return { content: [{ type: "text", text: "Error: Path traversal (..) is not allowed" }] };
          }
          const resolvedPath = resolve(filePath);
          const cwd = process.cwd();
          if (!resolvedPath.startsWith(cwd + sep) && resolvedPath !== cwd) {
            return { content: [{ type: "text", text: "Error: Path outside working directory is not allowed" }] };
          }
        }

        // Check file size before loading to avoid wasting memory
        try {
          const fileStat = await stat(filePath);
          if (fileStat.size > MAX_DOCUMENT_SIZE) {
            return {
              content: [{
                type: "text",
                text: `Error: Document too large (${(fileStat.size / 1024 / 1024).toFixed(1)}MB). ` +
                  `Maximum size is ${MAX_DOCUMENT_SIZE / 1024 / 1024}MB.`,
              }],
            };
          }
        } catch (err) {
          return {
            content: [{
              type: "text",
              text: `Error: Cannot access file: ${err instanceof Error ? err.message : String(err)}`,
            }],
          };
        }

        // Reuse existing session if it has memos, otherwise create new
        let stats: { lineCount: number; size: number };
        if (session) {
          // Clear query handles but preserve memos
          session.clearQueryHandles();
          try {
            stats = await session.loadFile(filePath);
          } catch (loadErr) {
            return {
              content: [{
                type: "text",
                text: `Error loading file: ${loadErr instanceof Error ? loadErr.message : String(loadErr)}`,
              }],
            };
          }
        } else {
          // Create new session — use temp variable so `session` isn't
          // left pointing at a half-initialised object if loadFile throws.
          // Thread the sampling bridge through so `(llm_query ...)` inside
          // lattice_query can delegate to the MCP client's LLM when the
          // client advertises sampling support.
          const newSession = new HandleSession({
            llmQuery: samplingBridge ?? undefined,
          });
          try {
            stats = await newSession.loadFile(filePath);
          } catch (loadErr) {
            newSession.close();
            return {
              content: [{
                type: "text",
                text: `Error loading file: ${loadErr instanceof Error ? loadErr.message : String(loadErr)}`,
              }],
            };
          }
          session = newSession;
        }

        // Start inactivity timer
        resetInactivityTimer();

        console.error(`[Lattice] Session started: ${filePath} (${stats.lineCount} lines)`);

        return {
          content: [{
            type: "text",
            text: `Loaded ${filePath}:\n` +
              `  Lines: ${stats.lineCount.toLocaleString()}\n` +
              `  Size: ${(stats.size / 1024).toFixed(1)} KB\n` +
              `  Session timeout: ${SESSION_TIMEOUT_MS / 60000} minutes\n\n` +
              `Results will be returned as handle stubs (97%+ token savings).\n` +
              `Use lattice_expand to see full data when needed.\n\n` +
              `Ready for queries. Call lattice_close when done.`,
          }],
        };
      }

      case "lattice_query": {
        if (!session) {
          return {
            content: [{
              type: "text",
              text: "Error: No active session. Use lattice_load first.",
            }],
          };
        }

        const command = args.command as string;
        if (!command) {
          return { content: [{ type: "text", text: "Error: command is required" }] };
        }

        resetInactivityTimer();

        const result = await session.execute(command);
        return { content: [{ type: "text", text: formatHandleResult(result) }] };
      }

      case "lattice_expand": {
        if (!session) {
          return {
            content: [{
              type: "text",
              text: "Error: No active session. Use lattice_load or lattice_memo first.",
            }],
          };
        }

        const handle = args.handle as string;
        if (!handle) {
          return { content: [{ type: "text", text: "Error: handle is required" }] };
        }

        resetInactivityTimer();

        const result = session.expand(handle, {
          limit: args.limit as number | undefined,
          offset: args.offset as number | undefined,
          format: args.format as "full" | "lines" | undefined,
        });

        return { content: [{ type: "text", text: formatExpandResult(result) }] };
      }

      case "lattice_close": {
        if (!session) {
          return { content: [{ type: "text", text: "No active session to close." }] };
        }

        const info = session.getSessionInfo();
        const summary = `Closed session for ${info.documentPath} (${info.queryCount} queries, ${info.handleCount} handles)`;
        closeSession("explicit close");
        return { content: [{ type: "text", text: summary }] };
      }

      case "lattice_status": {
        return { content: [{ type: "text", text: getSessionInfo() }] };
      }

      case "lattice_bindings": {
        if (!session) {
          return { content: [{ type: "text", text: "No active session." }] };
        }

        resetInactivityTimer();

        const bindings = session.getBindings();
        if (Object.keys(bindings).length === 0) {
          return { content: [{ type: "text", text: "No bindings yet. Run a query first." }] };
        }

        const lines = Object.entries(bindings).map(([k, v]) => `  ${k}: ${v}`);
        return {
          content: [{
            type: "text",
            text: `Current bindings:\n${lines.join("\n")}\n\nUse lattice_expand <handle> to see full data.`,
          }],
        };
      }

      case "lattice_reset": {
        if (!session) {
          return { content: [{ type: "text", text: "No active session." }] };
        }

        session.reset();
        resetInactivityTimer();

        return { content: [{ type: "text", text: "Bindings and handles cleared. Document still loaded." }] };
      }

      case "lattice_memo": {
        const content = args.content as string;
        const label = args.label as string;
        if (!content) {
          return { content: [{ type: "text", text: "Error: content is required" }] };
        }
        if (!label) {
          return { content: [{ type: "text", text: "Error: label is required" }] };
        }

        // Auto-create session if none exists (memos don't require a loaded document).
        // Thread sampling bridge so memos-first sessions still get llm_query support.
        if (!session) {
          session = new HandleSession({
            llmQuery: samplingBridge ?? undefined,
          });
          console.error("[Lattice] Auto-created session for memo storage");
        }

        resetInactivityTimer();

        const result = session.memo(content, label);
        if (!result.success) {
          return { content: [{ type: "text", text: `Error: ${result.error}` }] };
        }

        let text = result.stub!;
        if (result.tokenMetadata) {
          text += `\n\nToken savings: ~${result.tokenMetadata.savingsPercent}% (${result.tokenMetadata.stubTokens} vs ~${result.tokenMetadata.estimatedFullTokens} tokens)`;
        }
        text += "\n\nUse lattice_expand to retrieve full content when needed.";
        text += "\nMemos persist across document loads.";
        return { content: [{ type: "text", text }] };
      }

      case "lattice_memo_delete": {
        if (!session) {
          return { content: [{ type: "text", text: "No active session." }] };
        }

        const handle = args.handle as string;
        if (!handle) {
          return { content: [{ type: "text", text: "Error: handle is required" }] };
        }

        resetInactivityTimer();

        const deleted = session.deleteMemo(handle);
        if (!deleted) {
          return { content: [{ type: "text", text: `Error: ${handle} is not a memo handle or does not exist.` }] };
        }

        const stats = session.getMemoStats();
        return {
          content: [{
            type: "text",
            text: `Deleted ${handle}. Memos: ${stats.count}/${stats.maxCount} (${(stats.totalBytes / 1024).toFixed(1)}KB used)`,
          }],
        };
      }

      case "lattice_help": {
        return {
          content: [{ type: "text", text: HandleSession.getCommandReference() }],
        };
      }

      default:
        return { content: [{ type: "text", text: `Unknown tool: ${name}` }] };
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { content: [{ type: "text", text: `Error: ${message}` }] };
  }
}

// Cleanup on exit
process.on("SIGINT", () => {
  closeSession("process interrupted");
  process.exit(0);
});

process.on("SIGTERM", () => {
  closeSession("process terminated");
  process.exit(0);
});

// CLI flags
const skipCwdChecking = process.argv.includes("--dangerously-skip-cwd-checking");

async function main() {
  // Handle version flag
  if (process.argv.includes("-v") || process.argv.includes("--version")) {
    console.log(`lattice-mcp v${getVersion()}`);
    process.exit(0);
  }

  const server = new Server(
    {
      name: "lattice",
      version: getVersion(),
    },
    {
      capabilities: {
        tools: {},
      },
    }
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: TOOLS,
  }));

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;
    return handleToolCall(name, (args as Record<string, unknown>) || {});
  });

  const transport = new StdioServerTransport();
  await server.connect(transport);

  // Wire the sampling bridge once the client has completed the handshake.
  // Only install it if the client advertised `sampling` support — otherwise
  // `(llm_query ...)` inside lattice_query should fail loudly rather than
  // hitting a protocol error when we call server.createMessage.
  const clientCaps = server.getClientCapabilities();
  if (clientCaps?.sampling) {
    samplingBridge = async (prompt: string): Promise<string> => {
      const result = await server.createMessage({
        messages: [{ role: "user", content: { type: "text", text: prompt } }],
        maxTokens: SAMPLING_MAX_TOKENS,
        // `none` keeps the sub-LLM isolated from the parent conversation —
        // the paper's sub-RLM model spins up a fresh context per sub-call.
        includeContext: "none",
      });
      // CreateMessageResult.content is a single block for the no-tools path.
      if (result.content?.type === "text") {
        return result.content.text;
      }
      // Image / audio content blocks are not useful for string interpolation;
      // return a visible placeholder so the solver doesn't crash.
      return `[sub-LLM returned non-text content: ${result.content?.type ?? "unknown"}]`;
    };
    console.error("[Lattice] Sampling bridge enabled — (llm_query ...) will delegate to client LLM");
  } else {
    console.error("[Lattice] Client did not advertise sampling support — (llm_query ...) will be unavailable");
  }

  console.error("[Lattice] MCP server started (handle-based mode)");
  console.error(`[Lattice] Session timeout: ${SESSION_TIMEOUT_MS / 1000}s`);
  console.error(`[Lattice] Max document size: ${MAX_DOCUMENT_SIZE / 1024 / 1024}MB`);
  if (skipCwdChecking) {
    console.error("[Lattice] WARNING: CWD path checking is DISABLED (--dangerously-skip-cwd-checking)");
  }
  console.error("[Lattice] Query results return handle stubs for 97%+ token savings");
}

main().catch((err) => {
  console.error("[Lattice] Fatal error:", err);
  process.exit(1);
});
