# Recursive Language Model (RLM) Implementation Plan

Based on the [RLM paper](https://arxiv.org/abs/2512.24601), this project enables LLMs to process documents **100x larger than their context window** by treating text as an external variable in a sandboxed REPL.

## Core Architecture

### The "Inception" Pattern

Standard RAG retrieves chunks based on similarity. RLM is different:

1. **Context as Variable** - The document lives in a sandbox as a variable, not in the LLM's context
2. **Root LM Orchestrates** - The model writes code to explore, chunk, and process the document
3. **Recursive Sub-Calls** - The model calls itself (`llm_query`) to process chunks
4. **Adaptive Decomposition** - Chunking strategy is decided at runtime, not predetermined

```
┌─────────────────────────────────────────────────────┐
│  Root LM (sees only query)                          │
│    ↓ writes code                                    │
│  ┌─────────────────────────────────────────────┐    │
│  │  TypeScript Sandbox (VM isolated)           │    │
│  │    - context: string (the huge document)    │    │
│  │    - llm_query(prompt): recursive calls     │    │
│  │    - grep, chunk, slice operations          │    │
│  └─────────────────────────────────────────────┘    │
│    ↓ execution result                               │
│  Root LM sees output → writes more code → repeat    │
│    ↓                                                │
│  FINAL("answer") → done                             │
└─────────────────────────────────────────────────────┘
```

---

## Phase 1: Prerequisites

1. **Node.js 20+** - For TypeScript execution and VM sandbox
2. **Local Model** - Ollama with a code-capable model
   - Recommended: `qwen3-coder:30b` or `deepseek-coder-v2`
3. **Dependencies:**
   ```bash
   npm install @anthropic-ai/sdk isolated-vm typescript tsx
   npm install @utcp/code-mode  # For UTCP tool registration
   ```

---

## Phase 2: Project Structure

```
recursive-language-model/
├── src/
│   ├── index.ts           # Entry point
│   ├── config.ts          # Config loader
│   ├── llm/
│   │   ├── index.ts       # Provider registry
│   │   ├── types.ts       # LLM interfaces
│   │   ├── ollama.ts      # Ollama adapter
│   │   ├── deepseek.ts    # DeepSeek adapter
│   │   └── openai.ts      # OpenAI-compatible adapter
│   ├── sandbox.ts         # TypeScript VM sandbox
│   ├── fuzzy-search.ts    # Bundled fuzzy search (string)
│   ├── tools.ts           # UTCP tool definitions
│   ├── rlm.ts             # Main RLM execution loop
│   └── mcp-server.ts      # MCP server for UI integration
├── tests/
│   ├── llm.test.ts
│   ├── sandbox.test.ts
│   ├── tools.test.ts
│   ├── rlm.test.ts
│   └── e2e.test.ts
├── test-fixtures/
│   └── *.txt
├── config.json            # User configuration
├── package.json
└── tsconfig.json
```

---

## Phase 3: Implementation

### 1. Configuration (`config.json`)

```json
{
  "llm": {
    "provider": "ollama",
    "model": "qwen3-coder:30b",
    "options": {
      "temperature": 0.2,
      "num_ctx": 8192
    }
  },
  "providers": {
    "ollama": {
      "baseUrl": "http://localhost:11434"
    },
    "deepseek": {
      "baseUrl": "https://api.deepseek.com",
      "apiKey": "${DEEPSEEK_API_KEY}"
    },
    "openai": {
      "baseUrl": "https://api.openai.com/v1",
      "apiKey": "${OPENAI_API_KEY}"
    },
    "anthropic": {
      "baseUrl": "https://api.anthropic.com",
      "apiKey": "${ANTHROPIC_API_KEY}"
    }
  },
  "sandbox": {
    "maxSubCalls": 10,
    "turnTimeoutMs": 30000,
    "memoryLimitMb": 128
  },
  "rlm": {
    "maxTurns": 10
  }
}
```

### 2. LLM Adapter Interface (`src/llm/types.ts`)

```typescript
export interface LLMConfig {
  provider: string;
  model: string;
  options?: {
    temperature?: number;
    num_ctx?: number;
    max_tokens?: number;
  };
}

export interface LLMProvider {
  name: string;
  query(prompt: string, config: LLMConfig): Promise<string>;
  stream?(prompt: string, config: LLMConfig, onChunk: (chunk: string) => void): Promise<string>;
}

export interface ProviderConfig {
  baseUrl: string;
  apiKey?: string;
}
```

### 3. Ollama Adapter (`src/llm/ollama.ts`)

```typescript
import { LLMProvider, LLMConfig, ProviderConfig } from "./types";

export function createOllamaProvider(config: ProviderConfig): LLMProvider {
  return {
    name: "ollama",

    async query(prompt: string, llmConfig: LLMConfig): Promise<string> {
      const response = await fetch(`${config.baseUrl}/api/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: llmConfig.model,
          prompt,
          stream: false,
          options: {
            temperature: llmConfig.options?.temperature ?? 0.2,
            num_ctx: llmConfig.options?.num_ctx ?? 8192
          }
        })
      });

      if (!response.ok) {
        throw new Error(`Ollama error: ${response.status} ${response.statusText}`);
      }

      const data = await response.json();
      return data.response;
    }
  };
}
```

### 4. DeepSeek Adapter (`src/llm/deepseek.ts`)

```typescript
import { LLMProvider, LLMConfig, ProviderConfig } from "./types";

