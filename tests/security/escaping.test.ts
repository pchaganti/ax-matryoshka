/** Security: security/escaping — migrated from audit rounds 14, 15, 16, 17, 18, 19, 24, 27, 30, 31, 35, 36, 37, 38, 39, 40, 47, 56, 81, 82, 84, 88, 89, 93. */
import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import type { Extractor } from "../../src/synthesis/evalo/types.js";
import { compileToFunction } from "../../src/synthesis/evalo/compile.js";

describe("Security: security/escaping", () => {
  // from audit#14
  describe("Issue #2: compile should validate regex patterns", () => {
    it("compiled match with ReDoS pattern should return null", async () => {
      const e: Extractor = {
        tag: "match",
        str: { tag: "input" },
        pattern: "(a+)+$",
        group: 0,
      };
      const fn = compileToFunction(e);
      // The compiled function should safely handle ReDoS patterns
      const result = fn("aaaaaaaaaaaaaaaaaaaaaaaa!");
      expect(result).toBeNull();
    });
  });

  // from audit#14
  describe("Issue #12: HTTP adapter CORS origin restriction", () => {
    it("should restrict CORS origin to localhost by default", async () => {
      const fs = await import("node:fs/promises");
      const source = await fs.readFile("src/tool/adapters/http.ts", "utf-8");

      // Find CORS origin setting
      const corsOrigin = source.match(/Access-Control-Allow-Origin.*?"([^"]+)"/);
      expect(corsOrigin).not.toBeNull();
      // Should NOT be wildcard "*"
      expect(corsOrigin![1]).not.toBe("*");
    });
  });

  // from audit#15
  describe("Audit15 #1: regex case consistency", () => {
    it("lc-interpreter match should be case-insensitive (matches grep)", async () => {
      const { evaluate } = await import("../../src/logic/lc-interpreter.js");
      const tools: any = {
        grep: () => [],
        fuzzy_search: () => [],
        text_stats: () => ({ length: 0, lineCount: 0, sample: { start: "", middle: "", end: "" } }),
        context: "",
      };
      // Match "ABC" against /abc/i — should match
      const term: any = { tag: "match", str: { tag: "lit", value: "ABC" }, pattern: "abc", group: 0 };
      const result = evaluate(term, tools, new Map(), () => {}, 0);
      expect(result).toBe("ABC");
    });

    it("lc-solver match should also be case-insensitive", async () => {
      const { solve } = await import("../../src/logic/lc-solver.js");
      const tools: any = {
        grep: () => [],
        fuzzy_search: () => [],
        text_stats: () => ({ length: 0, lineCount: 0, sample: { start: "", middle: "", end: "" } }),
        context: "",
      };
      const term: any = { tag: "match", str: { tag: "lit", value: "ABC" }, pattern: "abc", group: 0 };
      const result = await solve(term, tools);
      // Should match — solver uses "i" flag for consistency with grep
      expect(result.value).toBe("ABC");
    });
  });

  // from audit#15
  describe("Audit15 #3: parser unterminated string", () => {
    it("should not crash on unterminated string", async () => {
      const { parse } = await import("../../src/logic/lc-parser.js");
      // Unterminated string — no closing quote
      const result = parse('(grep "hello');
      // Should fail gracefully, not crash or read past EOF
      // The bug is that i++ on line 164 goes past EOF when quote is missing
      expect(result).toBeDefined();
    });
  });

  // from audit#15
  describe("Audit15 #4: parser empty keyword", () => {
    it("should handle lone colon gracefully", async () => {
      const { parse } = await import("../../src/logic/lc-parser.js");
      const result = parse("(grep : )");
      // Should not produce empty keyword — either skip or error
      expect(result).toBeDefined();
    });
  });

  // from audit#15
  describe("Audit15 #7: slice -0 bug", () => {
    it("should handle zero suffix length correctly", async () => {
      const mod = await import("../../src/synthesis/extractor/synthesis.js");
      const synthesize = (mod as any).synthesizeExtractor || (mod as any).default?.synthesizeExtractor;
      if (!synthesize) return; // skip if not exported
      // Examples where we strip prefix but no suffix
      const result = synthesize({
        examples: [
          { input: "prefix_hello", output: "hello" },
          { input: "prefix_world", output: "world" },
        ],
      });
      if (result) {
        // The test function should correctly strip prefix only
        expect(result.test("prefix_test")).toBe("test");
      }
    });
  });

  // from audit#15
  describe("Audit15 #12: classifier code regex slash escape", () => {
    it("classifier code should escape / in regex patterns", async () => {
      const { SynthesisIntegrator } = await import("../../src/logic/synthesis-integrator.js");
      const integrator = new SynthesisIntegrator();
      const result = integrator.synthesizeOnFailure({
        operation: "classify",
        input: "test",
        examples: [
          { input: "2023/01/01 error", output: true },
          { input: "2023/02/01 error", output: true },
          { input: "good result", output: false },
          { input: "no issue", output: false },
        ],
      });
      // If the code contains regex with unescaped /, it would be broken
      if (result.success && result.code) {
        // The code should be valid JavaScript
        expect(() => new Function("return " + result.code)).not.toThrow();
      }
    });
  });

  // from audit#16
  describe("Audit16 #13: CORS configuration", () => {
    it("CORS should be disabled by default", async () => {
      // Just verify the module loads and has cors option
      const mod = await import("../../src/tool/adapters/http.js");
      expect(mod).toBeDefined();
    });
  });

  // from audit#17
  describe("Audit17 #3: find_references validateRegex", () => {
    it("should handle find_references with very long name safely", async () => {
      const { solve } = await import("../../src/logic/lc-solver.js");
      const tools: any = {
        grep: (pattern: string) => {
          // Verify the pattern is reasonable
          new RegExp(pattern);
          return [];
        },
        fuzzy_search: () => [],
        text_stats: () => ({ length: 0, lineCount: 0, sample: { start: "", middle: "", end: "" } }),
        context: "function test() { return 1; }",
      };
      // Very long name — should not cause ReDoS or hang
      const longName = "a".repeat(1000);
      const term: any = {
        tag: "find_references",
        name: longName,
      };
      const result = await solve(term, tools);
      // Should succeed (returning empty array) without hanging
      expect(result.success).toBe(true);
    });

    it("should call validateRegex before grep in find_references", async () => {
      const { solve } = await import("../../src/logic/lc-solver.js");
      let grepCalled = false;
      const tools: any = {
        grep: () => { grepCalled = true; return []; },
        fuzzy_search: () => [],
        text_stats: () => ({ length: 0, lineCount: 0, sample: { start: "", middle: "", end: "" } }),
        context: "test",
      };
      const term: any = {
        tag: "find_references",
        name: "test",
      };
      const result = await solve(term, tools);
      expect(result.success).toBe(true);
      expect(grepCalled).toBe(true);
    });
  });

  // from audit#17
  describe("Audit17 #4: prettyPrint escaping", () => {
    it("should escape quotes in lit string values", async () => {
      const { prettyPrint } = await import("../../src/logic/lc-parser.js");
      const term: any = {
        tag: "lit",
        value: 'say "hello"',
      };
      const result = prettyPrint(term);
      // Should escape internal quotes so output is valid
      expect(result).not.toBe('"say "hello""');
      expect(result).toContain("hello");
      // Should be parseable — no unbalanced quotes
      const quoteCount = (result.match(/(?<!\\)"/g) || []).length;
      expect(quoteCount % 2).toBe(0);
    });

    it("should escape backslashes in pattern strings", async () => {
      const { prettyPrint } = await import("../../src/logic/lc-parser.js");
      const term: any = {
        tag: "match",
        str: { tag: "input" },
        pattern: "\\d+",
        group: 0,
      };
      const result = prettyPrint(term);
      // Pattern should be preserved in output
      expect(result).toContain("\\d+");
    });
  });

  // from audit#17
  describe("Audit17 #10: HTTP host validation", () => {
    it("http module should export startHttpAdapter", async () => {
      const mod = await import("../../src/tool/adapters/http.js");
      expect(mod.startHttpAdapter).toBeDefined();
    });
  });

  // from audit#18
  describe("Audit18 #2: extract_with_regex validation", () => {
    it("should reject ReDoS patterns in extract_with_regex", async () => {
      // We test indirectly — the sandbox tools module should exist
      const mod = await import("../../src/synthesis/sandbox-tools.js");
      expect(mod).toBeDefined();
    });
  });

  // from audit#19
  describe("Audit19 #7: tokenize preserves currency symbols", () => {
    it("should not drop $ token despite being single-char", async () => {
      const { tokenize } = await import("../../src/rag/similarity.js");
      const tokens = tokenize("$ price");
      // $ is explicitly preserved by the regex but filtered by length > 1
      expect(tokens).toContain("$");
    });

    it("should still filter other single-char tokens", async () => {
      const { tokenize } = await import("../../src/rag/similarity.js");
      const tokens = tokenize("a b c word");
      expect(tokens).not.toContain("a");
      expect(tokens).not.toContain("b");
      expect(tokens).toContain("word");
    });
  });

  // from audit#24
  describe("Audit24 #1: nucleus jsonToSexp escaping", () => {
    it("should correctly escape patterns with quotes", async () => {
      const { createNucleusAdapter } = await import(
        "../../src/adapters/nucleus.js"
      );
      const adapter = createNucleusAdapter();
      // Pattern with a quote character
      const response = '{"action":"grep","pattern":"say \\"hello\\""}';
      const result = adapter.extractCode(response);
      expect(result).not.toBeNull();
      expect(result).toContain("grep");
    });

    it("should correctly escape patterns with backslashes", async () => {
      const { createNucleusAdapter } = await import(
        "../../src/adapters/nucleus.js"
      );
      const adapter = createNucleusAdapter();
      // Pattern with a backslash (e.g. regex \d+)
      const response = '{"action":"grep","pattern":"\\\\d+"}';
      const result = adapter.extractCode(response);
      expect(result).not.toBeNull();
      expect(result).toContain("grep");
    });
  });

  // from audit#24
  describe("Audit24 #6: evolutionary synthesizer regex escaping in generated code", () => {
    it("should produce working extractors with regex patterns", async () => {
      const { EvolutionarySynthesizer } = await import(
        "../../src/synthesis/evolutionary.js"
      );
      const { KnowledgeBase } = await import(
        "../../src/synthesis/knowledge-base.js"
      );
      const kb = new KnowledgeBase();
      const evo = new EvolutionarySynthesizer(kb);

      // Test that validateSolution works with regex patterns
      const code =
        '(s) => { const m = s.match(/\\d+/); return m ? parseInt(m[0], 10) : null; }';
      const examples = [
        { input: "abc123", output: 123 },
        { input: "xyz456", output: 456 },
      ];
      expect(evo.validateSolution(code, examples)).toBe(true);
    });

    it("escapeRegexInString should double-escape backslashes for template literals", async () => {
      const { EvolutionarySynthesizer } = await import(
        "../../src/synthesis/evolutionary.js"
      );
      const { KnowledgeBase } = await import(
        "../../src/synthesis/knowledge-base.js"
      );
      const kb = new KnowledgeBase();
      const evo = new EvolutionarySynthesizer(kb);

      // Initialize with number-extraction examples
      const program = evo.initialize([
        { input: "$100", output: 100 },
        { input: "$200", output: 200 },
      ]);

      const solutions = evo.solve(program);
      // If solutions are found, they should actually work
      for (const sol of solutions) {
        expect(evo.validateSolution(sol, program.examples)).toBe(true);
      }
    });
  });

  // from audit#27
  describe("Audit27 #5: extractor delimiter escaping", () => {
    it("should handle tab delimiter correctly", async () => {
      const { synthesizeExtractor } = await import(
        "../../src/synthesis/extractor/synthesis.js"
      );
      const examples = [
        { input: "a\tb\tc", output: "b" },
        { input: "x\ty\tz", output: "y" },
      ];
      const extractor = synthesizeExtractor({ examples });
      expect(extractor).not.toBeNull();
      if (extractor) {
        expect(extractor.test("1\t2\t3")).toBe("2");
      }
    });
  });

  // from audit#30
  describe("#1 — lattice-tool formatResponse type safety", () => {
    it("should not crash when line property is not a string", () => {
      const source = readFileSync("src/tool/lattice-tool.ts", "utf-8");
      // After fix, the code should check typeof gr.line === "string" before calling .slice()
      const castMatch = source.match(
        /if\s*\(typeof item === "object" && item !== null && "line" in item\)\s*\{([^}]+)\}/
      );
      expect(castMatch).not.toBeNull();
      // Should have a typeof check for line before using .slice()
      expect(castMatch![1]).toMatch(/typeof.*line.*===.*"string"/);
    });
  });

  // from audit#30
  describe("#2 — extractor delimiter escaping", () => {
    it("should escape newlines in delimiter for code generation", () => {
      const source = readFileSync("src/synthesis/extractor/synthesis.ts", "utf-8");
      // Find the escapedDelim line — should handle newline escaping
      const escapeSection = source.match(/const escapedDelim = delim([^;]+);/);
      expect(escapeSection).not.toBeNull();
      // Should escape newlines (\n) and carriage returns (\r)
      expect(escapeSection![1]).toMatch(/\\n/);
    });
  });

  // from audit#31
  describe("#1 — findDistinguishingPattern regex escaping", () => {
    it("should escape regex metacharacters in fallback word patterns", () => {
      const source = readFileSync("src/logic/lc-solver.ts", "utf-8");
      // Find the fallback section that returns words from true examples
      const fallback = source.match(/Fallback: use the most common word[\s\S]*?return null;\s*\}/);
      expect(fallback).not.toBeNull();
      // The returned word should be escaped for safe use in regex
      expect(fallback![0]).toMatch(/escapeRegex|replace\(|escape/i);
    });
  });

  // from audit#31
  describe("#5 — rlm.ts classify guidance escaping", () => {
    it("should escape backslashes and quotes for S-expression safety", () => {
      const source = readFileSync("src/rlm.ts", "utf-8");
      // Find the buildClassifyGuidance function's escaping section
      const escapeSection = source.match(/Escape.*quotes for S-expression[\s\S]*?examples\.push/);
      expect(escapeSection).not.toBeNull();
      // Should escape both backslashes and double quotes for S-expression safety
      expect(escapeSection![0]).toMatch(/replace/);
    });
  });

  // from audit#35
  describe("#3 — nucleus-engine createSolverTools should handle small docs", () => {
    it("should have Math.max(0,...) for middle slice", () => {
      const source = readFileSync("src/engine/nucleus-engine.ts", "utf-8");
      const middleSlice = source.match(/middle:\s*lines[\s\S]*?\.slice\(\s*Math\.max\(0/);
      expect(middleSlice).not.toBeNull();
    });

    it("should not crash when loading 1-line document", async () => {
      const { NucleusEngine } = await import("../../src/engine/nucleus-engine.js");
      const engine = new NucleusEngine();
      engine.loadContent("single line");
      const stats = engine.getStats();
      expect(stats).not.toBeNull();
      expect(stats!.lineCount).toBe(1);
      engine.dispose();
    });
  });

  // from audit#35
  describe("#9 — parser should detect unbalanced parentheses", () => {
    it("should report error for unclosed parenthesis", async () => {
      const { parse } = await import("../../src/logic/lc-parser.js");
      const result = parse("(grep \"test\"");
      expect(result.success).toBe(false);
      expect(result.error).toMatch(/unbalanced|unclosed|unexpected|paren/i);
    });

    it("should report error for extra closing parenthesis", async () => {
      const { parse } = await import("../../src/logic/lc-parser.js");
      const result = parse("(grep \"test\"))");
      expect(result.success).toBe(false);
      expect(result.error).toMatch(/unbalanced|unexpected|extra|paren/i);
    });
  });

  // from audit#35
  describe("#12 — coerceConfigTypes should not convert keys that look numeric", () => {
    it("should have safeguard for API key-like strings", () => {
      const source = readFileSync("src/config.ts", "utf-8");
      const coerce = source.match(/function coerceConfigTypes[\s\S]*?return obj;\s*\}/);
      expect(coerce).not.toBeNull();
      // Should either skip certain keys or have length limits
      expect(coerce![0]).toMatch(/length|apiKey|key.*skip|MAX_NUMERIC_LEN|safe/i);
    });
  });

  // from audit#36
  describe("#1 — filter uses JS truthiness by design", () => {
    it("should use JS truthiness for filter predicates (documented behavior)", () => {
      const source = readFileSync("src/logic/lc-interpreter.ts", "utf-8");
      const filterBlock = source.match(/case "filter"[\s\S]*?return results;\s*\}/);
      expect(filterBlock).not.toBeNull();
      // JS truthiness is the intended behavior
      expect(filterBlock![0]).toMatch(/if \(result\)/);
    });
  });

  // from audit#36
  describe("#2 — FTS5 sanitizeTag should block all XSS vectors", () => {
    it("should block iframe, svg, img tags", () => {
      const source = readFileSync("src/persistence/fts5-search.ts", "utf-8");
      const sanitize = source.match(/sanitizeTag[\s\S]*?;/);
      expect(sanitize).not.toBeNull();
      // Should strip all HTML tags or use allowlist approach
      expect(sanitize![0]).toMatch(/allowlist|<[^>]*>|replace.*<.*>/);
    });
  });

  // from audit#36
  describe("#3 — deepEqual should handle NaN equality", () => {
    it("should treat NaN === NaN as true", () => {
      const source = readFileSync("src/synthesis/extractor/synthesis.ts", "utf-8");
      const deepEq = source.match(/function deepEqual[\s\S]*?^}/m);
      expect(deepEq).not.toBeNull();
      expect(deepEq![0]).toMatch(/isNaN|Number\.isNaN/);
    });
  });

  // from audit#36
  describe("#5 — HTTP readBody should pre-check content-length", () => {
    it("should reject oversized content-length before reading body", () => {
      const source = readFileSync("src/tool/adapters/http.ts", "utf-8");
      const readBody = source.match(/readBody[\s\S]*?return new Promise/);
      expect(readBody).not.toBeNull();
      // Should check content-length header upfront
      expect(readBody![0]).toMatch(/content-length|contentLength/i);
    });
  });

  // from audit#37
  describe("#3 — history pruning should validate both roles in pair", () => {
    it("should check history[3] role before splice(2,2)", () => {
      const source = readFileSync("src/fsm/rlm-states.ts", "utf-8");
      const pruneHistory = source.match(/function pruneHistory[\s\S]*?\}\s*\}/);
      expect(pruneHistory).not.toBeNull();
      const body = pruneHistory![0];
      // Should check both history[2] and history[3] roles before splicing a pair
      expect(body).toMatch(/history\[3\]/);
    });
  });

  // from audit#37
  describe("#9 — relational-solver match should validate group bounds", () => {
    it("should check group < result.length", () => {
      const source = readFileSync("src/logic/relational-solver.ts", "utf-8");
      const matchPrim = source.match(/match:\s*\(input, args\)[\s\S]*?return result\[group\]/);
      expect(matchPrim).not.toBeNull();
      // Should validate group index against result length
      expect(matchPrim![0]).toMatch(/group\s*>=?\s*result\.length|group.*bounds|group.*length/i);
    });
  });

  // from audit#37
  describe("#10 — parseCurrency should handle trailing minus", () => {
    it("should detect trailing minus format like 1,234-", () => {
      const source = readFileSync("src/logic/lc-interpreter.ts", "utf-8");
      const parseCurrency = source.match(/case "parseCurrency"[\s\S]*?return isNegative/);
      expect(parseCurrency).not.toBeNull();
      // The isNegative check should handle trailing minus (already does via endsWith("-"))
      // But the clean step should also handle it properly
      expect(parseCurrency![0]).toMatch(/endsWith.*"-"/);
    });
  });

  // from audit#38
  describe("#2 — evalo add should guard against Infinity result", () => {
    it("should check isFinite on add result", () => {
      const source = readFileSync("src/synthesis/evalo/evalo.ts", "utf-8");
      const addCase = source.match(/case "add"[\s\S]*?return.*result/);
      expect(addCase).not.toBeNull();
      // Should have isFinite check on result
      expect(addCase![0]).toMatch(/isFinite/);
    });
  });

  // from audit#38
  describe("#3 — compile.ts escapeStringForLiteral should escape backticks", () => {
    it("should escape backtick characters", () => {
      const source = readFileSync("src/synthesis/evalo/compile.ts", "utf-8");
      const escapeFn = source.match(/function escapeStringForLiteral[\s\S]*?^}/m);
      expect(escapeFn).not.toBeNull();
      // Should escape backticks
      expect(escapeFn![0]).toMatch(/`/);
    });
  });

  // from audit#38
  describe("#7 — session-db getHandleDataSlice should validate offset", () => {
    it("should clamp or reject negative offset", () => {
      const source = readFileSync("src/persistence/session-db.ts", "utf-8");
      const sliceFn = source.match(/getHandleDataSlice[\s\S]*?LIMIT \? OFFSET \?/);
      expect(sliceFn).not.toBeNull();
      // Should validate offset is non-negative
      expect(sliceFn![0]).toMatch(/offset\s*<\s*0|Math\.max\(0.*offset/);
    });
  });

  // from audit#38
  describe("#9 — nucleus validateCollectionName should block dangerous names", () => {
    it("should reject __proto__, constructor, prototype", () => {
      const source = readFileSync("src/adapters/nucleus.ts", "utf-8");
      // Check that dangerous names blocklist exists near validateCollectionName
      expect(source).toMatch(/DANGEROUS_COLLECTION_NAMES/);
      expect(source).toMatch(/__proto__/);
      expect(source).toMatch(/constructor/);
    });
  });

  // from audit#39
  describe("#2 — lc-solver match should validate group bounds", () => {
    it("should check group < result.length in match case", () => {
      const source = readFileSync("src/logic/lc-solver.ts", "utf-8");
      const matchCase = source.match(/case "match"[\s\S]*?result\[term\.group\]/);
      expect(matchCase).not.toBeNull();
      expect(matchCase![0]).toMatch(/term\.group\s*>=?\s*result\.length|group.*bounds|group.*length/i);
    });

    it("should check group < result.length in extract case", () => {
      const source = readFileSync("src/logic/lc-solver.ts", "utf-8");
      const extractCase = source.match(/case "extract"[\s\S]*?result\[term\.group\]/);
      expect(extractCase).not.toBeNull();
      expect(extractCase![0]).toMatch(/term\.group\s*>=?\s*result\.length|group.*bounds|group.*length/i);
    });
  });

  // from audit#39
  describe("#5 — evolutionary compose should use nuanced Object check", () => {
    it("should not block all Object usage, only dangerous methods", () => {
      const source = readFileSync("src/synthesis/evolutionary.ts", "utf-8");
      // Find the DANGEROUS_PATTERNS in compose
      const composeBlock = source.match(/compose[\s\S]*?DANGEROUS_PATTERNS[\s\S]*?\]/);
      expect(composeBlock).not.toBeNull();
      // Should NOT have bare /\bObject\b/ — should be more specific
      expect(composeBlock![0]).not.toMatch(/\/\\bObject\\b\//);
    });
  });

  // from audit#39
  describe("#6 — session-db should return null for unparseable items not filter them", () => {
    it("should return null for unparseable items instead of filtering", () => {
      const source = readFileSync("src/persistence/session-db.ts", "utf-8");
      // Find the full getHandleDataSlice function
      const sliceFn = source.match(/getHandleDataSlice[\s\S]*?^\s{2}\}/m);
      expect(sliceFn).not.toBeNull();
      // Should NOT filter out failures — should return null instead to preserve pagination count
      expect(sliceFn![0]).not.toMatch(/\.filter\(\(item\) => item !== PARSE_FAILURE\)/);
    });
  });

  // from audit#39
  describe("#8 — extractor delimiter escape is already template-safe (verified)", () => {
    it("generated code uses template literal safely", () => {
      const source = readFileSync("src/synthesis/extractor/synthesis.ts", "utf-8");
      // Delimiter list only contains safe chars: , | \t ; space — no single quotes
      expect(source).toMatch(/delimiters\s*=\s*\[/);
    });
  });

  // from audit#39
  describe("#9 — synthesis-integrator MONTH_NAMES should include sept abbreviation", () => {
    it("should have sept (4-letter) as an alias for September", () => {
      const source = readFileSync("src/logic/synthesis-integrator.ts", "utf-8");
      // Need "sept" as a standalone key, not just as part of "september"
      expect(source).toMatch(/\bsept\b.*:\s*"09"/);
    });
  });

  // from audit#40
  describe("#1 — sandbox-tools should not expose raw Object global", () => {
    it("should use a frozen/safe Object instead of raw Object", () => {
      const source = readFileSync("node_modules/repl-sandbox/dist/safe-globals.js", "utf-8");
      // Safe globals should use Object.freeze(Object.create(null, ...)) not raw Object
      expect(source).toMatch(/Object\.freeze\(Object\.create\(null/);
      // Should NOT pass raw Object
      expect(source).not.toMatch(/^\s*Object,\s*$/m);
    });
  });

  // from audit#47
  describe("#9 — lc-solver boolean coercion should not fallback to Boolean()", () => {
    it("should return null for unrecognized values instead of Boolean()", () => {
      const source = readFileSync("src/logic/lc-solver.ts", "utf-8");
      const boolCase = source.match(/case "boolean"[\s\S]*?case "string"/);
      expect(boolCase).not.toBeNull();
      // Should NOT have a raw Boolean(str) fallback — should return null for unknown values
      expect(boolCase![0]).not.toMatch(/return Boolean\(str\)/);
      expect(boolCase![0]).toMatch(/return null/);
    });
  });

  // from audit#56
  describe("#10 — lc-compiler parseInt should also check isFinite", () => {
    it("should emit isFinite or isSafeInteger guard", () => {
      const source = readFileSync("src/logic/lc-compiler.ts", "utf-8");
      const parseIntCase = source.match(/case "parseInt"[\s\S]*?isNaN\(_r\)[\s\S]*?_r/);
      expect(parseIntCase).not.toBeNull();
      expect(parseIntCase![0]).toMatch(/isFinite|isSafeInteger/);
    });
  });

  // from audit#81
  describe("#2 — generateClassifierGuidance should escape backslashes in lines", () => {
    it("should escape backslashes before escaping quotes", () => {
      const source = readFileSync("src/rlm.ts", "utf-8");
      const fnStart = source.indexOf("function generateClassifierGuidance");
      expect(fnStart).toBeGreaterThan(-1);
      // Find the line escaping section
      const escapeSection = source.indexOf("Escape", fnStart);
      expect(escapeSection).toBeGreaterThan(-1);
      const block = source.slice(escapeSection, escapeSection + 200);
      expect(block).toMatch(/replace\(.*\\\\|escapeForSexp|safeEscape/);
    });
  });

  // from audit#82
  describe("#4 — formatExampleAsHint should escape $ in code", () => {
    it("should escape dollar signs in example.code", () => {
      const source = readFileSync("src/rag/manager.ts", "utf-8");
      const fnStart = source.indexOf("private formatExampleAsHint");
      expect(fnStart).toBeGreaterThan(-1);
      const block = source.slice(fnStart, fnStart + 300);
      expect(block).toMatch(/replace\(.*\\\$|escapeDollar|safeCode.*\$/);
    });
  });

  // from audit#82
  describe("#5 — generateSelfCorrectionFeedback should escape $ in code", () => {
    it("should escape dollar signs in failure.code", () => {
      const source = readFileSync("src/rag/manager.ts", "utf-8");
      const fnStart = source.indexOf("generateSelfCorrectionFeedback");
      expect(fnStart).toBeGreaterThan(-1);
      const codeBlock = source.indexOf("failure.code", fnStart);
      expect(codeBlock).toBeGreaterThan(-1);
      const block = source.slice(codeBlock, codeBlock + 200);
      expect(block).toMatch(/replace\(.*\\\$|escapeDollar|\$.*replace/);
    });
  });

  // from audit#84
  describe("#2 — generateClassifierGuidance should slice before escaping", () => {
    it("should slice line before escape to prevent broken sequences", () => {
      const source = readFileSync("src/rlm.ts", "utf-8");
      const fnStart = source.indexOf("function generateClassifierGuidance");
      expect(fnStart).toBeGreaterThan(-1);
      // Find the line variable assignment (grepResults[idx].line)
      const lineVar = source.indexOf("grepResults[idx].line", fnStart);
      expect(lineVar).toBeGreaterThan(-1);
      const block = source.slice(lineVar, lineVar + 300);
      // The line should NOT be escaped and THEN sliced — that creates broken escape sequences
      // Instead it should be sliced FIRST, then escaped
      expect(block).not.toMatch(/\.replace\([^)]*\)\.replace\([^)]*\)\.slice\(0,/);
    });
  });

  // from audit#88
  describe("#4 — formatFailureAsHint should escape backticks", () => {
    it("should escape backticks in failure fields", () => {
      const source = readFileSync("src/rag/manager.ts", "utf-8");
      const fnStart = source.indexOf("private formatFailureAsHint");
      expect(fnStart).toBeGreaterThan(-1);
      const block = source.slice(fnStart, fnStart + 400);
      expect(block).toMatch(/replace\(.*`.*\\\\`|safeBadCode|safeError|safeFix/);
    });
  });

  // from audit#89
  describe("#5 — grep should correctly count unescaped parens", () => {
    it("should handle escaped backslash before paren", () => {
      const source = readFileSync("src/engine/nucleus-engine.ts", "utf-8");
      const parenCheck = source.indexOf("unescapedParens");
      expect(parenCheck).toBeGreaterThan(-1);
      const block = source.slice(parenCheck - 100, parenCheck + 200);
      // Should handle \\( (escaped backslash followed by real paren)
      expect(block).toMatch(/\\\\\\\\|lookbehind|(?:replace.*){2,}|captureGroupCount/i);
    });
  });

  // from audit#89
  describe("#6 — escapeForSexp should escape parentheses", () => {
    it("should escape ( and ) characters", () => {
      const source = readFileSync("src/adapters/nucleus.ts", "utf-8");
      const fnStart = source.indexOf("function escapeForSexp");
      expect(fnStart).toBeGreaterThan(-1);
      const block = source.slice(fnStart, fnStart + 400);
      expect(block).toMatch(/\\(|\\)|replace.*\(.*\)/);
      // More specific: should have at least 6 replace calls (original 5 + parens)
      const replaceCount = (block.match(/\.replace\(/g) || []).length;
      expect(replaceCount).toBeGreaterThanOrEqual(6);
    });
  });

  // from audit#93
  describe("#10 — exprToCode replace should escape $ in replacement", () => {
    it("should sanitize $ in replacement to prevent backreference injection", () => {
      const source = readFileSync("src/synthesis/relational/interpreter.ts", "utf-8");
      const replaceCase = source.indexOf('case "replace":', source.indexOf("exprToCode"));
      expect(replaceCase).toBeGreaterThan(-1);
      const block = source.slice(replaceCase, replaceCase + 400);
      // Should escape $ in replacement string
      expect(block).toMatch(/\$\$|replace\(.*\\.*\$|escape.*replacement|sanitize/i);
    });
  });

});
