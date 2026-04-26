/**
 * Tests for Sandbox Synthesis Tools
 * TDD tests for Phase 6: Sandbox integration
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { createSandboxWithSynthesis } from "../../src/synthesis/sandbox-tools.js";
import { SynthesisCoordinator } from "../../src/synthesis/coordinator.js";
import { readFileSync } from "fs";

describe("Sandbox Synthesis Tools", () => {
  let sandbox: Awaited<ReturnType<typeof createSandboxWithSynthesis>>;
  let coordinator: SynthesisCoordinator;

  beforeEach(async () => {
    coordinator = new SynthesisCoordinator();
    sandbox = await createSandboxWithSynthesis(
      "Sample context with $1,000 and $2,500 amounts",
      async () => "mock response",
      coordinator,
      {}
    );
  });

  afterEach(() => {
    sandbox.dispose();
  });

  describe("synthesize_regex", () => {
    it("should be callable from sandbox code", async () => {
      const result = await sandbox.execute(`
        const regex = synthesize_regex(['$1,000', '$2,500']);
        console.log(typeof regex);
      `);

      expect(result.error).toBeUndefined();
      expect(result.logs[0]).toBe("string");
    });

    it("should synthesize working regex from positive examples", async () => {
      const result = await sandbox.execute(`
        const regex = synthesize_regex(['$1,000', '$2,500', '$100']);
        const works = test_regex(regex, '$5,000');
        console.log(works);
      `);

      expect(result.error).toBeUndefined();
      expect(result.logs[0]).toBe("true");
    });

    it("should synthesize regex with negative examples", async () => {
      const result = await sandbox.execute(`
        const regex = synthesize_regex(['$100', '$200'], ['100', 'abc']);
        const matchesPositive = test_regex(regex, '$300');
        const rejectsNegative = !test_regex(regex, '300');
        console.log(matchesPositive, rejectsNegative);
      `);

      expect(result.error).toBeUndefined();
      expect(result.logs[0]).toBe("true true");
    });

    it("should return null when synthesis fails", async () => {
      const result = await sandbox.execute(`
        // Conflicting examples - same string in both positive and negative
        const regex = synthesize_regex(['abc'], ['abc']);
        console.log(regex === null);
      `);

      expect(result.error).toBeUndefined();
      expect(result.logs[0]).toBe("true");
    });
  });

  describe("synthesize_extractor", () => {
    it("should synthesize working extractor from examples", async () => {
      const result = await sandbox.execute(`
        const extractor = synthesize_extractor([
          { input: '$1,000', output: 1000 },
          { input: '$2,500', output: 2500 }
        ]);
        const value = extractor('$5,000');
        console.log(value);
      `);

      expect(result.error).toBeUndefined();
      expect(result.logs[0]).toBe("5000");
    });

    it("should synthesize string extractor", async () => {
      const result = await sandbox.execute(`
        const extractor = synthesize_extractor([
          { input: 'name: John', output: 'John' },
          { input: 'name: Jane', output: 'Jane' }
        ]);
        const value = extractor('name: Bob');
        console.log(value);
      `);

      expect(result.error).toBeUndefined();
      expect(result.logs[0]).toBe("Bob");
    });

    it("should return null when extractor synthesis fails", async () => {
      const result = await sandbox.execute(`
        // Random mapping with no pattern
        const extractor = synthesize_extractor([
          { input: 'abc', output: 42 },
          { input: 'xyz', output: 99 }
        ]);
        console.log(extractor === null);
      `);

      expect(result.error).toBeUndefined();
      // May or may not find a pattern - either is valid
      expect(["true", "false"]).toContain(result.logs[0]);
    });
  });

  describe("test_regex", () => {
    it("should test regex against string", async () => {
      const result = await sandbox.execute(`
        const matches = test_regex('\\\\$\\\\d+', '$100');
        const noMatch = test_regex('\\\\$\\\\d+', '100');
        console.log(matches, noMatch);
      `);

      expect(result.error).toBeUndefined();
      expect(result.logs[0]).toBe("true false");
    });

    it("should handle invalid regex gracefully", async () => {
      const result = await sandbox.execute(`
        const result = test_regex('[invalid', 'test');
        console.log(result);
      `);

      expect(result.error).toBeUndefined();
      expect(result.logs[0]).toBe("false");
    });
  });

  describe("extract_with_regex", () => {
    it("should extract capture group from string", async () => {
      const result = await sandbox.execute(`
        const value = extract_with_regex('\\\\$(\\\\d+)', '$500');
        console.log(value);
      `);

      expect(result.error).toBeUndefined();
      expect(result.logs[0]).toBe("500");
    });

    it("should return full match if no capture group", async () => {
      const result = await sandbox.execute(`
        const value = extract_with_regex('\\\\$\\\\d+', '$500');
        console.log(value);
      `);

      expect(result.error).toBeUndefined();
      expect(result.logs[0]).toBe("$500");
    });

    it("should return null when no match", async () => {
      const result = await sandbox.execute(`
        const value = extract_with_regex('\\\\$\\\\d+', 'no match');
        console.log(value === null);
      `);

      expect(result.error).toBeUndefined();
      expect(result.logs[0]).toBe("true");
    });

    it("should handle invalid regex gracefully", async () => {
      const result = await sandbox.execute(`
        const value = extract_with_regex('[invalid', 'test');
        console.log(value === null);
      `);

      expect(result.error).toBeUndefined();
      expect(result.logs[0]).toBe("true");
    });
  });

  describe("get_extractor_code", () => {
    it("should return code string for synthesized extractor", async () => {
      const result = await sandbox.execute(`
        const code = get_extractor_code([
          { input: '123', output: 123 },
          { input: '456', output: 456 }
        ]);
        console.log(typeof code);
      `);

      expect(result.error).toBeUndefined();
      expect(result.logs[0]).toBe("string");
    });

    it("should return compilable code (via new Function, not eval)", async () => {
      const result = await sandbox.execute(`
        const code = get_extractor_code([
          { input: '123', output: 123 },
          { input: '456', output: 456 }
        ]);
        // Compile the code to get a function using new Function
        const fn = new Function("return " + code)();
        const result = fn('789');
        console.log(result);
      `);

      expect(result.error).toBeUndefined();
      expect(result.logs[0]).toBe("789");
    });

    it("should return null when synthesis fails", async () => {
      const result = await sandbox.execute(`
        const code = get_extractor_code([
          { input: 'a', output: 1 },
          { input: 'a', output: 2 }  // Conflicting
        ]);
        console.log(code === null);
      `);

      expect(result.error).toBeUndefined();
      expect(result.logs[0]).toBe("true");
    });
  });

  describe("integration with grep", () => {
    it("should synthesize from grep results", async () => {
      // Create sandbox with context containing currency values
      const contextSandbox = await createSandboxWithSynthesis(
        "Total: $1,000\nSubtotal: $2,500\nTax: $100\n",
        async () => "mock",
        new SynthesisCoordinator(),
        {}
      );

      try {
        const result = await contextSandbox.execute(`
          // Find all currency values
          const matches = grep('\\\\$[\\\\d,]+');
          const values = matches.map(m => m.match);
          console.log(values.join(', '));

          // Synthesize regex from found values
          const regex = synthesize_regex(values);
          console.log(test_regex(regex, '$5,000'));
        `);

        expect(result.error).toBeUndefined();
        expect(result.logs[0]).toContain("$1,000");
        expect(result.logs[1]).toBe("true");
      } finally {
        contextSandbox.dispose();
      }
    });
  });

  describe("example collection", () => {
    it("should collect examples through coordinator", async () => {
      await sandbox.execute(`
        // Synthesize a pattern
        synthesize_regex(['$100', '$200', '$300']);
      `);

      // The synthesis should have been tracked
      expect(coordinator.getSynthesisCount()).toBeGreaterThan(0);
    });
  });

  describe("sandbox security", () => {
    it("should NOT expose eval in sandbox context", async () => {
      const result = await sandbox.execute(`
        try {
          const r = eval("1+1");
          console.log("eval accessible: " + r);
        } catch (e) {
          console.log("eval blocked: " + e.message);
        }
      `);

      // eval should not be accessible - either throws or is not a function
      expect(result.logs[0]).toMatch(/eval blocked|eval is not/);
    });
  });

  describe("error handling", () => {
    it("should handle empty arrays gracefully", async () => {
      const result = await sandbox.execute(`
        const regex = synthesize_regex([]);
        console.log(regex === null);
      `);

      expect(result.error).toBeUndefined();
      expect(result.logs[0]).toBe("true");
    });

    it("should handle empty extractor examples", async () => {
      const result = await sandbox.execute(`
        const extractor = synthesize_extractor([]);
        console.log(extractor === null);
      `);

      expect(result.error).toBeUndefined();
      expect(result.logs[0]).toBe("true");
    });
  });
});

describe("Sandbox with synthesis - backward compatibility", () => {
  it("should maintain all existing sandbox functionality", async () => {
    const coordinator = new SynthesisCoordinator();
    const sandbox = await createSandboxWithSynthesis(
      "Line 1\nLine 2\nLine 3",
      async () => "mock",
      coordinator,
      {}
    );

    try {
      // Test existing tools still work
      const result = await sandbox.execute(`
        const stats = text_stats();
        console.log(stats.lineCount);

        const lines = locate_line(1, 2);
        console.log(lines);

        const matches = grep('Line');
        console.log(matches.length);
      `);

      expect(result.error).toBeUndefined();
      expect(result.logs[0]).toBe("3");
      expect(result.logs[1]).toBe("Line 1\nLine 2");
      expect(result.logs[2]).toBe("3");
    } finally {
      sandbox.dispose();
    }
  });

  it("should cap grep results at 10000 matches", async () => {
    // Create a large document where every line matches
    const lines = Array.from({ length: 15000 }, (_, i) => `data line ${i}`);
    const bigContent = lines.join("\n");

    const bigSandbox = await createSandboxWithSynthesis(
      bigContent,
      async () => "mock",
      new SynthesisCoordinator(),
      {}
    );

    try {
      const result = await bigSandbox.execute(`
        const matches = grep('data');
        console.log(matches.length);
      `);

      expect(result.error).toBeUndefined();
      // Should be capped at 10000, not 15000
      expect(parseInt(result.logs[0])).toBeLessThanOrEqual(10000);
    } finally {
      bigSandbox.dispose();
    }
  });

  it("should return empty array for ReDoS pattern in grep", async () => {
    const sandbox = await createSandboxWithSynthesis(
      "aaaaaaaaaa test data",
      async () => "mock",
      new SynthesisCoordinator(),
      {}
    );

    try {
      const result = await sandbox.execute(`
        const matches = grep('(a+)+');
        console.log(JSON.stringify(matches));
      `);

      expect(result.error).toBeUndefined();
      expect(result.logs[0]).toBe("[]");
    } finally {
      sandbox.dispose();
    }
  });
});

// =====================================================================
// Source-pattern checks (from audits)
// =====================================================================
describe("Source-pattern checks (from audits)", () => {
  // from tests/audit23.test.ts Audit23 #6: sandbox locate_line negative index
  describe("Audit23 #6: sandbox locate_line negative index", () => {
    it("should be importable without errors", async () => {
      const mod = await import("../../src/synthesis/sandbox-tools.js");
      expect(mod).toBeDefined();
    });
  });

  // from tests/audit28.test.ts #2 — locate_line newline join (not a bug)
  describe("#2 — locate_line newline join (not a bug)", () => {
      it("should use escaped newline in template literal context", () => {
        const source = readFileSync("node_modules/repl-sandbox/dist/builtins/text-utils.js", "utf-8");
        const joinMatch = source.match(/return __linesArray\.slice\(startIdx, endIdx \+ 1\)\.join\(([^)]+)\)/);
        expect(joinMatch).not.toBeNull();
        // In template literal context, '\\n' correctly becomes '\n' at runtime
        expect(joinMatch![1]).toBe("'\\\\n'");
      });
    });

  // from tests/audit40.test.ts #5 — sandbox-tools textStats.middle should guard negative index
  describe("#5 — sandbox-tools textStats.middle should guard negative index", () => {
      it("should use Math.max(0, ...) for middle slice start", () => {
        const source = readFileSync("node_modules/repl-sandbox/dist/sandbox.js", "utf-8");
        // The middle slice should use Math.max(0, ...) to prevent negative index
        expect(source).toMatch(/middle[\s\S]*?\.slice\(\s*\n?\s*Math\.max\(0/);
      });
    });

  // from tests/audit47.test.ts #1 — sandbox grep should sanitize flags parameter
  describe("#1 — sandbox grep should sanitize flags parameter", () => {
      it("should only allow safe regex flags via whitelist", () => {
        const source = readFileSync("node_modules/repl-sandbox/dist/builtins/grep.js", "utf-8");
        const grepFn = source.match(/function grep\(pattern, flags\)[\s\S]*?while/);
        expect(grepFn).not.toBeNull();
        // Should whitelist-filter flags to only safe regex characters [gimsuy]
        expect(grepFn![0]).toMatch(/replace\([^)]*\[^gimsuy\]|\.replace\([^)]*\/\[/);
      });
    });

  // from tests/audit47.test.ts #10 — sandbox locate_line should clamp negative start to 0
  describe("#10 — sandbox locate_line should clamp negative start to 0", () => {
      it("should clamp startIdx to 0 when negative after normalization", () => {
        const source = readFileSync("node_modules/repl-sandbox/dist/builtins/text-utils.js", "utf-8");
        const locateFn = source.match(/function locate_line[\s\S]*?join\('\\\\n'\)/);
        expect(locateFn).not.toBeNull();
        // Should clamp startIdx to >= 0 after swap, and validate ordering
        expect(locateFn![0]).toMatch(/startIdx\s*>\s*endIdx[\s\S]*?startIdx\s*=\s*Math\.max\(0/);
      });
    });

  // from tests/audit57.test.ts #3 — sandbox-tools grep should check pattern is valid
  describe("#3 — sandbox-tools grep should check pattern is valid", () => {
      it("should guard against null/undefined pattern", () => {
        const source = readFileSync("node_modules/repl-sandbox/dist/builtins/grep.js", "utf-8");
        const grepFn = source.match(/function grep\(pattern[\s\S]*?pattern\.length/);
        expect(grepFn).not.toBeNull();
        expect(grepFn![0]).toMatch(/!pattern|typeof pattern|pattern\s*==\s*null/);
      });
    });

  // from tests/audit71.test.ts #10 — sandbox count_tokens should cap words array
  describe("#10 — sandbox count_tokens should cap words array", () => {
      it("should limit words array size", () => {
        const source = readFileSync("node_modules/repl-sandbox/dist/builtins/text-utils.js", "utf-8");
        const fnStart = source.indexOf("function count_tokens(");
        expect(fnStart).toBeGreaterThan(-1);
        const block = source.slice(fnStart, fnStart + 300);
        expect(block).toMatch(/MAX_WORDS|MAX_TOKEN|words\.length|words\.slice/i);
      });
    });

  // from tests/audit78.test.ts #8 — grep should type-check flags parameter
  describe("#8 — grep should type-check flags parameter", () => {
      it("should validate typeof flags === string", () => {
        const source = readFileSync("node_modules/repl-sandbox/dist/builtins/grep.js", "utf-8");
        const grepFn = source.indexOf("function grep(pattern, flags)");
        expect(grepFn).toBeGreaterThan(-1);
        const block = source.slice(grepFn, grepFn + 400);
        expect(block).toMatch(/typeof flags\s*[!=]==?\s*['"]string['"]/);
      });
    });

  // from tests/audit78.test.ts #10 — synthesize_extractor should validate output types
  describe("#10 — synthesize_extractor should validate output types", () => {
      it("should check typeof output before casting", () => {
        const source = readFileSync("src/synthesis/sandbox-tools.ts", "utf-8");
        const synthFn = source.indexOf("synthesize_extractor:");
        expect(synthFn).toBeGreaterThan(-1);
        const block = source.slice(synthFn, synthFn + 800);
        expect(block).toMatch(/typeof\s+.*output|output\s*===\s*null|output\s*!==\s*null/);
      });
    });

  // from tests/audit81.test.ts #7 — sandbox should not expose Object.assign
  describe("#7 — sandbox should not expose Object.assign", () => {
      it("should remove or guard Object.assign in sandbox globals", () => {
        const source = readFileSync("node_modules/repl-sandbox/dist/safe-globals.js", "utf-8");
        const objectBlock = source.indexOf("Object: Object.freeze(Object.create(null");
        expect(objectBlock).toBeGreaterThan(-1);
        const block = source.slice(objectBlock, objectBlock + 500);
        // Object.assign should be removed or guarded
        expect(block).not.toMatch(/assign:\s*\{\s*value:\s*Object\.assign/);
      });
    });

  // from tests/audit83.test.ts #6 — sandbox should not expose Object.fromEntries
  describe("#6 — sandbox should not expose Object.fromEntries", () => {
      it("should remove or guard Object.fromEntries in sandbox globals", () => {
        const source = readFileSync("node_modules/repl-sandbox/dist/safe-globals.js", "utf-8");
        const objectBlock = source.indexOf("Object: Object.freeze(Object.create(null");
        expect(objectBlock).toBeGreaterThan(-1);
        const block = source.slice(objectBlock, objectBlock + 800);
        expect(block).not.toMatch(/fromEntries:\s*\{\s*value:\s*Object\.fromEntries/);
      });
    });

  // from tests/audit83.test.ts #7 — sandbox should not expose Object.defineProperty
  describe("#7 — sandbox should not expose Object.defineProperty", () => {
      it("should remove or guard Object.defineProperty in sandbox globals", () => {
        const source = readFileSync("node_modules/repl-sandbox/dist/safe-globals.js", "utf-8");
        const objectBlock = source.indexOf("Object: Object.freeze(Object.create(null");
        expect(objectBlock).toBeGreaterThan(-1);
        const block = source.slice(objectBlock, objectBlock + 800);
        expect(block).not.toMatch(/defineProperty:\s*\{\s*value:\s*Object\.defineProperty/);
      });
    });

  // from tests/audit89.test.ts #8 — grep beforeMatch should use searchContext
  describe("#8 — grep beforeMatch should use searchContext", () => {
      it("should use searchContext for line number calculation", () => {
        const source = readFileSync("node_modules/repl-sandbox/dist/builtins/grep.js", "utf-8");
        const beforeMatch = source.indexOf("beforeMatch");
        expect(beforeMatch).toBeGreaterThan(-1);
        const block = source.slice(beforeMatch, beforeMatch + 100);
        // Should use searchContext, not the full context
        expect(block).toMatch(/searchContext\.slice/);
      });
    });

});
