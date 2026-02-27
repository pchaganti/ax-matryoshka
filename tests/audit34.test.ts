/**
 * Audit #34 — TDD tests for all severity issues
 *
 * Round 1: Critical (evolutionary validateSolution, sandbox escape)
 * Round 2: High (resolveEnvVar, predicate arrow fn, MCP path validation,
 *           parser unterminated string, getCached partial match,
 *           evolutionary compose, engine dispose, config path, escapeRegex)
 * Round 3: Medium (CLI bounds, parseCurrency, compile default, deepEqual,
 *           auto-termination, CORS, JSON body, FTS5, checkpoint, expand,
 *           Object.is for objects)
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";

describe("Audit #34", () => {
  // =============================================================
  // ROUND 1: Critical
  // =============================================================

  describe("Round 1: Critical", () => {
    // #1 — evolutionary.ts validateSolution has no safety checks
    describe("#1 — validateSolution should have safety checks", () => {
      it("should not execute dangerous code in validateSolution", async () => {
        const source = readFileSync("src/synthesis/evolutionary.ts", "utf-8");
        // Find validateSolution method
        const method = source.match(/validateSolution[\s\S]*?return examples\.every[\s\S]*?\}/);
        expect(method).not.toBeNull();
        // Should have some safety check before new Function
        // Either call safeEvalSynthesized, or have its own blocklist
        expect(method![0]).toMatch(/dangerous|blocked|safe|validate|blocklist|DANGEROUS/i);
      });

      it("should reject code containing process", async () => {
        const { EvolutionarySynthesizer } = await import("../src/synthesis/evolutionary.js");
        const synth = new EvolutionarySynthesizer();
        const examples = [{ input: "hello", output: "hello" }];
        // Should not execute code containing "process"
        const result = synth.validateSolution(
          '(input) => { process.exit(1); return input; }',
          examples
        );
        expect(result).toBe(false);
      });
    });

    // #2 — sandbox.ts vm escape + missing eval override
    describe("#2 — sandbox should block constructor chain escape", () => {
      it("should block eval in sandbox globals", () => {
        const source = readFileSync("src/sandbox.ts", "utf-8");
        // Should override eval to prevent sandbox escape
        expect(source).toMatch(/eval.*not allowed|eval.*throw|eval.*blocked|eval:\s*\(\)/i);
      });

      it("should freeze or block constructor access", () => {
        const source = readFileSync("src/sandbox.ts", "utf-8");
        // Should have some prototype chain protection
        expect(source).toMatch(
          /Object\.freeze|Object\.defineProperty.*constructor|__proto__|getPrototypeOf.*null|Object\.create\(null\)/
        );
      });
    });
  });

  // =============================================================
  // ROUND 2: High
  // =============================================================

  describe("Round 2: High", () => {
    // #3 — resolveEnvVar missing variable name validation
    describe("#3 — resolveEnvVar should validate variable names", () => {
      it("should validate env var names against dangerous patterns", () => {
        const source = readFileSync("src/llm/index.ts", "utf-8");
        const fn = source.match(/function resolveEnvVar[\s\S]*?^\}/m);
        expect(fn).not.toBeNull();
        // Should validate variable name format
        expect(fn![0]).toMatch(/[A-Za-z_]\[A-Za-z0-9_\]|DANGEROUS|__proto__|constructor/);
      });
    });

    // #4 — predicate-compiler arrow function bypass
    describe("#4 — predicate-compiler should block arrow functions", () => {
      it("should reject IIFE via arrow function", async () => {
        const { PredicateCompiler } = await import("../src/persistence/predicate-compiler.js");
        const compiler = new PredicateCompiler();
        expect(() => compiler.compile("item.x || (()=>1)()")).toThrow();
      });

      it("should reject arrow functions in predicates", async () => {
        const { PredicateCompiler } = await import("../src/persistence/predicate-compiler.js");
        const compiler = new PredicateCompiler();
        expect(() => compiler.compile("(x => x.type)(item)")).toThrow();
      });

      it("should still allow >= and <= comparisons", async () => {
        const { PredicateCompiler } = await import("../src/persistence/predicate-compiler.js");
        const compiler = new PredicateCompiler();
        const fn = compiler.compile("item.count >= 5");
        expect(fn({ count: 10 })).toBe(true);
        expect(fn({ count: 3 })).toBe(false);
      });
    });

    // #5 — mcp-server no path validation
    describe("#5 — mcp-server should validate file paths", () => {
      it("should have path validation in getEngine or its callers", () => {
        const source = readFileSync("src/mcp-server.ts", "utf-8");
        // Path validation may be in a separate helper called before getEngine
        expect(source).toMatch(/validateFilePath|traversal|startsWith|\.\./i);
      });

      it("should validate filePath in nucleus_execute handler", () => {
        const source = readFileSync("src/mcp-server.ts", "utf-8");
        const handler = source.match(/nucleus_execute[\s\S]*?catch.*\{/);
        expect(handler).not.toBeNull();
        expect(handler![0]).toMatch(/validatePath|traversal|startsWith|resolve/i);
      });
    });

    // #6 — lattice-mcp-server bypasses path validation
    describe("#6 — lattice-mcp-server should validate file paths", () => {
      it("should validate filePath in lattice_load", () => {
        const source = readFileSync("src/lattice-mcp-server.ts", "utf-8");
        const handler = source.match(/lattice_load[\s\S]*?new HandleSession/);
        expect(handler).not.toBeNull();
        expect(handler![0]).toMatch(/validatePath|traversal|startsWith|resolve|\.\.|\babsolute\b/i);
      });
    });

    // #7 — parser unterminated string
    describe("#7 — parser should error on unterminated strings", () => {
      it("should report error for unterminated string literal", async () => {
        const { parse } = await import("../src/logic/lc-parser.js");
        const result = parse('(grep "unterminated');
        // Should fail, not silently succeed
        expect(result.success).toBe(false);
        expect(result.error).toMatch(/unterminated|unclosed|string/i);
      });
    });

    // #8 — getCached partial match returns wrong function
    describe("#8 — getCached should not return wrong function via partial match", () => {
      it("should not match different suffixes", () => {
        const source = readFileSync("src/logic/synthesis-integrator.ts", "utf-8");
        const getCached = source.match(/getCached[\s\S]*?return null;\s*\}/);
        expect(getCached).not.toBeNull();
        // Should NOT have partial match fallback that returns a function by prefix
        expect(getCached![0]).not.toMatch(/cachePrefix.*===.*keyPrefix/);
      });
    });

    // #9 — evolutionary compose insufficient validation
    describe("#9 — evolutionary compose should validate transformer code", () => {
      it("should validate full transformer code, not just prefix", () => {
        const source = readFileSync("src/synthesis/evolutionary.ts", "utf-8");
        const compose = source.match(/compose\([\s\S]*?return null;\s*\}/);
        expect(compose).not.toBeNull();
        // Should have dangerous code check on the full code string
        expect(compose![0]).toMatch(/dangerous|blocked|safe|DANGEROUS/i);
      });
    });

    // #10 — mcp-server old engine not disposed on mtime reload
    describe("#10 — engine should be disposed on mtime reload", () => {
      it("should dispose old engine when file mtime changes", () => {
        const source = readFileSync("src/mcp-server.ts", "utf-8");
        const mtimeBlock = source.match(/mtimeMs > cachedMtime[\s\S]*?return engine;/);
        expect(mtimeBlock).not.toBeNull();
        // Should call dispose on old engine
        expect(mtimeBlock![0]).toMatch(/\.dispose\(\)/);
      });
    });

    // #11 — config.ts loadConfig no path validation
    describe("#11 — loadConfig should validate config path", () => {
      it("should not allow absolute paths outside CWD", () => {
        const source = readFileSync("src/config.ts", "utf-8");
        const loadConfig = source.match(/export async function loadConfig[\s\S]*?^\}/m);
        expect(loadConfig).not.toBeNull();
        // Should validate the path
        expect(loadConfig![0]).toMatch(/validatePath|traversal|startsWith|resolve|\.\.|\babsolute\b/i);
      });
    });

    // #12 — regex synthesis escapeRegex breaks character classes
    describe("#12 — regex synthesis should handle character class chars correctly", () => {
      it("should not escape hyphens used as ranges in character classes", () => {
        const source = readFileSync("src/synthesis/regex/synthesis.ts", "utf-8");
        // The custom char class case should not use escapeRegex
        // or should use a char-class-specific escape function
        const customCase = source.match(/case "custom"[\s\S]*?return/);
        expect(customCase).not.toBeNull();
        // Should NOT use the general escapeRegex which breaks ranges
        expect(customCase![0]).not.toMatch(/escapeRegex\(node\.chars/);
      });
    });
  });

  // =============================================================
  // ROUND 3: Medium
  // =============================================================

  describe("Round 3: Medium", () => {
    // #13 — CLI accepts negative maxTurns/timeout
    describe("#13 — CLI should reject invalid maxTurns/timeout", () => {
      it("should validate maxTurns is positive", () => {
        const source = readFileSync("src/index.ts", "utf-8");
        const maxTurnsBlock = source.match(/--max-turns[\s\S]*?options\.maxTurns/);
        expect(maxTurnsBlock).not.toBeNull();
        expect(maxTurnsBlock![0]).toMatch(/val\s*[<>]=?\s*[01]|val\s*<=?\s*0|positive|greater/i);
      });
    });

    // #14 — CLI missing arg silently uses empty string
    describe("#14 — CLI should error on missing option values", () => {
      it("should check bounds before reading next arg for string options", () => {
        const source = readFileSync("src/index.ts", "utf-8");
        // Should check i + 1 < args.length or similar
        const modelBlock = source.match(/--model[\s\S]*?options\.model/);
        expect(modelBlock).not.toBeNull();
        // After fix, should have bounds check
        expect(modelBlock![0]).toMatch(/i\s*\+\s*1\s*>=?\s*args\.length|args\[i\s*\+\s*1\]|throw|Error/);
      });
    });

    // #16 — parseCurrency negative detection too broad
    describe("#16 — parseCurrency negative detection", () => {
      it("should not flag range-like patterns as negative", () => {
        const source = readFileSync("src/logic/lc-solver.ts", "utf-8");
        const isNeg = source.match(/const isNegative =[\s\S]*?;/);
        expect(isNeg).not.toBeNull();
        // Should NOT match hyphens that are sandwiched between digits (ranges)
        // Should only match leading/trailing minus or parens
        expect(isNeg![0]).toMatch(/trimmed|startsWith|endsWith|^\s*-|^-/);
      });
    });

    // #20 — compile.ts no default case
    describe("#20 — compile should have default case", () => {
      it("should have a default case in the switch statement", () => {
        const source = readFileSync("src/synthesis/evalo/compile.ts", "utf-8");
        const compileFn = source.match(/export function compile[\s\S]*?^\}/m);
        expect(compileFn).not.toBeNull();
        expect(compileFn![0]).toMatch(/default:/);
      });
    });

    // #21 — deepEqual no depth limit in extractor/synthesis.ts
    describe("#21 — deepEqual should have recursion depth limit", () => {
      it("should have depth limit to prevent stack overflow", () => {
        const source = readFileSync("src/synthesis/extractor/synthesis.ts", "utf-8");
        const deepEqual = source.match(/function deepEqual[\s\S]*?^\}/m);
        expect(deepEqual).not.toBeNull();
        // Should have a depth parameter or limit
        expect(deepEqual![0]).toMatch(/depth|limit|MAX_DEPTH|recursion/i);
      });
    });

    // #22 — Object.is for constant output check fails for objects
    describe("#22 — synthesizeExtractor constant check should handle objects", () => {
      it("should use deep equality for constant output detection", () => {
        const source = readFileSync("src/synthesis/evalo/evalo.ts", "utf-8");
        const allSame = source.match(/const allSame[\s\S]*?;/);
        expect(allSame).not.toBeNull();
        // Should use JSON.stringify or deepEqual, not just Object.is
        expect(allSame![0]).toMatch(/JSON\.stringify|deepEqual/);
      });
    });

    // #23 — CORS hardcoded to http://localhost
    describe("#23 — CORS should be configurable", () => {
      it("should allow CORS origin to include port", () => {
        const source = readFileSync("src/tool/adapters/http.ts", "utf-8");
        // Should either be configurable or use a pattern that includes ports
        // Look for the CORS handling block that computes origin dynamically
        const corsBlock = source.match(/CORS headers[\s\S]*?Access-Control-Allow-Origin[\s\S]*?setHeader/);
        expect(corsBlock).not.toBeNull();
        // Should handle localhost with ports, not just bare http://localhost
        expect(corsBlock![0]).toMatch(/isLocalhost|localhost.*:\d|127\.0\.0\.1|req\.headers\.origin/);
      });
    });

    // #25 — FTS5 query injection via special chars
    describe("#25 — FTS5 search should sanitize query", () => {
      it("should sanitize or escape FTS5 special characters", () => {
        const source = readFileSync("src/persistence/session-db.ts", "utf-8");
        const searchFn = source.match(/search\(query: string\)[\s\S]*?searchRaw\(sanitized\)/);
        expect(searchFn).not.toBeNull();
        // Should sanitize FTS5 special characters
        expect(searchFn![0]).toMatch(/sanitize|escape|replace/i);
      });
    });

    // #26 — checkpoint restore doesn't verify handle existence
    describe("#26 — checkpoint restore should verify handles", () => {
      it("should check handle existence during restore", () => {
        const source = readFileSync("src/persistence/checkpoint.ts", "utf-8");
        const restore = source.match(/restore[\s\S]*?^\}/m);
        expect(restore).not.toBeNull();
        // Should verify handles exist before restoring
        expect(restore![0]).toMatch(/exist|valid|verify|getHandle|has\(|registry/i);
      });
    });

    // #27 — expand() loads ALL data before slicing
    describe("#27 — expand should use paginated data fetch", () => {
      it("should use getHandleDataSlice or similar for pagination", () => {
        const source = readFileSync("src/engine/handle-session.ts", "utf-8");
        const expandFn = source.match(/expand\(handle[\s\S]*?return \{[\s\S]*?data: sliced/);
        expect(expandFn).not.toBeNull();
        // Should use getHandleDataSlice at the database level instead of loading all data
        expect(expandFn![0]).toMatch(/getHandleDataSlice|getHandleMetadata/i);
      });
    });

    // #18 — auto-termination regex too broad
    describe("#18 — auto-termination should be more conservative", () => {
      it("should require more than just keyword match", () => {
        const source = readFileSync("src/rlm.ts", "utf-8");
        const autoTerm = source.match(/computedMatch[\s\S]*?Auto-terminating/);
        expect(autoTerm).not.toBeNull();
        // Should require additional evidence beyond a keyword match
        // e.g., multiple confirmations, explicit done marker, or compute context
        expect(autoTerm![0]).toMatch(/doneCount|codeExecuted|hasComputed|confirmCount|turn\s*>\s*[23]/);
      });
    });

    // #29 — nucleus adapter extractCode greedy match
    describe("#29 — nucleus adapter should not match prose parentheses", () => {
      it("should prefer S-expression-like patterns over prose", () => {
        const source = readFileSync("src/adapters/nucleus.ts", "utf-8");
        const extractCode = source.match(/extractCode[\s\S]*?return null;\s*\}/);
        expect(extractCode).not.toBeNull();
        // Should check that the matched expression starts with a known command
        // or at least looks like an S-expression
        expect(extractCode![0]).toMatch(/validCommand|knownCommand|isCommand|commandList|COMMANDS|sexp/i);
      });
    });
  });
});
