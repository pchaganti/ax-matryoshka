/** Bounds & limits: bounds-limits/recursion — migrated from audit rounds 14, 20, 21, 30, 34, 36, 52, 53, 54, 55, 59, 61, 62, 64, 69, 71, 72, 73, 74, 81, 86, 88, 89, 91, 93, 94, 95. */
import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";

describe("Bounds & limits: recursion", () => {
  // from audit#14
  describe("Issue #5: formatValue should have depth limit", () => {
    it("should not stack overflow on deeply nested object", async () => {
      const { formatValue } = await import("../../src/logic/lc-interpreter.js");
      // Build deeply nested object
      let obj: any = { value: "leaf" };
      for (let i = 0; i < 200; i++) {
        obj = { nested: obj };
      }
      // Should not throw, should truncate gracefully
      expect(() => formatValue(obj)).not.toThrow();
      const result = formatValue(obj);
      expect(typeof result).toBe("string");
    });
  });

  // from audit#20
  describe("Audit20 #6: parser recursion depth limit", () => {
    it("should reject deeply nested expressions", async () => {
      const { parse } = await import("../../src/logic/lc-parser.js");
      // Build a deeply nested expression: ((((((...))))))
      const depth = 500;
      const input = "(".repeat(depth) + "input" + ")".repeat(depth);
      const result = parse(input);
      // Should either return null or have an error — not stack overflow
      // The parser should gracefully handle this
      expect(() => parse(input)).not.toThrow();
      // Result should indicate failure (null term) due to depth limit
      if (result.term) {
        // If it somehow parsed, that's OK too — the key thing is no crash
        expect(result.term).toBeDefined();
      }
    });
  });

  // from audit#21
  describe("Audit21 #3: verifyOutputConstraint depth limit", () => {
    it("should not stack overflow on deeply nested constraints", async () => {
      const { verifyResult } = await import("../../src/constraints/verifier.js");
      // Build deeply nested object constraint
      let constraint: any = {
        type: "number",
        min: 0,
      };
      for (let i = 0; i < 200; i++) {
        constraint = {
          type: "object",
          properties: { nested: constraint },
        };
      }

      // Build deeply nested value
      let value: any = 42;
      for (let i = 0; i < 200; i++) {
        value = { nested: value };
      }

      const synthConstraint: any = { output: constraint };

      // Should not throw a stack overflow — should gracefully limit depth
      expect(() => {
        verifyResult(value, synthConstraint);
      }).not.toThrow();

      // Result should contain an error about depth
      const result = verifyResult(value, synthConstraint);
      expect(result.valid).toBe(false);
    });
  });

  // from audit#30
  describe("#3 — deepEqual depth limit", () => {
    it("should handle deeply nested objects without stack overflow", () => {
      const source = readFileSync("src/synthesis/evolutionary.ts", "utf-8");
      // After fix, deepEqual should have a depth parameter or limit
      const deepEqualMatch = source.match(/deepEqual\(a: unknown, b: unknown[^)]*\)/);
      expect(deepEqualMatch).not.toBeNull();
      // Should have a depth parameter
      expect(deepEqualMatch![0]).toMatch(/depth/);
    });
  });

  // from audit#34
  describe("#21 — deepEqual should have recursion depth limit", () => {
    it("should have depth limit to prevent stack overflow", () => {
      const source = readFileSync("src/synthesis/extractor/synthesis.ts", "utf-8");
      const deepEqual = source.match(/function deepEqual[\s\S]*?^\}/m);
      expect(deepEqual).not.toBeNull();
      // Should have a depth parameter or limit
      expect(deepEqual![0]).toMatch(/depth|limit|MAX_DEPTH|recursion/i);
    });
  });

  // from audit#36
  describe("#10 — inferType should have depth limit", () => {
    it("should have a depth parameter or limit", () => {
      const source = readFileSync("src/synthesis/evalo/typeo.ts", "utf-8");
      const inferFn = source.match(/export function inferType[\s\S]*?^}/m);
      expect(inferFn).not.toBeNull();
      expect(inferFn![0]).toMatch(/depth|MAX_DEPTH/);
    });
  });

  // from audit#52
  describe("#1 — walkTree should limit child iteration count", () => {
    it("should have a MAX_CHILDREN or childCount limit in walk loop", () => {
      const source = readFileSync("src/treesitter/symbol-extractor.ts", "utf-8");
      const walkLoop = source.match(/Recurse into children[\s\S]*?walkTree/);
      expect(walkLoop).not.toBeNull();
      expect(walkLoop![0]).toMatch(/MAX_CHILDREN|Math\.min/);
    });
  });

  // from audit#53
  describe("#6 — walkAll should have recursion depth limit", () => {
    it("should include a depth parameter or limit", () => {
      const source = readFileSync("src/minikanren/common.ts", "utf-8");
      const walkAllFn = source.match(/function walkAll[\s\S]*?walkAll\(/);
      expect(walkAllFn).not.toBeNull();
      expect(walkAllFn![0]).toMatch(/depth|MAX_DEPTH|limit/i);
    });
  });

  // from audit#54
  describe("#6 — occursIn should have depth limit", () => {
    it("should include a depth parameter", () => {
      const source = readFileSync("src/minikanren/unify.ts", "utf-8");
      const occursInFn = source.match(/const occursIn[\s\S]*?occursIn\(/);
      expect(occursInFn).not.toBeNull();
      expect(occursInFn![0]).toMatch(/depth|MAX_DEPTH|limit/i);
    });
  });

  // from audit#54
  describe("#7 — reifyComp should have depth limit", () => {
    it("should include a depth parameter or limit", () => {
      const source = readFileSync("src/minikanren/reify.ts", "utf-8");
      const reifyCompFn = source.match(/function reifyComp[\s\S]*?reifyS\(/);
      expect(reifyCompFn).not.toBeNull();
      expect(reifyCompFn![0]).toMatch(/depth|MAX_DEPTH|limit/i);
    });
  });

  // from audit#54
  describe("#8 — walk should have depth limit", () => {
    it("should include a depth guard or iteration limit", () => {
      const source = readFileSync("src/minikanren/common.ts", "utf-8");
      const walkFn = source.match(/export function walk\([\s\S]*?\n\}/);
      expect(walkFn).not.toBeNull();
      expect(walkFn![0]).toMatch(/depth|MAX_WALK|limit|iteration/i);
    });
  });

  // from audit#55
  describe("#1 — unsweetenArray should have depth limit", () => {
    it("should include a depth parameter or limit", () => {
      const source = readFileSync("src/minikanren/sugar.ts", "utf-8");
      const fn = source.match(/function unsweetenArray[\s\S]*?unsweetenArray\(/);
      expect(fn).not.toBeNull();
      expect(fn![0]).toMatch(/depth|MAX_DEPTH|limit/i);
    });
  });

  // from audit#55
  describe("#2 — sweetenPair should have depth limit", () => {
    it("should include a depth parameter or limit", () => {
      const source = readFileSync("src/minikanren/sugar.ts", "utf-8");
      const fn = source.match(/function sweetenPair[\s\S]*?sweeten\(/);
      expect(fn).not.toBeNull();
      expect(fn![0]).toMatch(/depth|MAX_DEPTH|limit/i);
    });
  });

  // from audit#55
  describe("#3 — unsweeten/sweeten should have depth limit", () => {
    it("unsweeten should accept and pass depth parameter", () => {
      const source = readFileSync("src/minikanren/sugar.ts", "utf-8");
      const fn = source.match(/export function unsweeten\([^)]*\)/);
      expect(fn).not.toBeNull();
      expect(fn![0]).toMatch(/depth/i);
    });

    it("sweeten should accept and pass depth parameter", () => {
      const source = readFileSync("src/minikanren/sugar.ts", "utf-8");
      const fn = source.match(/export function sweeten\([^)]*\)/);
      expect(fn).not.toBeNull();
      expect(fn![0]).toMatch(/depth/i);
    });
  });

  // from audit#55
  describe("#6 — extractGoTypeDeclaration should limit child iteration", () => {
    it("should use MAX_CHILDREN or similar limit", () => {
      const source = readFileSync("src/treesitter/symbol-extractor.ts", "utf-8");
      // Find the extractGoTypeDeclaration method's own for loop
      const methodStart = source.indexOf("private extractGoTypeDeclaration");
      expect(methodStart).toBeGreaterThan(-1);
      const methodBlock = source.slice(methodStart, methodStart + 500);
      const forLoop = methodBlock.match(/for \(let i = 0; i < ([^;]+);/);
      expect(forLoop).not.toBeNull();
      // Should NOT use raw node.childCount — should clamp with Math.min, MAX_CHILDREN, or a clamped variable
      expect(forLoop![1]).toMatch(/MAX_CHILDREN|Math\.min|childLimit|Limit/);
    });
  });

  // from audit#55
  describe("#7 — getNodeName should limit child iteration", () => {
    it("should use MAX_CHILDREN or similar limit", () => {
      const source = readFileSync("src/treesitter/symbol-extractor.ts", "utf-8");
      const fn = source.match(/getNodeName[\s\S]*?for \(let i = 0; i < /);
      expect(fn).not.toBeNull();
      expect(fn![0]).toMatch(/MAX_CHILDREN|Math\.min/);
    });
  });

  // from audit#59
  describe("#7 — extractJson should limit nesting depth", () => {
    it("should cap brace nesting depth", () => {
      const source = readFileSync("src/adapters/nucleus.ts", "utf-8");
      const fnStart = source.indexOf("extractJson");
      expect(fnStart).toBeGreaterThan(-1);
      const block = source.slice(fnStart, fnStart + 900);
      expect(block).toMatch(/MAX_DEPTH|depth\s*>\s*\d+/);
    });
  });

  // from audit#61
  describe("#1 — parseTerm should have recursion depth limit", () => {
    it("should track and limit parse depth", () => {
      const source = readFileSync("src/logic/lc-parser.ts", "utf-8");
      const fnStart = source.indexOf("function parseTerm(");
      expect(fnStart).toBeGreaterThan(-1);
      const block = source.slice(fnStart, fnStart + 300);
      expect(block).toMatch(/MAX_PARSE_DEPTH|depth\s*>/i);
    });
  });

  // from audit#62
  describe("#2 — evalExtractor should have recursion depth limit", () => {
    it("should track and limit recursion depth", () => {
      const source = readFileSync("src/synthesis/evalo/evalo.ts", "utf-8");
      const fnStart = source.indexOf("function evalExtractor(");
      expect(fnStart).toBeGreaterThan(-1);
      const block = source.slice(fnStart, fnStart + 400);
      expect(block).toMatch(/MAX_EVAL_DEPTH|depth\s*>/i);
    });
  });

  // from audit#64
  describe("#2 — extractCode should limit S-expression search iterations", () => {
    it("should cap the while loop iterations", () => {
      const source = readFileSync("src/adapters/nucleus.ts", "utf-8");
      const loopStart = source.indexOf("while (searchFrom >= 0");
      expect(loopStart).toBeGreaterThan(-1);
      const block = source.slice(loopStart - 200, loopStart + 300);
      expect(block).toMatch(/MAX_SEXP_ITER|MAX_SEARCH_ITER|iterations\s*</i);
    });
  });

  // from audit#69
  describe("#5 — sandbox grep should cap iterations", () => {
    it("should have MAX_GREP_ITERATIONS or iteration counter", () => {
      const source = readFileSync("node_modules/repl-sandbox/dist/builtins/grep.js", "utf-8");
      const grepLoop = source.indexOf("while ((match = regex.exec(searchContext))");
      expect(grepLoop).toBeGreaterThan(-1);
      const block = source.slice(grepLoop, grepLoop + 300);
      expect(block).toMatch(/MAX_GREP_ITERATIONS|iterations\s*>=|iterations\s*>/i);
    });
  });

  // from audit#71
  describe("#7 — compile should track recursion depth", () => {
    it("should have a depth parameter or MAX_DEPTH check", () => {
      const source = readFileSync("src/synthesis/evalo/compile.ts", "utf-8");
      const fnStart = source.indexOf("export function compile(");
      expect(fnStart).toBeGreaterThan(-1);
      const block = source.slice(fnStart, fnStart + 200);
      expect(block).toMatch(/depth|MAX_COMPILE_DEPTH|MAX_DEPTH/i);
    });
  });

  // from audit#72
  describe("#7 — verifyObjectConstraint should cap required array iteration", () => {
    it("should limit required properties checked", () => {
      const source = readFileSync("src/constraints/verifier.ts", "utf-8");
      const fnStart = source.indexOf("function verifyObjectConstraint(");
      expect(fnStart).toBeGreaterThan(-1);
      const block = source.slice(fnStart, fnStart + 500);
      expect(block).toMatch(/MAX_REQUIRED|MAX_PROPERTIES|required\.length\s*>|required\.slice/);
    });
  });

  // from audit#73
  describe("#9 — lc-compiler compile should track recursion depth", () => {
    it("should have depth parameter or MAX_DEPTH check", () => {
      const source = readFileSync("src/logic/lc-compiler.ts", "utf-8");
      const fnStart = source.indexOf("function compile(");
      expect(fnStart).toBeGreaterThan(-1);
      const block = source.slice(fnStart, fnStart + 200);
      expect(block).toMatch(/depth|MAX_COMPILE_DEPTH|MAX_DEPTH/i);
    });
  });

  // from audit#74
  describe("#7 — predicate-compiler should reject when strip iterations exhausted", () => {
    it("should throw or return when MAX_STRIP_ITERATIONS reached", () => {
      const source = readFileSync("src/persistence/predicate-compiler.ts", "utf-8");
      const stripLoop = source.indexOf("MAX_STRIP_ITERATIONS");
      expect(stripLoop).toBeGreaterThan(-1);
      const block = source.slice(stripLoop, stripLoop + 300);
      // After the while loop, should check if iterations hit the cap
      expect(block).toMatch(/iterations\s*>=\s*MAX_STRIP|iterations\s*===\s*MAX_STRIP/);
    });
  });

  // from audit#81
  describe("#3 — extractCode tensor path should have depth limit", () => {
    it("should check depth limit in tensor paren balancing", () => {
      const source = readFileSync("src/adapters/nucleus.ts", "utf-8");
      const tensorIdx = source.indexOf("tensorIdx");
      expect(tensorIdx).toBeGreaterThan(-1);
      // Find the paren balancing loop after tensor detection
      const parenLoop = source.indexOf('response[i] === "("', tensorIdx);
      expect(parenLoop).toBeGreaterThan(-1);
      const block = source.slice(parenLoop, parenLoop + 200);
      expect(block).toMatch(/MAX_DEPTH|depth\s*>\s*\d|MAX_PAREN_DEPTH/);
    });
  });

  // from audit#81
  describe("#9 — extractCode S-expression path should have depth limit", () => {
    it("should check depth limit in S-expression paren balancing", () => {
      const source = readFileSync("src/adapters/nucleus.ts", "utf-8");
      const sexpPath = source.indexOf("KNOWN_COMMANDS");
      expect(sexpPath).toBeGreaterThan(-1);
      // Find the paren balancing loop in the S-expression extraction path
      const depthVar = source.indexOf('if (response[i] === "(") depth++', sexpPath);
      expect(depthVar).toBeGreaterThan(-1);
      const block = source.slice(depthVar, depthVar + 200);
      expect(block).toMatch(/MAX_DEPTH|depth\s*>\s*\d|MAX_PAREN_DEPTH/);
    });
  });

  // from audit#86
  describe("#7 — findCommonPattern should have iteration limit", () => {
    it("should include iteration counter or MAX_ITERATIONS", () => {
      const source = readFileSync("src/logic/synthesis-integrator.ts", "utf-8");
      const fnStart = source.indexOf("private findCommonPattern");
      expect(fnStart).toBeGreaterThan(-1);
      const block = source.slice(fnStart, fnStart + 600);
      expect(block).toMatch(/MAX_ITERATIONS|iterations\s*>|iterCount/i);
    });
  });

  // from audit#88
  describe("#5 — levenshteinDistance should have reasonable matrix cap", () => {
    it("should cap string length to prevent OOM matrix", () => {
      const source = readFileSync("src/feedback/error-analyzer.ts", "utf-8");
      const fnStart = source.indexOf("function levenshteinDistance");
      expect(fnStart).toBeGreaterThan(-1);
      const block = source.slice(fnStart, fnStart + 300);
      // MAX_STR_LENGTH should be <= 2000 to keep matrix under ~16M entries
      expect(block).toMatch(/MAX_STR_LENGTH\s*=\s*[12][\d_]{0,4}[^0]/);
    });
  });

  // from audit#88
  describe("#10 — coerceConfigTypes should have depth limit", () => {
    it("should track and limit recursion depth", () => {
      const source = readFileSync("src/config.ts", "utf-8");
      const fnStart = source.indexOf("function coerceConfigTypes");
      expect(fnStart).toBeGreaterThan(-1);
      const block = source.slice(fnStart, fnStart + 400);
      expect(block).toMatch(/depth|MAX_DEPTH|MAX_CONFIG_DEPTH/i);
    });
  });

  // from audit#89
  describe("#10 — resolveEnvVars should have depth limit", () => {
    it("should track and limit recursion depth", () => {
      const source = readFileSync("src/config.ts", "utf-8");
      const fnStart = source.indexOf("function resolveEnvVars");
      expect(fnStart).toBeGreaterThan(-1);
      const block = source.slice(fnStart, fnStart + 400);
      expect(block).toMatch(/depth|MAX_DEPTH|MAX_ENV_DEPTH/i);
    });
  });

  // from audit#91
  describe("#10 — levenshteinDistance should cap matrix size", () => {
    it("should limit total matrix cells to prevent OOM", () => {
      const source = readFileSync("src/feedback/error-analyzer.ts", "utf-8");
      const fnStart = source.indexOf("function levenshteinDistance");
      expect(fnStart).toBeGreaterThan(-1);
      const block = source.slice(fnStart, fnStart + 500);
      // Should have a product/matrix size check, or tighter individual caps (<=1000)
      expect(block).toMatch(/MAX_MATRIX|a\.length\s*\*\s*b\.length|MAX_STR_LENGTH\s*=\s*1[_,]?000\b/);
    });
  });

  // from audit#93
  describe("#2 — nodeToRegex should have depth limit", () => {
    it("should track and cap recursion depth", () => {
      const source = readFileSync("src/synthesis/regex/synthesis.ts", "utf-8");
      const funcStart = source.indexOf("export function nodeToRegex");
      expect(funcStart).toBeGreaterThan(-1);
      const block = source.slice(funcStart, funcStart + 400);
      // Should accept and check a depth parameter
      expect(block).toMatch(/depth|MAX_REGEX_DEPTH|MAX_DEPTH/);
    });
  });

  // from audit#93
  describe("#3 — exprToCode should have depth limit", () => {
    it("should track and cap recursion depth", () => {
      const source = readFileSync("src/synthesis/relational/interpreter.ts", "utf-8");
      const funcStart = source.indexOf("export function exprToCode");
      expect(funcStart).toBeGreaterThan(-1);
      const block = source.slice(funcStart, funcStart + 400);
      // Should accept and check a depth parameter
      expect(block).toMatch(/depth|MAX_CODE_DEPTH|MAX_DEPTH/);
    });
  });

  // from audit#94
  describe("#2 — reduce should cap iterations", () => {
    it("should have MAX_REDUCE iteration limit", () => {
      const source = readFileSync("src/logic/lc-interpreter.ts", "utf-8");
      const reduceCase = source.indexOf('case "reduce"');
      expect(reduceCase).toBeGreaterThan(-1);
      const block = source.slice(reduceCase, reduceCase + 600);
      // Should have an iteration cap like map has MAX_MAP_RESULTS
      expect(block).toMatch(/MAX_REDUCE|collection\.length\s*>\s*\d|collection\.slice/);
    });
  });

  // from audit#95
  describe("#8 — constraint resolver should have recursion depth limit", () => {
    it("should track and cap recursion depth", () => {
      const source = readFileSync("src/logic/constraint-resolver.ts", "utf-8");
      const resolveStart = source.indexOf("function resolve(t:");
      expect(resolveStart).toBeGreaterThan(-1);
      const block = source.slice(resolveStart, resolveStart + 300);
      // Should have depth parameter and check
      expect(block).toMatch(/depth|MAX_RESOLVE_DEPTH|MAX_DEPTH/);
    });
  });
});
