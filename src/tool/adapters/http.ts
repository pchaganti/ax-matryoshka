#!/usr/bin/env node
/**
 * HTTP Server Adapter for Lattice
 *
 * Provides a stateful REST API for document analysis with session lifecycle management.
 * Uses Nucleus S-expression syntax for queries.
 *
 * SESSION LIFECYCLE:
 * - Sessions auto-expire after inactivity (default: 10 minutes)
 * - POST /close explicitly ends a session
 * - Loading a new document starts a new session
 *
 * Endpoints:
 *   POST /load          - Load a document (starts session)
 *   POST /query         - Execute a Nucleus query (resets timeout)
 *   POST /close         - Close session and free memory
 *   GET  /status        - Get session status (timeout, queries, etc)
 *   GET  /bindings      - Get current variable bindings
 *   POST /reset         - Reset bindings (keep document)
 *   GET  /stats         - Get document statistics
 *   GET  /help          - Get command reference
 *   GET  /health        - Health check
 *
 * Usage:
 *   lattice-http --port 3456 --timeout 600
 *
 *   curl -X POST http://localhost:3456/load -d '{"filePath":"./data.txt"}'
 *   curl -X POST http://localhost:3456/query -d '{"command":"(grep \"error\")"}'
 *   curl -X POST http://localhost:3456/close
 */

import * as http from "node:http";
import {
  LatticeTool,
  type LatticeResponse,
} from "../lattice-tool.js";

export interface HttpAdapterOptions {
  /** Port to listen on (default: 3456) */
  port?: number;
  /** Host to bind to (default: localhost) */
  host?: string;
  /** Enable CORS (default: true) */
  cors?: boolean;
  /** Session timeout in seconds (default: 600 = 10 minutes) */
  timeoutSeconds?: number;
}

interface Session {
  tool: LatticeTool;
  documentName: string | null;
  loadedAt: Date;
  lastAccessedAt: Date;
  queryCount: number;
}

/**
 * HTTP server adapter with session lifecycle
 */
export class HttpAdapter {
  private session: Session | null = null;
  private server: http.Server | null = null;
  private helpResponse: LatticeResponse | null = null;
  private port: number;
  private host: string;
  private cors: boolean;
  private timeoutMs: number;
  private timeoutHandle: ReturnType<typeof setTimeout> | null = null;

  constructor(options: HttpAdapterOptions = {}) {
    this.port = options.port ?? 3456;
    this.host = options.host ?? "localhost";
    this.cors = options.cors ?? true;
    this.timeoutMs = (options.timeoutSeconds ?? 600) * 1000;
  }

  private resetInactivityTimer(): void {
    if (this.timeoutHandle) {
      clearTimeout(this.timeoutHandle);
    }

    this.timeoutHandle = setTimeout(() => {
      if (this.session) {
        console.log(`[Lattice] Session expired after ${this.timeoutMs / 1000}s inactivity`);
        this.closeSession("timeout");
      }
    }, this.timeoutMs);
  }

  private closeSession(reason: string): void {
    if (this.session) {
      const duration = Date.now() - this.session.loadedAt.getTime();
      console.log(
        `[Lattice] Session closed: ${reason} | ` +
        `Document: ${this.session.documentName || "inline"} | ` +
        `Duration: ${Math.round(duration / 1000)}s | ` +
        `Queries: ${this.session.queryCount}`
      );
      // Dispose engine resources to free memory
      try {
        this.session.tool.getEngine().dispose();
      } catch {
        // Ignore dispose errors during cleanup
      }
      this.session = null;
    }

    if (this.timeoutHandle) {
      clearTimeout(this.timeoutHandle);
      this.timeoutHandle = null;
    }
  }

