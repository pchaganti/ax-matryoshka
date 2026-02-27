#!/usr/bin/env node
/**
 * Pipe-based Lattice Adapter
 *
 * Runs as a subprocess that reads JSON commands from stdin and writes
 * JSON responses to stdout. This allows any process to control Lattice
 * programmatically. Uses Nucleus S-expression syntax for queries.
 *
 * Protocol:
 *   - Input: JSON-encoded LatticeCommand per line
 *   - Output: JSON-encoded LatticeResponse per line
 *
 * Usage:
 *   echo '{"type":"loadContent","content":"test data"}' | lattice-pipe
 *   echo '{"type":"query","command":"(grep \"test\")"}' | lattice-pipe
 *
 * Or for interactive use:
 *   lattice-pipe --interactive
 *   > :load ./file.txt
 *   > (grep "pattern")
 */

import * as readline from "node:readline";
import {
  LatticeTool,
  parseCommand,
  formatResponse,
  type LatticeCommand,
  type LatticeResponse,
} from "../lattice-tool.js";

export interface PipeAdapterOptions {
  /** Use interactive text mode instead of JSON */
  interactive?: boolean;
  /** Input stream (default: process.stdin) */
  input?: NodeJS.ReadableStream;
  /** Output stream (default: process.stdout) */
  output?: NodeJS.WritableStream;
  /** Error stream (default: process.stderr) */
  error?: NodeJS.WritableStream;
}

/**
 * Pipe-based adapter for subprocess control
 */
export class PipeAdapter {
  private tool: LatticeTool;
  private interactive: boolean;
  private input: NodeJS.ReadableStream;
  private output: NodeJS.WritableStream;
  private processing: boolean = false;
  private queue: string[] = [];
  constructor(options: PipeAdapterOptions = {}) {
    this.tool = new LatticeTool();
    this.interactive = options.interactive ?? false;
    this.input = options.input ?? process.stdin;
    this.output = options.output ?? process.stdout;
  }

  /**
   * Start the pipe adapter
   */
  async start(): Promise<void> {
    const rl = readline.createInterface({
      input: this.input,
      output: this.interactive ? this.output : undefined,
      prompt: this.interactive ? "lattice> " : "",
      terminal: this.interactive,
    });

    if (this.interactive) {
      this.output.write("Lattice Pipe Adapter (interactive mode)\n");
      this.output.write("Commands: :load <file>, :bindings, :reset, :stats, :help, :quit\n");
      this.output.write("Or enter Nucleus queries: (grep \"pattern\")\n\n");
      rl.prompt();
    }

    const processLine = async (trimmed: string) => {
      try {
        // Handle quit
        if (this.interactive && (trimmed === ":quit" || trimmed === ":q" || trimmed === ":exit")) {
          this.output.write("Goodbye!\n");
          rl.close();
          return;
        }

        let response: LatticeResponse;

        if (this.interactive) {
          // Interactive text mode
          response = await this.handleInteractive(trimmed);
          this.output.write(formatResponse(response) + "\n");
          rl.prompt();
        } else {
          // JSON mode
          response = await this.handleJSON(trimmed);
          this.output.write(JSON.stringify(response) + "\n");
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        if (this.interactive) {
          this.output.write(`Error: ${msg}\n`);
          rl.prompt();
        } else {
          this.output.write(JSON.stringify({ success: false, error: msg }) + "\n");
        }
      }
    };

    const drainQueue = async () => {
      if (this.processing) return;
      this.processing = true;
      try {
        while (this.queue.length > 0) {
          const line = this.queue.shift()!;
          await processLine(line);
        }
      } finally {
        this.processing = false;
      }
    };

    rl.on("line", (line) => {
      const trimmed = line.trim();
      if (!trimmed) {
        if (this.interactive) rl.prompt();
        return;
      }
      this.queue.push(trimmed);
      void drainQueue();
    });

    rl.on("error", (err) => {
      console.error("[PipeAdapter] Readline error:", err.message);
    });

    rl.on("close", () => {
      // Graceful shutdown: allow pending async operations to drain
      setImmediate(() => process.exit(0));
    });
  }

  /**
   * Handle interactive text command
   */
  private async handleInteractive(input: string): Promise<LatticeResponse> {
    const command = parseCommand(input);

    if (!command) {
      return {
        success: false,
        error: `Unknown command: ${input}. Use :help for available commands.`,
      };
    }

    if (command.type === "load") {
      return this.tool.executeAsync(command);
    }

    return this.tool.execute(command);
  }

  /**
   * Handle JSON command
   */
  private async handleJSON(input: string): Promise<LatticeResponse> {
    let command: LatticeCommand;

    try {
      command = JSON.parse(input) as LatticeCommand;
    } catch {
      return {
        success: false,
        error: `Invalid JSON: ${input.slice(0, 200)}`,
      };
    }

    if (!command.type) {
      return {
        success: false,
        error: "Missing 'type' field in command",
      };
    }

    // Validate required fields based on command type
    if (command.type === "load") {
      if (typeof (command as Record<string, unknown>).filePath !== "string") {
        return { success: false, error: "load command requires 'filePath' string field" };
      }
      return this.tool.executeAsync(command);
    }

    if (command.type === "query") {
      if (typeof (command as Record<string, unknown>).command !== "string") {
        return { success: false, error: "query command requires 'command' string field" };
      }
    }

    return this.tool.execute(command);
  }

  /**
   * Execute a single command (for programmatic use)
   */
  async executeCommand(command: LatticeCommand): Promise<LatticeResponse> {
    if (command.type === "load") {
      return this.tool.executeAsync(command);
    }
    return this.tool.execute(command);
  }

  /**
   * Get the underlying tool
   */
  getTool(): LatticeTool {
    return this.tool;
  }
}

/**
 * Create and start a pipe adapter
 */
export async function startPipeAdapter(options?: PipeAdapterOptions): Promise<PipeAdapter> {
  const adapter = new PipeAdapter(options);
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
Lattice Pipe Adapter

Usage:
  lattice-pipe [options]

Options:
  --interactive, -i   Use interactive text mode instead of JSON
  --help, -h          Show this help

JSON Mode (default):
  Reads JSON commands from stdin, writes JSON responses to stdout.

  Commands:
    {"type": "load", "filePath": "./file.txt"}
    {"type": "loadContent", "content": "data here", "name": "optional-name"}
    {"type": "query", "command": "(grep \\"pattern\\")"}
    {"type": "bindings"}
    {"type": "reset"}
    {"type": "stats"}
    {"type": "help"}

Interactive Mode (-i):
  Uses text commands like the REPL.

  Commands:
    :load <file>     Load a document
    :bindings        Show current bindings
    :reset           Clear bindings
    :stats           Show document stats
    :help            Show Nucleus command reference
    :quit            Exit
    (grep "...")     Execute Nucleus command

Examples:
  # JSON mode
  echo '{"type":"loadContent","content":"line1\\nline2"}' | lattice-pipe

  # Interactive mode
  lattice-pipe -i
`);
    process.exit(0);
  }

  const interactive = args.includes("--interactive") || args.includes("-i");

  startPipeAdapter({ interactive }).catch((err) => {
    console.error("Fatal error:", err);
    process.exit(1);
  });
}

// Run if executed directly
if (process.argv[1]?.endsWith("pipe.ts") || process.argv[1]?.endsWith("pipe.js") || process.argv[1]?.endsWith("lattice-pipe")) {
  main();
}