export function createDeepSeekProvider(config: ProviderConfig): LLMProvider {
  return {
    name: "deepseek",

    async query(prompt: string, llmConfig: LLMConfig): Promise<string> {
      const response = await fetch(`${config.baseUrl}/chat/completions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${config.apiKey}`
        },
        body: JSON.stringify({
          model: llmConfig.model,
          messages: [{ role: "user", content: prompt }],
          temperature: llmConfig.options?.temperature ?? 0.2,
          max_tokens: llmConfig.options?.max_tokens ?? 4096
        })
      });

      if (!response.ok) {
        throw new Error(`DeepSeek error: ${response.status} ${response.statusText}`);
      }

      const data = await response.json();
      return data.choices[0].message.content;
    }
  };
}
```

### 5. OpenAI-Compatible Adapter (`src/llm/openai.ts`)

```typescript
import { LLMProvider, LLMConfig, ProviderConfig } from "./types";

export function createOpenAIProvider(config: ProviderConfig): LLMProvider {
  return {
    name: "openai",

    async query(prompt: string, llmConfig: LLMConfig): Promise<string> {
      const response = await fetch(`${config.baseUrl}/chat/completions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${config.apiKey}`
        },
        body: JSON.stringify({
          model: llmConfig.model,
          messages: [{ role: "user", content: prompt }],
          temperature: llmConfig.options?.temperature ?? 0.2,
          max_tokens: llmConfig.options?.max_tokens ?? 4096
        })
      });

      if (!response.ok) {
        throw new Error(`OpenAI error: ${response.status} ${response.statusText}`);
      }

      const data = await response.json();
      return data.choices[0].message.content;
    }
  };
}
```

### 6. Provider Registry (`src/llm/index.ts`)

```typescript
import { LLMProvider, LLMConfig, ProviderConfig } from "./types";
import { createOllamaProvider } from "./ollama";
import { createDeepSeekProvider } from "./deepseek";
import { createOpenAIProvider } from "./openai";

const providerFactories: Record<string, (config: ProviderConfig) => LLMProvider> = {
  ollama: createOllamaProvider,
  deepseek: createDeepSeekProvider,
  openai: createOpenAIProvider,
  // anthropic: createAnthropicProvider, // Add as needed
};

