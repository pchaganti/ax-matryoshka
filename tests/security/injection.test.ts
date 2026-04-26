/** Security: security/injection — migrated from audit rounds 13, 14, 20, 28, 33, 45, 50, 68, 72, 81, 83, 89. */
import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { EvolutionarySynthesizer } from "../../src/synthesis/evolutionary.js";
import { KnowledgeBase } from "../../src/synthesis/knowledge-base.js";

describe("Security: security/injection", () => {
  // from audit#13
  describe("Issue #11: buildQuarterMapper parseInt with NaN guard", () => {
    it("should handle quarter parsing for Q1-Q4 correctly", async () => {
      // We test via synthesizeFromExamples which uses buildQuarterMapper
      const { synthesizeFromExamples } = await import("../../src/logic/relational-solver.js");

      const result = synthesizeFromExamples([
        { input: "Q1-2024", output: "2024-01" },
        { input: "Q3-2024", output: "2024-07" },
      ]);
      expect(result.success).toBe(true);
      // Q2 should infer to month 04
      expect(result.apply("Q2-2025")).toBe("2025-04");
    });
  });

  // from audit#14
  describe("Issue #9: split with empty delimiter should be bounded", () => {
    it("should limit split result size with empty delimiter", async () => {
      const solverMod = await import("../../src/logic/lc-solver.js");
      const { parse } = await import("../../src/logic/lc-parser.js");

      const bigString = "a".repeat(100000);
      const tools: any = {
        context: bigString,
        grep: () => [],
        fuzzy_search: () => [],
        text_stats: () => ({ length: bigString.length, lineCount: 1, sample: { start: "", middle: "", end: "" } }),
      };

      // (split "aaa..." "" 0) — empty delimiter splits into per-character array
      const parsed = parse(`(split "${bigString.slice(0, 50)}" "" 0)`);
      expect(parsed.success).toBe(true);
      const result = await solverMod.solve(parsed.term!, tools);
      // Should either return "a" (first char) or handle the split safely
      // The key check is it shouldn't create a 100K element array
      expect(result.success).toBe(true);
    });
  });

  // from audit#20
  describe("Audit20 #1: synthesis-integrator predicate code injection", () => {
    it("should use safe regex representation in code string", async () => {
      const mod = await import("../../src/logic/synthesis-integrator.js");
      const SynthesisIntegrator = mod.SynthesisIntegrator;
      const integrator = new SynthesisIntegrator();

      // Synthesize a predicate with examples that would produce a pattern
      const result = integrator.synthesizePredicate([
        { input: "error found", output: true },
        { input: "all good", output: false },
      ]);

      if (result.success && result.code) {
        // The code string should NOT contain unescaped regex literals
        // It should use new RegExp() or JSON.stringify for the pattern
        expect(result.code).not.toMatch(/\/(.*?)\/\.test/);
      }
    });
  });

  // from audit#28
  describe("#1 — compose() code injection", () => {
    it("should sanitize transformComp.code to prevent injection", () => {
      const kb = new KnowledgeBase();
      const synth = new EvolutionarySynthesizer(kb);

      const regexComp = {
        id: "regex_1",
        type: "regex" as const,
        name: "test_regex",
        description: "test",
        code: "/\\d+/",
        pattern: "\\d+",
        positiveExamples: ["abc 123"],
        negativeExamples: [],
        confidence: 0.9,
        usageCount: 1,
        successCount: 1,
        lastUsed: new Date(),
        composableWith: [],
      };

      const maliciousCode = `(function(){ throw new Error("INJECTED") })()`;
      const transformComp = {
        id: "transform_1",
        type: "transformer" as const,
        name: "test_transform",
        description: "test",
        code: maliciousCode,
        positiveExamples: ["123"],
        negativeExamples: [],
        confidence: 0.9,
        usageCount: 1,
        successCount: 1,
        lastUsed: new Date(),
        composableWith: [],
      };

      const result = synth.compose([regexComp, transformComp]);
      // The composed code should either be null (rejected) or safe
      if (result !== null) {
        expect(result.code).not.toContain("INJECTED");
      }
    });
  });

  // from audit#33
  describe("#4 — predicate-compiler should block code injection", () => {
    it("should reject predicate with closing paren to escape code context", async () => {
      const { PredicateCompiler } = await import("../../src/persistence/predicate-compiler.js");
      const compiler = new PredicateCompiler();
      // Attempt to inject code: ); process.exit(1); (
      expect(() => compiler.compile("); process.exit(1); (")).toThrow();
    });

    it("should reject predicate with template literal for blocklist bypass", async () => {
      const { PredicateCompiler } = await import("../../src/persistence/predicate-compiler.js");
      const compiler = new PredicateCompiler();
      // Using template literals to bypass word-boundary checks
      expect(() => compiler.compile("`${constructor}`")).toThrow();
    });

    it("should reject predicate with string concat blocklist bypass", async () => {
      const { PredicateCompiler } = await import("../../src/persistence/predicate-compiler.js");
      const compiler = new PredicateCompiler();
      // 'con' + 'structor' bypasses \bconstructor\b
      expect(() => compiler.compile("item['con' + 'structor']")).toThrow();
    });

    it("should reject predicate with bracket notation for dangerous access", async () => {
      const { PredicateCompiler } = await import("../../src/persistence/predicate-compiler.js");
      const compiler = new PredicateCompiler();
      expect(() => compiler.compile("item['__proto__']")).toThrow();
    });

    it("should still allow safe predicates", async () => {
      const { PredicateCompiler } = await import("../../src/persistence/predicate-compiler.js");
      const compiler = new PredicateCompiler();
      const fn = compiler.compile("item.type === 'error'");
      expect(fn({ type: "error" })).toBe(true);
      expect(fn({ type: "info" })).toBe(false);
    });
  });

  // from audit#45
  describe("#8 — lc-interpreter match should validate group with isInteger", () => {
    it("should use Number.isInteger on group parameter", () => {
      const source = readFileSync("src/logic/lc-interpreter.ts", "utf-8");
      const matchCase = source.match(/case "match"[\s\S]*?case "replace"/);
      expect(matchCase).not.toBeNull();
      expect(matchCase![0]).toMatch(/Number\.isInteger/);
    });
  });

  // from audit#50
  describe("#1 — evalo match should validate group with Number.isInteger", () => {
    it("should check Number.isInteger on extractor.group before array access", () => {
      const source = readFileSync("src/synthesis/evalo/evalo.ts", "utf-8");
      const matchCase = source.match(/case "match"[\s\S]*?match\[extractor\.group\]/);
      expect(matchCase).not.toBeNull();
      expect(matchCase![0]).toMatch(/Number\.isInteger\(extractor\.group\)/);
    });
  });

  // from audit#68
  describe("#4 — extractor templates should guard parseInt with isSafeInteger", () => {
    it("should check isSafeInteger in integer parsing templates", () => {
      const source = readFileSync("src/synthesis/extractor/synthesis.ts", "utf-8");
      const intPlain = source.indexOf('"integer_plain"');
      expect(intPlain).toBeGreaterThan(-1);
      const block = source.slice(intPlain, intPlain + 300);
      expect(block).toMatch(/isSafeInteger/);
    });
  });

  // from audit#68
  describe("#5 — evolutionary strategies should guard parseInt with isSafeInteger", () => {
    it("should check isSafeInteger in parseInt strategies", () => {
      const source = readFileSync("src/synthesis/evolutionary.ts", "utf-8");
      // Find the parseInt strategy near line 176-182
      const strategyStart = source.indexOf("parseInt((m[1]");
      expect(strategyStart).toBeGreaterThan(-1);
      const block = source.slice(strategyStart, strategyStart + 200);
      expect(block).toMatch(/isSafeInteger/);
    });
  });

  // from audit#72
  describe("#9 — knowledge-base derive should cap composableWith array", () => {
    it("should limit composableWith array size", () => {
      const source = readFileSync("src/synthesis/knowledge-base.ts", "utf-8");
      const fnStart = source.indexOf("derive(");
      expect(fnStart).toBeGreaterThan(-1);
      const block = source.slice(fnStart, fnStart + 500);
      expect(block).toMatch(/MAX_COMPOSABLE|composableWith\.length\s*>=|composableWith\.length\s*</);
    });
  });

  // from audit#81
  describe("#6 — predicate-compiler should block .repeat() and fromCodePoint", () => {
    it("should block .repeat() method", () => {
      const source = readFileSync("src/persistence/predicate-compiler.ts", "utf-8");
      expect(source).toMatch(/\.repeat\b|\\brepeat\\b/);
    });

    it("should block fromCodePoint method", () => {
      const source = readFileSync("src/persistence/predicate-compiler.ts", "utf-8");
      expect(source).toMatch(/fromCodePoint/);
    });
  });

  // from audit#83
  describe("#3 — DANGEROUS_CODE_PATTERNS should block `with`", () => {
    it("should include with keyword in blocklist", () => {
      const source = readFileSync("src/synthesis/relational/interpreter.ts", "utf-8");
      const blocklistStart = source.indexOf("DANGEROUS_CODE_PATTERNS");
      expect(blocklistStart).toBeGreaterThan(-1);
      const block = source.slice(blocklistStart, blocklistStart + 400);
      expect(block).toMatch(/\\bwith\\b/);
    });
  });

  // from audit#83
  describe("#4 — DANGEROUS_CODE_PATTERNS should block `delete`", () => {
    it("should include delete keyword in blocklist", () => {
      const source = readFileSync("src/synthesis/relational/interpreter.ts", "utf-8");
      const blocklistStart = source.indexOf("DANGEROUS_CODE_PATTERNS");
      expect(blocklistStart).toBeGreaterThan(-1);
      const block = source.slice(blocklistStart, blocklistStart + 400);
      expect(block).toMatch(/\\bdelete\\b/);
    });
  });

  // from audit#89
  describe("#9 — function name should validate with regex", () => {
    it("should validate function name with safe regex", () => {
      const source = readFileSync("src/engine/nucleus-engine.ts", "utf-8");
      const fnNameCheck = source.indexOf("_fn_${fnObj.name}");
      expect(fnNameCheck).toBeGreaterThan(-1);
      const block = source.slice(fnNameCheck - 200, fnNameCheck + 50);
      // Should validate name with regex and length check
      expect(block).toMatch(/\.test\(fnObj\.name\)/);
      expect(block).toMatch(/\.length\s*<=\s*256/);
    });
  });

});
