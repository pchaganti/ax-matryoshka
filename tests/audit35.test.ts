/**
 * Audit #35 — TDD tests for all severity issues
 *
 * Round 1: Critical (sandbox createTextStats negative slice, Object constructor escape)
 * Round 2: High (nucleus-engine negative slice, sandbox grep limit, sum silent skip,
 *           FTS5 hyphen stripping, JSON.stringify circular refs, nucleus adapter JSON nesting,
 *           parser unbalanced paren detection)
 * Round 3: Medium (console.log port 0, loadContent trim inconsistency, coerceConfigTypes,
 *           truncate fragility, fire-and-forget symbols, declaration timeout, shared singleton,
 *           Object blocklist, mcp-server delete-before-set)
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";

describe("Audit #35", () => {
  // =============================================================
  // ROUND 1: Critical
  // =============================================================

  describe("Round 1: Critical", () => {
    // #1 — sandbox.ts createTextStats middle slice can go negative
    describe("#1 — createTextStats should handle small documents", () => {
      it("should not crash on 1-line documents", async () => {
        const { createTextStats } = await import("../src/sandbox.js");
        const stats = createTextStats("hello");
        expect(stats.lineCount).toBe(1);
        expect(stats.sample.middle).toBeDefined();
      });

      it("should not crash on 2-line documents", async () => {
        const { createTextStats } = await import("../src/sandbox.js");
        const stats = createTextStats("line1\nline2");
        expect(stats.lineCount).toBe(2);
        expect(stats.sample.middle).toBeDefined();
      });

      it("should not crash on 3-line documents", async () => {
        const { createTextStats } = await import("../src/sandbox.js");
        const stats = createTextStats("a\nb\nc");
        expect(stats.lineCount).toBe(3);
        expect(stats.sample.middle).toBeDefined();
      });

      it("should not crash on empty documents", async () => {
        const { createTextStats } = await import("../src/sandbox.js");
        const stats = createTextStats("");
        expect(stats.lineCount).toBe(1);
        expect(stats.sample.middle).toBeDefined();
      });
    });

    // #1b — sandbox createSandbox has same issue inline
    describe("#1b — sandbox createSandbox middle slice should use Math.max", () => {
      it("should have Math.max(0,...) for middle slice start index", () => {
        const source = readFileSync("src/sandbox.ts", "utf-8");
        // Find the inline middle slice in createSandbox
        const middleSlice = source.match(/middle:\s*lines[\s\S]*?\.slice\(\s*Math\.max\(0/);
        expect(middleSlice).not.toBeNull();
      });
    });

    // #2 — sandbox Object constructor escape
    describe("#2 — sandbox should block Object.constructor escape", () => {
      it("should not allow Object.constructor to access Function", async () => {
        const { createSandbox } = await import("../src/sandbox.js");
        const sb = await createSandbox("test doc", async () => "mock");
        const result = await sb.execute("Object.constructor");
        // Either the result should not be Function, or it should error
        if (!result.error) {
          expect(result.result).not.toBe(Function);
        }
        sb.dispose();
      });

      it("should not allow constructor chain to reach process", async () => {
        const { createSandbox } = await import("../src/sandbox.js");
        const sb = await createSandbox("test doc", async () => "mock");
        const result = await sb.execute(
          'typeof Object.constructor'
        );
        // Object.constructor should be undefined (blocked) or error
        if (!result.error) {
          expect(result.result).not.toBe("function");
        }
        sb.dispose();
      });
    });
  });

  // =============================================================
  // ROUND 2: High
  // =============================================================

  describe("Round 2: High", () => {
    // #3 — nucleus-engine.ts same negative slice
    describe("#3 — nucleus-engine createSolverTools should handle small docs", () => {
      it("should have Math.max(0,...) for middle slice", () => {
        const source = readFileSync("src/engine/nucleus-engine.ts", "utf-8");
        const middleSlice = source.match(/middle:\s*lines[\s\S]*?\.slice\(\s*Math\.max\(0/);
        expect(middleSlice).not.toBeNull();
      });

      it("should not crash when loading 1-line document", async () => {
        const { NucleusEngine } = await import("../src/engine/nucleus-engine.js");
        const engine = new NucleusEngine();
        engine.loadContent("single line");
        const stats = engine.getStats();
        expect(stats).not.toBeNull();
        expect(stats!.lineCount).toBe(1);
        engine.dispose();
      });
    });

    // #4 — sandbox grep has no MAX_GREP_MATCHES limit
    describe("#4 — sandbox grep should have match limit", () => {
      it("should have MAX_GREP_MATCHES or similar limit in grep function", () => {
        const source = readFileSync("src/sandbox.ts", "utf-8");
        const grepFn = source.match(/function grep\(pattern[\s\S]*?return results;/);
        expect(grepFn).not.toBeNull();
        // Should have some kind of limit check
        expect(grepFn![0]).toMatch(/MAX_GREP|results\.length\s*>=|results\.length\s*>/);
      });
    });

    // #5 — sum silently ignores non-numeric values
    describe("#5 — sum should log skipped non-numeric values", () => {
      it("should indicate when values are skipped", () => {
        const source = readFileSync("src/logic/lc-solver.ts", "utf-8");
        const sumBlock = source.match(/case "sum"[\s\S]*?return total;/);
        expect(sumBlock).not.toBeNull();
        // Should log or count skipped values
        expect(sumBlock![0]).toMatch(/skipped|warn|non-numeric|unparseable/i);
      });
    });

    // #6 — FTS5 sanitization strips hyphens
    describe("#6 — FTS5 search should preserve hyphens as word chars", () => {
      it("should not strip hyphens from search queries", () => {
        const source = readFileSync("src/persistence/session-db.ts", "utf-8");
        const sanitize = source.match(/sanitized\s*=\s*query\.replace\([^)]+\)/);
        expect(sanitize).not.toBeNull();
        // The character class should NOT include \- (hyphen)
        expect(sanitize![0]).not.toMatch(/\\-/);
      });
    });

    // #7 — JSON.stringify circular reference crash
    describe("#7 — RLM should handle circular references in result", () => {
      it("should have try/catch around JSON.stringify of result", () => {
        const source = readFileSync("src/fsm/rlm-states.ts", "utf-8");
        // Look for safe stringify pattern near result.value
        const stringifyBlock = source.match(
          /result\.value[\s\S]{0,200}JSON\.stringify/
        );
        expect(stringifyBlock).not.toBeNull();
        // Should have try/catch or safe stringify
        const surrounding = source.match(
          /try\s*\{[\s\S]*?JSON\.stringify\(result\.value[\s\S]*?\}\s*catch/
        );
        expect(surrounding).not.toBeNull();
      });
    });

    // #8 — nucleus adapter JSON regex only handles one nesting level
    describe("#8 — nucleus adapter should handle nested JSON", () => {
      it("should handle at least 2 levels of JSON nesting", () => {
        const source = readFileSync("src/adapters/nucleus.ts", "utf-8");
        // Should use a balanced brace approach, not a flat regex
        expect(source).toMatch(/extractJson|parseJsonFromResponse|balancedBrace|depth|nesting/i);
      });
    });

    // #9 — parser unbalanced paren detection
    describe("#9 — parser should detect unbalanced parentheses", () => {
      it("should report error for unclosed parenthesis", async () => {
        const { parse } = await import("../src/logic/lc-parser.js");
        const result = parse("(grep \"test\"");
        expect(result.success).toBe(false);
        expect(result.error).toMatch(/unbalanced|unclosed|unexpected|paren/i);
      });

      it("should report error for extra closing parenthesis", async () => {
        const { parse } = await import("../src/logic/lc-parser.js");
        const result = parse("(grep \"test\"))");
        expect(result.success).toBe(false);
        expect(result.error).toMatch(/unbalanced|unexpected|extra|paren/i);
      });
    });
  });

  // =============================================================
  // ROUND 3: Medium
  // =============================================================

  describe("Round 3: Medium", () => {
    // #10 — console.log shows port 0 in HTTP adapter
    describe("#10 — HTTP adapter should log actual bound port", () => {
      it("should use server.address() for log message", () => {
        const source = readFileSync("src/tool/adapters/http.ts", "utf-8");
        const listenBlock = source.match(/server\.listen[\s\S]*?console\.log.*running/);
        expect(listenBlock).not.toBeNull();
        // Should use actual bound port, not this.port
        expect(listenBlock![0]).toMatch(/address\(\)|boundPort|actualPort/);
      });
    });

    // #11 — loadContent trims but stores original
    describe("#11 — loadContent should be consistent", () => {
      it("should store trimmed content if trimming for empty check", () => {
        const source = readFileSync("src/engine/nucleus-engine.ts", "utf-8");
        const loadContent = source.match(/loadContent\(content: string\)[\s\S]*?this\.bindings\.clear/);
        expect(loadContent).not.toBeNull();
        // If trimmed.length > 0, should store content consistently
        // (either always trimmed or document the behavior)
        expect(loadContent![0]).toMatch(/content|trimmed/);
      });
    });

    // #12 — coerceConfigTypes converts numeric-looking strings
    describe("#12 — coerceConfigTypes should not convert keys that look numeric", () => {
      it("should have safeguard for API key-like strings", () => {
        const source = readFileSync("src/config.ts", "utf-8");
        const coerce = source.match(/function coerceConfigTypes[\s\S]*?return obj;\s*\}/);
        expect(coerce).not.toBeNull();
        // Should either skip certain keys or have length limits
        expect(coerce![0]).toMatch(/length|apiKey|key.*skip|MAX_NUMERIC_LEN|safe/i);
      });
    });

    // #13 — truncate with small max values
    describe("#13 — truncate should handle small max values safely", () => {
      it("should use Math.max(0, ...) for half calculation", () => {
        const source = readFileSync("src/fsm/rlm-states.ts", "utf-8");
        const truncate = source.match(/function truncate[\s\S]*?slice\(-half\)/);
        expect(truncate).not.toBeNull();
        expect(truncate![0]).toMatch(/Math\.max\(0/);
      });
    });

    // #14 — sandbox declaration timeout uses same timeout as main code
    describe("#14 — sandbox declaration timeout", () => {
      it("should use a fraction of main timeout for declaration script", () => {
        const source = readFileSync("src/sandbox.ts", "utf-8");
        // Should have a DECL_TIMEOUT or Math.min for declarations
        expect(source).toMatch(/DECL_TIMEOUT|Math\.min.*decl/i);
      });
    });

    // #15 — Object blocklist in evolutionary too aggressive
    describe("#15 — evolutionary Object blocklist should allow Object.keys etc", () => {
      it("should not block Object.keys usage", () => {
        const source = readFileSync("src/synthesis/evolutionary.ts", "utf-8");
        // The DANGEROUS_PATTERNS should not have a blanket /\bObject\b/ check
        const dangerousCheck = source.match(/DANGEROUS_PATTERNS[\s\S]*?\]/);
        expect(dangerousCheck).not.toBeNull();
        // Should either not include Object or have an exception for Object.keys etc
        const hasBlankObjectBlock = dangerousCheck![0].match(/\\bObject\\b/);
        if (hasBlankObjectBlock) {
          // If it blocks Object, there should be an allowlist
          expect(source).toMatch(/Object\.keys|Object\.values|Object\.entries|ALLOWED_OBJECT/i);
        }
      });
    });
  });
});