export function createLLMClient(
  providerName: string,
  providerConfig: ProviderConfig,
  llmConfig: LLMConfig
): (prompt: string) => Promise<string> {
  const factory = providerFactories[providerName];
  if (!factory) {
    throw new Error(`Unknown LLM provider: ${providerName}. Available: ${Object.keys(providerFactories).join(", ")}`);
  }

  // Resolve environment variables in apiKey
  if (providerConfig.apiKey?.startsWith("${") && providerConfig.apiKey?.endsWith("}")) {
    const envVar = providerConfig.apiKey.slice(2, -1);
    providerConfig.apiKey = process.env[envVar];
    if (!providerConfig.apiKey) {
      throw new Error(`Environment variable ${envVar} not set for ${providerName} provider`);
    }
  }

  const provider = factory(providerConfig);

  // Return a simple query function bound to this config
  return (prompt: string) => provider.query(prompt, llmConfig);
}

export * from "./types";
```

### 2. TypeScript Sandbox (`src/sandbox.ts`)

Using `isolated-vm` for secure execution with timeout protection:

```typescript
import ivm from "isolated-vm";
import { FUZZY_SEARCH_IMPL } from "./fuzzy-search"; // Bundled as string, no external modules

export interface SandboxResult {
  result: unknown;
  logs: string[];
  error?: string;
}

export interface SandboxOptions {
  maxSubCalls?: number;  // Prevent infinite width (default: 10)
  memoryLimitMb?: number;
}

export async function createSandbox(
  context: string,
  llmQuery: (p: string) => Promise<string>,
  options: SandboxOptions = {}
) {
  const { maxSubCalls = 10, memoryLimitMb = 128 } = options;

  const isolate = new ivm.Isolate({ memoryLimit: memoryLimitMb });
  const vmContext = await isolate.createContext();

  // Expose the document as a variable
  await vmContext.global.set("context", context);

  // Capture console.log output
  const logs: string[] = [];
  await vmContext.global.set("__log", new ivm.Callback((msg: string) => {
    logs.push(msg);
  }));

  // Track sub-call count to prevent infinite width attacks
  let subCallCount = 0;
  await vmContext.global.set("__llmQuery", new ivm.Callback(
    async (prompt: string) => {
      subCallCount++;
      if (subCallCount > maxSubCalls) {
        throw new Error(`Max sub-calls limit exceeded (${maxSubCalls}). Use text_stats() and fuzzy_search() to narrow your search first.`);
      }
      // IMPORTANT: Pass ONLY the prompt, never the parent history
      return llmQuery(prompt);
    },
    { async: true }
  ));

  // text_stats: See data structure without reading tokens
  const lines = context.split("\n");
  const stats = {
    length: context.length,
    lineCount: lines.length,
    sample: {
      start: lines.slice(0, 5).join("\n"),
      middle: lines.slice(Math.floor(lines.length / 2) - 2, Math.floor(lines.length / 2) + 3).join("\n"),
      end: lines.slice(-5).join("\n")
    }
  };
  await vmContext.global.set("__textStats", JSON.stringify(stats));

  // fuzzy_search: Bundled implementation (no external modules in isolate)
  await vmContext.global.set("__lines", JSON.stringify(lines));

  // Bootstrap code to wire up the API (includes bundled fuzzy search)
  await vmContext.eval(`
    const console = { log: (...args) => __log(args.join(' ')) };
    const llm_query = async (prompt) => __llmQuery(prompt);

    // text_stats: Get metadata without reading tokens
    const text_stats = () => JSON.parse(__textStats);

    // Bundled fuzzy search (Bitap algorithm - no external dependencies)
    const __linesArray = JSON.parse(__lines);
    ${FUZZY_SEARCH_IMPL}

    // Memory buffer for accumulating results (avoids flooding context)
    let memory = [];
  `);

  return {
    async execute(code: string, timeoutMs = 30000): Promise<SandboxResult> {
      try {
        const script = await isolate.compileScript(code);
        const result = await script.run(vmContext, { timeout: timeoutMs });
        return { result, logs };
      } catch (err) {
        return { result: null, logs, error: String(err) };
      }
    },

    dispose() {
      isolate.dispose();
    }
  };
}
```

**Security benefits over Python `exec()`:**
- Memory limits enforced
- Timeout protection (prevents infinite loops)
- No filesystem access
- No network access outside exposed functions
- API keys never visible to generated code

### 3. UTCP Tool Registration (`src/tools.ts`)

```typescript
import { CodeModeUtcpClient } from "@utcp/code-mode";