  private getSessionStatus(): Record<string, unknown> {
    if (!this.session) {
      return { active: false };
    }

    const now = new Date();
    const age = Math.round((now.getTime() - this.session.loadedAt.getTime()) / 1000);
    const idle = Math.round((now.getTime() - this.session.lastAccessedAt.getTime()) / 1000);
    const timeoutIn = Math.max(0, Math.round((this.timeoutMs - idle * 1000) / 1000));

    return {
      active: true,
      document: this.session.documentName,
      loaded: this.session.tool.isLoaded(),
      ageSeconds: age,
      idleSeconds: idle,
      timeoutInSeconds: timeoutIn,
      queryCount: this.session.queryCount,
    };
  }

  /**
   * Start the HTTP server
   */
  async start(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.server = http.createServer((req, res) => {
        this.handleRequest(req, res).catch((err) => {
          if (!res.headersSent) {
            this.sendError(res, 500, err instanceof Error ? err.message : String(err));
          }
        });
      });
      this.server.requestTimeout = 30_000;  // 30s max per request
      this.server.headersTimeout = 10_000;  // 10s for headers

      this.server.on("error", reject);

      this.server.listen(this.port, this.host, () => {
        console.log(`Lattice HTTP server running at http://${this.host}:${this.port}`);
        console.log(`Session timeout: ${this.timeoutMs / 1000} seconds`);
        console.log("Endpoints:");
        console.log("  POST /load      - Load a document (starts session)");
        console.log("  POST /query     - Execute Nucleus command");
        console.log("  POST /close     - Close session and free memory");
        console.log("  GET  /status    - Get session status");
        console.log("  GET  /bindings  - Get current bindings");
        console.log("  POST /reset     - Reset bindings");
        console.log("  GET  /stats     - Get document stats");
        console.log("  GET  /help      - Command reference");
        console.log("  GET  /health    - Health check");
        resolve();
      });
    });
  }

  /**
   * Stop the server
   */
  async stop(): Promise<void> {
    this.closeSession("server stopped");

    return new Promise((resolve) => {
      if (this.server) {
        this.server.close(() => resolve());
      } else {
        resolve();
      }
    });
  }

  /**
   * Handle an HTTP request
   */
  private async handleRequest(
    req: http.IncomingMessage,
    res: http.ServerResponse
  ): Promise<void> {
    // CORS headers
    if (this.cors) {
      res.setHeader("Access-Control-Allow-Origin", "*");
      res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
      res.setHeader("Access-Control-Allow-Headers", "Content-Type");

      if (req.method === "OPTIONS") {
        res.writeHead(204);
        res.end();
        return;
      }
    }

    res.setHeader("Content-Type", "application/json");

    const url = new URL(req.url || "/", `http://${req.headers.host}`);
    const path = url.pathname;

    try {
      let response: LatticeResponse;

      switch (path) {
        case "/load":
          if (req.method !== "POST") {
            this.sendError(res, 405, "Method not allowed");
            return;
          }
          if (!this.validateJsonContentType(req, res)) return;
          response = await this.handleLoad(req);
          break;

        case "/query":
          if (req.method !== "POST") {
            this.sendError(res, 405, "Method not allowed");
            return;
          }
          if (!this.validateJsonContentType(req, res)) return;
          response = await this.handleQuery(req);
          break;

        case "/close":
          if (req.method !== "POST") {
            this.sendError(res, 405, "Method not allowed");
            return;
          }
          response = this.handleClose();
          break;

        case "/status":
          response = {
            success: true,
            data: this.getSessionStatus(),
          };
          break;

        case "/bindings":
          response = this.handleWithSession((session) => session.tool.execute({ type: "bindings" }));
          break;

        case "/reset":
          if (req.method !== "POST") {
            this.sendError(res, 405, "Method not allowed");
            return;
          }
          response = this.handleWithSession((session) => session.tool.execute({ type: "reset" }));
          break;

        case "/stats":
          response = this.handleWithSession((session) => session.tool.execute({ type: "stats" }));
          break;

        case "/help":
          if (!this.helpResponse) {
            this.helpResponse = new LatticeTool().execute({ type: "help" });
          }
          response = this.helpResponse;
          break;

        case "/health":
          response = {
            success: true,
            data: {
              status: "ok",
              session: this.getSessionStatus(),
            },
          };
          break;

        default:
          this.sendError(res, 404, `Unknown endpoint: ${path}`);
          return;
      }

      this.sendResponse(res, response);
    } catch (err) {
      if (!res.headersSent) {
        this.sendError(res, 500, err instanceof Error ? err.message : String(err));
      }
    }
  }

  /**
   * Handle /load endpoint
   */
  private async handleLoad(req: http.IncomingMessage): Promise<LatticeResponse> {
    const body = await this.readBody(req);

    // Close existing session
    if (this.session) {
      this.closeSession("new document loaded");
    }

    // Create new session
    const tool = new LatticeTool();
    let response: LatticeResponse;

    if (typeof body.filePath === "string") {
      response = await tool.executeAsync({ type: "load", filePath: body.filePath });
    } else if (typeof body.content === "string") {
      response = tool.execute({
        type: "loadContent",
        content: body.content,
        name: typeof body.name === "string" ? body.name : undefined,
      });
    } else {
      return { success: false, error: "Provide 'filePath' or 'content'" };
    }

    if (response.success) {
      this.session = {
        tool,
        documentName: tool.getDocumentName(),
        loadedAt: new Date(),
        lastAccessedAt: new Date(),
        queryCount: 0,
      };
      this.resetInactivityTimer();
      console.log(`[Lattice] Session started: ${this.session.documentName}`);
    }

    return response;
  }

  /**
   * Handle /query endpoint
   */
  private async handleQuery(req: http.IncomingMessage): Promise<LatticeResponse> {
    if (!this.session) {
      return { success: false, error: "No active session. POST /load first." };
    }

    const body = await this.readBody(req);

    if (typeof body.command !== "string") {
      return { success: false, error: "Missing 'command' field" };
    }

    // Update session
    this.session.lastAccessedAt = new Date();
    this.session.queryCount++;
    this.resetInactivityTimer();

    return this.session.tool.execute({ type: "query", command: body.command });
  }

  /**
   * Handle /close endpoint
   */
  private handleClose(): LatticeResponse {
    if (!this.session) {
      return { success: true, message: "No active session to close." };
    }

    const info = `Closed session for ${this.session.documentName} (${this.session.queryCount} queries)`;
    this.closeSession("explicit close");
    return { success: true, message: info };
  }

  /**
   * Handle request that requires an active session
   */
  private handleWithSession(fn: (session: Session) => LatticeResponse): LatticeResponse {
    if (!this.session) {
      return { success: false, error: "No active session. POST /load first." };
    }

    // Update access time
    this.session.lastAccessedAt = new Date();
    this.resetInactivityTimer();

    return fn(this.session);
  }

  /**
   * Read and parse JSON body
   */
  private readBody(req: http.IncomingMessage): Promise<Record<string, unknown>> {
    const MAX_BODY_SIZE = 10 * 1024 * 1024; // 10MB
    return new Promise((resolve, reject) => {
      const chunks: Buffer[] = [];
      let totalBytes = 0;
      let settled = false;

      req.on("data", (chunk: Buffer) => {
        if (settled) return;
        totalBytes += chunk.length;
        if (totalBytes > MAX_BODY_SIZE) {
          settled = true;
          req.destroy();
          reject(new Error("Request body too large"));
          return;
        }
        chunks.push(chunk);
      });

      req.on("end", () => {
        if (settled) return;
        settled = true;
        if (chunks.length === 0) {
          resolve({});
          return;
        }

        try {
          const data = Buffer.concat(chunks).toString("utf8");
          resolve(JSON.parse(data));
        } catch {
          reject(new Error("Invalid JSON body"));
        }
      });

      req.on("error", (err) => {
        if (settled) return;
        settled = true;
        reject(err);
      });
    });
  }

  /**
   * Send a successful response
   */
  private sendResponse(res: http.ServerResponse, response: LatticeResponse): void {
    res.writeHead(response.success ? 200 : 400);
    res.end(JSON.stringify(response, null, 2));
  }

  /**
   * Validate Content-Type header for POST endpoints that require JSON
   */
  private validateJsonContentType(req: http.IncomingMessage, res: http.ServerResponse): boolean {
    const contentType = req.headers["content-type"] || "";
    if (!contentType.includes("application/json")) {
      this.sendError(res, 415, "Content-Type must be application/json");
      return false;
    }
    return true;
  }

  /**
   * Send an error response
   */
  private sendError(res: http.ServerResponse, status: number, message: string): void {
    res.writeHead(status);
    res.end(JSON.stringify({ success: false, error: message }));
  }

  /**
   * Get the underlying tool (if session exists)
   */
  getTool(): LatticeTool | null {
    return this.session?.tool ?? null;
  }

  /**
   * Get server info
   */
  getServerInfo(): { host: string; port: number; timeoutSeconds: number } {
    return { host: this.host, port: this.port, timeoutSeconds: this.timeoutMs / 1000 };
  }
}

