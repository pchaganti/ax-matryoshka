/**
 * Audit #33 — TDD tests for critical and high severity issues
 *
 * Round 1: compile.ts null guards, lc-interpreter missing tags
 * Round 2: constraint-resolver missing recursion, predicate-compiler injection
 * Round 3: CLI bounds checking, evalo null output, resolveEnvVar empty string
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";

describe("Audit #33", () => {
  // =============================================================
  // CRITICAL: compile.ts — replace/slice/split crash on null input
  // =============================================================

  describe("#1 — compile.ts null-safe output for replace/slice/split", () => {
    it("compile(replace) should produce null-safe code", async () => {
      const { compile } = await import("../src/synthesis/evalo/compile.js");
      // When inner str can be null (e.g., match returns null), the compiled
      // replace code should not crash — it should produce null-safe output
      const code = compile({
        tag: "replace",
        str: { tag: "match", str: { tag: "input" }, pattern: "(\\d+)", group: 1 },
        from: ",",
        to: "",
      });
      // The compiled code should handle null gracefully
      const fn = new Function("input", `return ${code}`);
      // When match returns null, should not throw
      expect(() => fn("no digits here")).not.toThrow();
    });

    it("compile(slice) should produce null-safe code", async () => {
      const { compile } = await import("../src/synthesis/evalo/compile.js");
      const code = compile({
        tag: "slice",
        str: { tag: "match", str: { tag: "input" }, pattern: "(\\d+)", group: 1 },
        start: 0,
        end: 3,
      });
      const fn = new Function("input", `return ${code}`);
      expect(() => fn("no digits here")).not.toThrow();
    });

    it("compile(split) should produce null-safe code", async () => {
      const { compile } = await import("../src/synthesis/evalo/compile.js");
      const code = compile({
        tag: "split",
        str: { tag: "match", str: { tag: "input" }, pattern: "(\\d+)", group: 1 },
        delim: ",",
        index: 0,
      });
      const fn = new Function("input", `return ${code}`);
      expect(() => fn("no digits here")).not.toThrow();
    });
  });

  // =============================================================
  // CRITICAL: lc-interpreter.ts — missing term tag handlers
  // =============================================================

  describe("#2 — lc-interpreter should handle all LCTerm tags", () => {
    it("should handle 'sum' tag", async () => {
      const { evaluate } = await import("../src/logic/lc-interpreter.js");
      const tools = makeMockTools("");
      const env = new Map();
      // sum of an array of numbers
      const term = {
        tag: "sum" as const,
        collection: { tag: "lit" as const, value: [10, 20, 30] },
      };
      const result = evaluate(term as any, tools, env, () => {}, 0);
      expect(result).toBe(60);
    });

    it("should handle 'count' tag", async () => {
      const { evaluate } = await import("../src/logic/lc-interpreter.js");
      const tools = makeMockTools("");
      const env = new Map();
      const term = {
        tag: "count" as const,
        collection: { tag: "lit" as const, value: [1, 2, 3, 4, 5] },
      };
      const result = evaluate(term as any, tools, env, () => {}, 0);
      expect(result).toBe(5);
    });

    it("should handle 'lines' tag", async () => {
      const { evaluate } = await import("../src/logic/lc-interpreter.js");
      const tools = makeMockTools("line1\nline2\nline3\nline4\nline5");
      const env = new Map();
      const term = {
        tag: "lines" as const,
        start: 2,
        end: 4,
      };
      const result = evaluate(term as any, tools, env, () => {}, 0);
      expect(result).toContain("line2");
      expect(result).toContain("line4");
    });

    it("should handle 'parseCurrency' tag", async () => {
      const { evaluate } = await import("../src/logic/lc-interpreter.js");
      const tools = makeMockTools("");
      const env = new Map();
      const term = {
        tag: "parseCurrency" as const,
        str: { tag: "lit" as const, value: "$1,234.56" },
      };
      const result = evaluate(term as any, tools, env, () => {}, 0);
      expect(result).toBe(1234.56);
    });

    it("should handle 'parseDate' tag", async () => {
      const { evaluate } = await import("../src/logic/lc-interpreter.js");
      const tools = makeMockTools("");
      const env = new Map();
      const term = {
        tag: "parseDate" as const,
        str: { tag: "lit" as const, value: "2024-12-25" },
      };
      const result = evaluate(term as any, tools, env, () => {}, 0);
      expect(result).toBe("2024-12-25");
    });

    it("should handle 'coerce' tag", async () => {
      const { evaluate } = await import("../src/logic/lc-interpreter.js");
      const tools = makeMockTools("");
      const env = new Map();
      const term = {
        tag: "coerce" as const,
        term: { tag: "lit" as const, value: "42" },
        targetType: "number" as const,
      };
      const result = evaluate(term as any, tools, env, () => {}, 0);
      expect(result).toBe(42);
    });
  });

  // =============================================================
  // HIGH: constraint-resolver.ts — missing recursion for tags
  // =============================================================

  describe("#3 — constraint-resolver should recurse into all term types", () => {
    it("should recurse into 'sum' collection", async () => {
      const { hasConstraints } = await import("../src/logic/constraint-resolver.js");
      const term = {
        tag: "sum" as const,
        collection: {
          tag: "constrained" as const,
          constraint: "∞/0" as const,
          term: { tag: "grep" as const, pattern: "test" },
        },
      };
      expect(hasConstraints(term as any)).toBe(true);
    });

    it("should recurse into 'count' collection", async () => {
      const { hasConstraints } = await import("../src/logic/constraint-resolver.js");
      const term = {
        tag: "count" as const,
        collection: {
          tag: "constrained" as const,
          constraint: "∞/0" as const,
          term: { tag: "grep" as const, pattern: "test" },
        },
      };
      expect(hasConstraints(term as any)).toBe(true);
    });

    it("should recurse into 'coerce' term", async () => {
      const { hasConstraints } = await import("../src/logic/constraint-resolver.js");
      const term = {
        tag: "coerce" as const,
        term: {
          tag: "constrained" as const,
          constraint: "Σ⚡μ" as const,
          term: { tag: "lit" as const, value: "42" },
        },
        targetType: "number" as const,
      };
      expect(hasConstraints(term as any)).toBe(true);
    });

    it("should recurse into 'predicate' str", async () => {
      const { hasConstraints } = await import("../src/logic/constraint-resolver.js");
      const term = {
        tag: "predicate" as const,
        str: {
          tag: "constrained" as const,
          constraint: "∞/0" as const,
          term: { tag: "input" as const },
        },
      };
      expect(hasConstraints(term as any)).toBe(true);
    });

    it("resolve should handle 'sum' correctly", async () => {
      const { resolveConstraints } = await import("../src/logic/constraint-resolver.js");
      const term = {
        tag: "sum" as const,
        collection: {
          tag: "constrained" as const,
          constraint: "∞/0" as const,
          term: { tag: "grep" as const, pattern: "test" },
        },
      };
      const result = resolveConstraints(term as any);
      // The constraint should have been resolved (removed)
      expect(result.transformations.length).toBeGreaterThan(0);
    });
  });

  // =============================================================
  // HIGH: predicate-compiler.ts — code injection via ) in predicate
  // =============================================================

  describe("#4 — predicate-compiler should block code injection", () => {
    it("should reject predicate with closing paren to escape code context", async () => {
      const { PredicateCompiler } = await import("../src/persistence/predicate-compiler.js");
      const compiler = new PredicateCompiler();
      // Attempt to inject code: ); process.exit(1); (
      expect(() => compiler.compile("); process.exit(1); (")).toThrow();
    });

    it("should reject predicate with template literal for blocklist bypass", async () => {
      const { PredicateCompiler } = await import("../src/persistence/predicate-compiler.js");
      const compiler = new PredicateCompiler();
      // Using template literals to bypass word-boundary checks
      expect(() => compiler.compile("`${constructor}`")).toThrow();
    });

    it("should reject predicate with string concat blocklist bypass", async () => {
      const { PredicateCompiler } = await import("../src/persistence/predicate-compiler.js");
      const compiler = new PredicateCompiler();
      // 'con' + 'structor' bypasses \bconstructor\b
      expect(() => compiler.compile("item['con' + 'structor']")).toThrow();
    });

    it("should reject predicate with bracket notation for dangerous access", async () => {
      const { PredicateCompiler } = await import("../src/persistence/predicate-compiler.js");
      const compiler = new PredicateCompiler();
      expect(() => compiler.compile("item['__proto__']")).toThrow();
    });

    it("should still allow safe predicates", async () => {
      const { PredicateCompiler } = await import("../src/persistence/predicate-compiler.js");
      const compiler = new PredicateCompiler();
      const fn = compiler.compile("item.type === 'error'");
      expect(fn({ type: "error" })).toBe(true);
      expect(fn({ type: "info" })).toBe(false);
    });
  });

  // =============================================================
  // HIGH: index.ts — CLI arg parsing bounds check
  // =============================================================

  describe("#5 — CLI parseArgs should handle missing arg values", () => {
    it("should not crash when --max-turns is last arg", () => {
      const source = readFileSync("src/index.ts", "utf-8");
      // Find the parseArgs function and check for bounds validation
      const parseArgsFn = source.match(/function parseArgs[\s\S]*?return options;\s*\}/);
      expect(parseArgsFn).not.toBeNull();
      // Should have bounds checking — either checking i < args.length
      // or handling undefined from args[++i]
      const body = parseArgsFn![0];
      // After fix, should validate that ++i doesn't exceed bounds
      // or handle NaN from parseInt of undefined
      expect(body).toMatch(/i\s*<\s*args\.length|i\s*\+\s*1\s*<\s*args\.length|args\[i\s*\+\s*1\]|isNaN/);
    });
  });

  // =============================================================
  // HIGH: evalo.ts — null treated as "no constraint" but null is valid
  // =============================================================

  describe("#6 — evalo should distinguish null output from 'no constraint'", () => {
    it("should correctly check when expected output is null", async () => {
      const { evalo } = await import("../src/synthesis/evalo/evalo.js");
      // If an extractor returns null and expectedOutput is null,
      // it should be treated as a MATCH (not as "no constraint")
      const extractor = {
        tag: "match" as const,
        str: { tag: "input" as const },
        pattern: "(\\d+)",
        group: 1,
      };
      // Input has no digits, so match returns null
      // expectedOutput is null — should match (null === null)
      const result = evalo(extractor, "no digits", null);
      expect(result).toEqual([null]);
    });

    it("should reject when expected output is null but result is not", async () => {
      const source = readFileSync("src/synthesis/evalo/evalo.ts", "utf-8");
      // The fix should use something other than !== null to distinguish
      // "no constraint" from "expected null"
      const evaloBody = source.match(/export function evalo[\s\S]*?^\}/m);
      expect(evaloBody).not.toBeNull();
      // Should NOT use `expectedOutput !== null` as the sole check
      // Should use undefined, arguments.length, or a sentinel value
      expect(evaloBody![0]).not.toMatch(/expectedOutput !== null\b/);
    });
  });

  // =============================================================
  // HIGH: llm/index.ts — resolveEnvVar treats "" as unset
  // =============================================================

  describe("#7 — resolveEnvVar should not treat empty string as unset", () => {
    it("should use === undefined instead of !resolved", () => {
      const source = readFileSync("src/llm/index.ts", "utf-8");
      const resolveEnvFn = source.match(/function resolveEnvVar[\s\S]*?^\}/m);
      expect(resolveEnvFn).not.toBeNull();
      const body = resolveEnvFn![0];
      // Should NOT have `if (!resolved)` — this treats "" as falsy
      expect(body).not.toMatch(/if\s*\(\s*!resolved\s*\)/);
      // Should use === undefined or similar
      expect(body).toMatch(/===\s*undefined|resolved\s*==\s*null/);
    });
  });
});

// Helper: create mock tools for lc-interpreter tests
function makeMockTools(context: string) {
  const lines = context.split("\n");
  return {
    context,
    grep: (pattern: string) => {
      try {
        const regex = new RegExp(pattern, "gi");
        const results: Array<{ match: string; line: string; lineNum: number; index: number; groups: string[] }> = [];
        let m;
        while ((m = regex.exec(context)) !== null) {
          const beforeMatch = context.slice(0, m.index);
          const lineNum = (beforeMatch.match(/\n/g) || []).length + 1;
          results.push({
            match: m[0],
            line: lines[lineNum - 1] || "",
            lineNum,
            index: m.index,
            groups: m.slice(1),
          });
          if (results.length > 1000) break;
        }
        return results;
      } catch { return []; }
    },
    fuzzy_search: () => [],
    text_stats: () => ({
      length: context.length,
      lineCount: lines.length,
      sample: { start: "", middle: "", end: "" },
    }),
  };
}