export async function registerRLMTools(client: CodeModeUtcpClient) {
  // Register the RLM tools via UTCP
  await client.registerManual({
    name: "rlm",
    call_template_type: "custom",
    tools: [
      {
        name: "llm_query",
        description: "Query a sub-LLM to process a chunk of text. Expensive - batch when possible.",
        parameters: {
          type: "object",
          properties: {
            prompt: { type: "string", description: "The prompt to send to the sub-LLM" }
          },
          required: ["prompt"]
        }
      },
      {
        name: "text_stats",
        description: "Get document metadata WITHOUT reading tokens: length, line count, 5-line samples from start/middle/end",
        parameters: { type: "object", properties: {} }
      },
      {
        name: "fuzzy_search",
        description: "Find approximate keyword matches using fuzzy string matching (fuse.js). Returns matching lines with scores.",
        parameters: {
          type: "object",
          properties: {
            query: { type: "string", description: "Search term (approximate matching)" },
            limit: { type: "number", description: "Max results (default 10)" }
          },
          required: ["query"]
        }
      },
      {
        name: "context.slice",
        description: "Get a portion of the context by character indices",
        parameters: {
          type: "object",
          properties: {
            start: { type: "number" },
            end: { type: "number" }
          },
          required: ["start", "end"]
        }
      },
      {
        name: "context.match",
        description: "Search context with regex, returns all matches",
        parameters: {
          type: "object",
          properties: {
            pattern: { type: "string", description: "Regex pattern (e.g., /keyword/gi)" }
          },
          required: ["pattern"]
        }
      }
    ]
  });

  // Generate TypeScript interfaces for the LLM
  return client.getAllToolsTypeScriptInterfaces();
}
```

### 4. Main RLM Loop (`src/rlm.ts`)

The iterative loop that preserves RLM's adaptive decomposition:

```typescript
import { createSandbox } from "./sandbox";
import { llmQuery } from "./llm";

const SYSTEM_PROMPT = (contextLength: number, toolInterfaces: string) => `
You are a Recursive Language Model with access to a TypeScript sandbox.

The variable \`context\` contains text you must analyze (${contextLength.toLocaleString()} characters).
You CANNOT read it all at once - it's too large for your context window.

## Available Tools
${toolInterfaces}

## Available in Sandbox
- \`context\`: The full document (string)
- \`memory\`: Array to accumulate findings (persists across turns)
- \`text_stats()\`: Get length, line count, and 5-line samples from start/middle/end
- \`fuzzy_search(query, limit?)\`: Find approximate keyword matches
- \`await llm_query(prompt)\`: Call sub-LLM to process chunks (expensive!)
- \`console.log()\`: Print output (use sparingly)

## Workflow
1. **Explore first**: Call \`text_stats()\` to understand structure WITHOUT reading tokens
2. **Search smartly**: Use \`fuzzy_search()\` or \`context.match(/regex/g)\` to locate relevant sections
3. **Store in memory**: Push findings to \`memory\` array, NOT console.log
4. **Batch llm_query calls**: Process multiple chunks per call when possible
5. **Print summaries only**: Never print raw chunks

## CRITICAL: Context Management
Your context window is limited. Every console.log() output comes back to you.

BAD (wastes your context):
\`\`\`typescript
const chunk = context.slice(0, 5000);
console.log(chunk);  // 5000 chars floods your context!
\`\`\`

GOOD (preserves context):
\`\`\`typescript
const chunk = context.slice(0, 5000);
const analysis = await llm_query("Summarize: " + chunk);
memory.push({ section: "intro", summary: analysis });
console.log("Processed intro, memory has " + memory.length + " items");
\`\`\`

## FORBIDDEN: Full Context Iteration
Do NOT loop through entire context indices. This will exhaust sub-call limits:
\`\`\`typescript
// BAD - Do not do this!
for (let i = 0; i < context.length; i += 1000) {
  await llm_query(context.slice(i, i + 1000)); // Will hit maxSubCalls limit!
}
\`\`\`

Instead, use text_stats() and fuzzy_search() to identify relevant sections FIRST, then process only those.

## Termination
When ready, output your answer between delimiters:

\`\`\`
<<<FINAL>>>
Your answer here (can be multiline, contain quotes, JSON, etc.)
<<<END>>>
\`\`\`

Or return a variable: \`FINAL_VAR(memory)\`

Wrap all code in \`\`\`typescript blocks.
`;