/**
 * Create and start an HTTP adapter
 */
export async function startHttpAdapter(options?: HttpAdapterOptions): Promise<HttpAdapter> {
  const adapter = new HttpAdapter(options);
  await adapter.start();
  return adapter;
}

/**
 * CLI entry point
 */
function main(): void {
  const args = process.argv.slice(2);

  if (args.includes("--help") || args.includes("-h")) {
    console.log(`
Lattice HTTP Server

Usage:
  lattice-http [options]

Options:
  --port <n>      Port to listen on (default: 3456)
  --host <addr>   Host to bind to (default: localhost)
  --timeout <s>   Session timeout in seconds (default: 600)
  --no-cors       Disable CORS headers
  --help, -h      Show this help

Session Lifecycle:
  Sessions auto-expire after --timeout seconds of inactivity.
  Use POST /close to explicitly end a session and free memory.

Endpoints:
  POST /load      Load a document (starts session)
                  Body: {"filePath": "..."} or {"content": "...", "name": "..."}

  POST /query     Execute Nucleus command (resets timeout)
                  Body: {"command": "(grep \\"pattern\\")"}

  POST /close     Close session and free memory

  GET  /status    Get session status (timeout, queries, etc)

  GET  /bindings  Get current variable bindings

  POST /reset     Reset bindings (keep document)

  GET  /stats     Get document statistics

  GET  /help      Get Nucleus command reference

  GET  /health    Health check with session info

Examples:
  # Start server with 5-minute timeout
  lattice-http --port 8080 --timeout 300

  # Load a document
  curl -X POST http://localhost:8080/load \\
    -H "Content-Type: application/json" \\
    -d '{"filePath": "./logs.txt"}'

  # Query
  curl -X POST http://localhost:8080/query \\
    -H "Content-Type: application/json" \\
    -d '{"command": "(grep \\"ERROR\\")"}'

  # Close session when done
  curl -X POST http://localhost:8080/close
`);
    process.exit(0);
  }

  // Parse options
  let port = 3456;
  let host = "localhost";
  let cors = true;
  let timeoutSeconds = 600;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--port" && args[i + 1]) {
      port = parseInt(args[++i], 10);
    } else if (args[i] === "--host" && args[i + 1]) {
      host = args[++i];
    } else if (args[i] === "--timeout" && args[i + 1]) {
      timeoutSeconds = parseInt(args[++i], 10);
    } else if (args[i] === "--no-cors") {
      cors = false;
    }
  }

  const adapter = startHttpAdapter({ port, host, cors, timeoutSeconds });

  // Handle shutdown gracefully
  adapter.then((a) => {
    const shutdown = () => {
      console.log("\n[Lattice] Shutting down...");
      a.stop().then(() => process.exit(0)).catch(() => process.exit(1));
    };
    process.on("SIGINT", shutdown);
    process.on("SIGTERM", shutdown);
  }).catch((err) => {
    console.error("Fatal error:", err);
    process.exit(1);
  });
}

// Run if executed directly
if (process.argv[1]?.endsWith("http.ts") || process.argv[1]?.endsWith("http.js") || process.argv[1]?.endsWith("lattice-http")) {
  main();
}