export interface RLMOptions {
  maxTurns?: number;
  turnTimeoutMs?: number;
  maxSubCalls?: number;  // Prevent infinite width attacks
}

export async function runRLM(
  query: string,
  filePath: string,
  options: RLMOptions = {}
): Promise<string> {
  const { maxTurns = 10, turnTimeoutMs = 30000, maxSubCalls = 10 } = options;

  // Load the document
  const context = await Bun.file(filePath).text(); // or fs.readFileSync

  // Create isolated sandbox with sub-call limiting
  const sandbox = await createSandbox(context, llmQuery, { maxSubCalls });

  // Build conversation history
  const history: string[] = [
    `System: ${SYSTEM_PROMPT(context.length, "")}`,
    `User: ${query}`
  ];

  try {
    for (let turn = 0; turn < maxTurns; turn++) {
      console.log(`--- Turn ${turn + 1} ---`);

      // Call Root LM
      const response = await llmQuery(history.join("\n"));
      console.log(`Root LM:\n${response}\n`);

      // Check for final answer (using delimiters to handle quotes/JSON safely)
      const finalDelimited = response.match(/<<<FINAL>>>([\s\S]*?)<<<END>>>/);
      if (finalDelimited) {
        return finalDelimited[1].trim();
      }

      // Also check for FINAL_VAR(variableName)
      const finalVar = response.match(/FINAL_VAR\((\w+)\)/);
      if (finalVar) {
        // Resolve variable from sandbox
        const varResult = await sandbox.execute(finalVar[1]);
        return JSON.stringify(varResult.result);
      }

      // Extract TypeScript code
      const codeMatch = response.match(/```typescript([\s\S]*?)```/);

      if (codeMatch) {
        const code = codeMatch[1].trim();
        console.log(`Executing:\n${code}\n`);

        // Execute in sandbox with timeout
        const { result, logs, error } = await sandbox.execute(code, turnTimeoutMs);

        let output: string;
        if (error) {
          // Feed error back for self-correction
          output = `Error executing code:\n${error}\n\nPlease fix your code and try again.`;
        } else {
          output = `Output:\n${logs.join("\n")}\nResult: ${JSON.stringify(result)}`;
        }

        console.log(`Sandbox: ${output}\n`);

        // Feed result back to Root LM (adaptive - it sees this before next code)
        history.push(`Assistant: ${response}`);
        history.push(`System: Sandbox execution:\n${output}`);
      } else {
        history.push(`Assistant: ${response}`);
        history.push(`System: Please write TypeScript code to analyze the context, or output <<<FINAL>>>your answer<<<END>>>.`);
      }
    }

    return "Max turns reached without final answer.";
  } finally {
    sandbox.dispose();
  }
}
```

### 5. MCP Server (`src/mcp-server.ts`)

For integration with Claude Desktop or other MCP-compatible clients:

```typescript
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { runRLM } from "./rlm";

const server = new McpServer({
  name: "rlm-server",
  version: "1.0.0"
});

// Register RLM as a tool
server.tool(
  "analyze_document",
  {
    description: "Analyze a large document using Recursive Language Model",
    inputSchema: {
      type: "object",
      properties: {
        query: { type: "string", description: "Question about the document" },
        filePath: { type: "string", description: "Path to the document" }
      },
      required: ["query", "filePath"]
    }
  },
  async ({ query, filePath }) => {
    const result = await runRLM(query, filePath);
    return { content: [{ type: "text", text: result }] };
  }
);

// Start server
const transport = new StdioServerTransport();
await server.connect(transport);
```

### 6. Entry Point (`src/index.ts`)

```typescript
import { runRLM } from "./rlm";

const query = process.argv[2] || "Summarize the main themes of this document.";
const filePath = process.argv[3] || "huge_doc.txt";

console.log(`Query: ${query}`);
console.log(`File: ${filePath}\n`);

const result = await runRLM(query, filePath, {
  maxTurns: 10,
  turnTimeoutMs: 30000
});

console.log("\n=== Final Result ===");
console.log(result);
```

---

## Phase 4: Configuration Files

### `package.json`

```json
{
  "name": "recursive-language-model",
  "type": "module",
  "scripts": {
    "start": "tsx src/index.ts",
    "mcp": "tsx src/mcp-server.ts"
  },
  "dependencies": {
    "@modelcontextprotocol/sdk": "^1.0.0",
    "@utcp/code-mode": "^0.1.0",
    "isolated-vm": "^5.0.0",
    "fuse.js": "^7.0.0"
  },
  "devDependencies": {
    "@types/node": "^20.0.0",
    "tsx": "^4.0.0",
    "typescript": "^5.0.0"
  }
}
```

### `tsconfig.json`

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "strict": true,
    "esModuleInterop": true,
    "outDir": "dist"
  },
  "include": ["src"]
}
```

---

## Phase 5: Running the Project

1. **Start Ollama:**
   ```bash
   ollama serve
   ollama pull qwen3-coder:30b
   ```

2. **Install dependencies:**
   ```bash
   npm install
   ```

3. **Prepare test data:**
   ```bash
   # Download a large text file (e.g., Project Gutenberg)
   curl -o huge_doc.txt https://www.gutenberg.org/files/2701/2701-0.txt
   ```

4. **Run RLM:**
   ```bash
   npm start "Find every mention of the color white and explain its symbolism" huge_doc.txt
   ```

5. **Run as MCP server (optional):**
   ```bash
   npm run mcp
   ```

---

## Phase 6: Tuning Tips

1. **Qwen Recursion Warning:** Add to system prompt:
   > "Minimize `llm_query` calls by batching related information together."

2. **Timeout Tuning:** Increase `turnTimeoutMs` for complex operations

3. **Memory Limits:** Adjust `isolated-vm` memory limit for larger documents

4. **Model Selection:** Code-capable models work best (Qwen-Coder, DeepSeek-Coder, CodeLlama)

---

## Key Differences from Python Version

| Aspect | Python (`exec`) | TypeScript (isolated-vm) |
|--------|-----------------|--------------------------|
| Security | Requires Docker | Built-in VM isolation |
| Memory | Unbounded | Configurable limit |
| Timeout | Manual implementation | Native support |
| Type Safety | None | Full TypeScript |
| Tool Discovery | String docs in prompt | UTCP typed interfaces |
| UI Integration | Custom FastAPI | MCP protocol |

---

## Context-Efficient Tools

These tools help the model "see" data structure without consuming tokens:

| Tool | Purpose | Token Cost |
|------|---------|------------|
| `text_stats()` | Get length, line count, 5-line samples from start/middle/end | ~50 tokens |
| `fuzzy_search(query)` | Find approximate matches without reading full context | ~20 tokens/result |
| `memory.push(...)` | Accumulate findings without printing | 0 tokens |
| `context.match(/regex/)` | Find exact patterns without reading full context | Variable |

### Memory Pattern

The `memory` array persists across turns, allowing the model to:

```typescript
// Turn 1: Explore structure
const stats = text_stats();
console.log(`Document: ${stats.lineCount} lines`);

// Turn 2: Search for relevant sections
const matches = fuzzy_search("important keyword");
memory.push({ phase: "search", found: matches.length });

// Turn 3: Process each match
for (const m of matches) {
  const chunk = context.slice(m.lineNum * 80, m.lineNum * 80 + 1000);
  const summary = await llm_query("Extract key points: " + chunk);
  memory.push({ line: m.lineNum, summary });
}
console.log(`Processed ${memory.length - 1} sections`);

// Turn 4: Synthesize
FINAL_VAR(memory);
```

This pattern keeps the Root LM's context clean while accumulating rich analysis.
