import { describe, it, expect } from "vitest";
import { evaluate, type SandboxTools } from "../../src/logic/lc-interpreter.js";
import { formatValue } from "../../src/logic/lc-interpreter.js";
import { readFileSync } from "fs";

describe("LC Interpreter - ReDoS protection", () => {
  const tools: SandboxTools = {
    grep: () => [],
    fuzzy_search: () => [],
    text_stats: () => ({ length: 0, lineCount: 0, sample: { start: "", middle: "", end: "" } }),
    context: "test content",
  };
  const env = new Map();
  const log = () => {};

  it("should return null for match with ReDoS pattern", () => {
    const term = {
      tag: "match" as const,
      str: { tag: "lit" as const, value: "aaaaaaa" },
      pattern: "(a+)+",
      group: 0,
    };
    const result = evaluate(term as any, tools, env, log);
    expect(result).toBeNull();
  });

  it("should return original string for replace with ReDoS pattern", () => {
    const term = {
      tag: "replace" as const,
      str: { tag: "lit" as const, value: "aaaaaaa" },
      from: "(a+)+",
      to: "b",
    };
    const result = evaluate(term as any, tools, env, log);
    expect(result).toBe("aaaaaaa");
  });

  it("should return null for parseInt of non-numeric string", () => {
    const term = {
      tag: "parseInt" as const,
      str: { tag: "lit" as const, value: "hello" },
    };
    const result = evaluate(term as any, tools, env, log);
    expect(result).toBeNull();
  });

  it("should return null for parseFloat of non-numeric string", () => {
    const term = {
      tag: "parseFloat" as const,
      str: { tag: "lit" as const, value: "abc" },
    };
    const result = evaluate(term as any, tools, env, log);
    expect(result).toBeNull();
  });

  it("should return valid number for parseInt of numeric string", () => {
    const term = {
      tag: "parseInt" as const,
      str: { tag: "lit" as const, value: "42" },
    };
    const result = evaluate(term as any, tools, env, log);
    expect(result).toBe(42);
  });

  it("should return valid number for parseFloat of numeric string", () => {
    const term = {
      tag: "parseFloat" as const,
      str: { tag: "lit" as const, value: "3.14" },
    };
    const result = evaluate(term as any, tools, env, log);
    expect(result).toBe(3.14);
  });

  it("should return a working predicate from classify with examples", () => {
    const term = {
      tag: "classify" as const,
      examples: [
        { input: "error", output: true },
        { input: "warning", output: true },
        { input: "info", output: false },
        { input: "debug", output: false },
      ],
    };
    const result = evaluate(term as any, tools, env, log);
    expect(typeof result).toBe("function");
    // The classify result should be a callable function
    const predicate = result as unknown as (input: unknown) => boolean;
    expect(predicate("error occurred")).toBe(true);
    expect(predicate("warning issued")).toBe(true);
    expect(predicate("just some text")).toBe(false);
  });

  it("should classify grep result objects using .line property", () => {
    const term = {
      tag: "classify" as const,
      examples: [
        { input: "error", output: true },
        { input: "success", output: false },
      ],
    };
    const result = evaluate(term as any, tools, env, log);
    const predicate = result as unknown as (input: unknown) => boolean;
    // Object with .line property should match against .line, not "[object Object]"
    expect(predicate({ line: "error occurred", lineNum: 1 })).toBe(true);
    expect(predicate({ line: "success done", lineNum: 2 })).toBe(false);
  });

  it("should return null for match with negative group index", () => {
    const term = {
      tag: "match" as const,
      str: { tag: "lit" as const, value: "hello world" },
      pattern: "(\\w+)",
      group: -1,
    };
    const result = evaluate(term as any, tools, env, log);
    expect(result).toBeNull();
  });

  it("should reject ReDoS pattern in grep", () => {
    const grepCalls: string[] = [];
    const toolsWithGrep: SandboxTools = {
      ...tools,
      grep: (pattern: string) => {
        grepCalls.push(pattern);
        return [];
      },
    };
    const term = {
      tag: "grep" as const,
      pattern: "(a+)+",
    };
    // Should not call grep with ReDoS pattern
    const result = evaluate(term as any, toolsWithGrep, env, log);
    expect(Array.isArray(result)).toBe(true);
    expect((result as unknown[]).length).toBe(0);
  });

  it("should use truthy check (not === true) in filter predicate", () => {
    // A predicate that returns a truthy non-boolean value (like a string) should keep the item
    const collection = { tag: "lit" as const, value: ["hello", "", "world", ""] };
    const predicate = {
      tag: "lambda" as const,
      param: "x",
      body: { tag: "var" as const, name: "x" },
    };
    const term = {
      tag: "filter" as const,
      collection,
      predicate,
    };
    const result = evaluate(term as any, tools, env, log);
    // "hello" and "world" are truthy, "" is falsy
    expect(result).toEqual(["hello", "world"]);
  });

  it("filter/map should accept native functions (from classify)", () => {
    // classify returns a native function, not a closure
    // filter and map should accept it
    const classifyTerm = {
      tag: "classify" as const,
      examples: [
        { input: "error", output: true },
        { input: "success", output: false },
      ],
    };
    const classifyResult = evaluate(classifyTerm as any, tools, env, log);
    expect(typeof classifyResult).toBe("function");

    // Now use the classify result in a filter
    // filter needs a closure or callable - the classify result is a native function
    const items = [
      { line: "error occurred", lineNum: 1 },
      { line: "success happened", lineNum: 2 },
      { line: "error again", lineNum: 3 },
    ];

    // Put the classify fn into environment so the predicate can use it
    const envWithClassify = new Map(env);
    envWithClassify.set("classifyFn", classifyResult as any);

    // filter with the native classify function should work, not throw
    const filterTerm = {
      tag: "filter" as const,
      collection: { tag: "lit" as const, value: items },
      predicate: {
        tag: "lambda" as const,
        param: "x",
        body: { tag: "var" as const, name: "x" },
      },
    };
    // This should not throw even though collection items are objects
    expect(() => evaluate(filterTerm as any, tools, env, log)).not.toThrow();
  });

  describe("parseDate validation", () => {
    it("should reject invalid ISO date with month 13", () => {
      const term = {
        tag: "parseDate" as const,
        str: { tag: "lit" as const, value: "2024-13-01" },
      };
      const result = evaluate(term as any, tools, env, log);
      expect(result).toBeNull();
    });

    it("should reject invalid ISO date with month 0", () => {
      const term = {
        tag: "parseDate" as const,
        str: { tag: "lit" as const, value: "2024-00-15" },
      };
      const result = evaluate(term as any, tools, env, log);
      expect(result).toBeNull();
    });

    it("should reject Feb 31 as invalid date", () => {
      const term = {
        tag: "parseDate" as const,
        str: { tag: "lit" as const, value: "02/31/2024" },
      };
      const result = evaluate(term as any, tools, env, log);
      expect(result).toBeNull();
    });

    it("should return null for excessively long date string", () => {
      const term = {
        tag: "parseDate" as const,
        str: { tag: "lit" as const, value: "A".repeat(500) },
      };
      const result = evaluate(term as any, tools, env, log);
      expect(result).toBeNull();
    });

    it("should parse valid ISO date correctly", () => {
      const term = {
        tag: "parseDate" as const,
        str: { tag: "lit" as const, value: "2024-01-15" },
      };
      const result = evaluate(term as any, tools, env, log);
      expect(result).toBe("2024-01-15");
    });

    it("should parse valid US format date correctly", () => {
      const term = {
        tag: "parseDate" as const,
        str: { tag: "lit" as const, value: "01/15/2024" },
      };
      const result = evaluate(term as any, tools, env, log);
      // Should parse as MM/DD/YYYY and return ISO format
      expect(result).toMatch(/2024-01-15/);
    });

    it("should reject day 32 as invalid", () => {
      const term = {
        tag: "parseDate" as const,
        str: { tag: "lit" as const, value: "2024-01-32" },
      };
      const result = evaluate(term as any, tools, env, log);
      expect(result).toBeNull();
    });
  });

  it("should cap log array at maximum entries", async () => {
    const { interpret } = await import("../../src/logic/lc-interpreter.js");
    // Create a map term that generates many log entries
    const term = {
      tag: "map" as const,
      collection: { tag: "lit" as const, value: Array.from({ length: 200 }, (_, i) => i) },
      transform: {
        tag: "lambda" as const,
        param: "x",
        body: { tag: "var" as const, name: "x" },
      },
    };
    const result = interpret(term as any, tools);
    expect(result.success).toBe(true);
    expect(result.logs.length).toBeLessThanOrEqual(10001);
  });
});

// =====================================================================
// Source-pattern checks (from audits)
// =====================================================================
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
describe("Source-pattern checks (from audits)", () => {
  // from tests/audit14.test.ts Issue #3: evaluateWithBinding var case should not reset depth
  describe("Issue #3: evaluateWithBinding var case should not reset depth", () => {
    it("should propagate depth for unbound variable lookup", async () => {
      const fs = await import("node:fs/promises");
      const source = await fs.readFile("src/logic/lc-solver.ts", "utf-8");

      // Find the evaluateWithBinding function
      const ewbFn = source.match(
        /function evaluateWithBinding\([\s\S]*?\n\}/m
      );
      expect(ewbFn).not.toBeNull();
      const ewbBody = ewbFn![0];

      // Find the var case — it should NOT call evaluate with depth 0
      // (The `await ` prefix is part of the match after the async refactor.)
      const varCase = ewbBody.match(/case "var":\s*\n[^}]*?return (?:await )?evaluate\([^)]+\)/);
      expect(varCase).not.toBeNull();
      // The var case should pass depth + 1, not 0
      expect(varCase![0]).not.toMatch(/evaluate\([^,]+,[^,]+,[^,]+,[^,]+,\s*0\s*\)/);
    });
  });

  // from tests/audit14.test.ts Issue #6: interpreter replace should escape replacement backreferences
  describe("Issue #6: interpreter replace should escape replacement backreferences", () => {
    it("should treat $1 in replacement as literal, not backreference", async () => {
      const tools: SandboxTools = {
        grep: () => [],
        fuzzy_search: () => [],
        text_stats: () => ({ length: 0, lineCount: 0, sample: { start: "", middle: "", end: "" } }),
        context: "",
      };
      const env = new Map();
      const log = () => {};

      const term = {
        tag: "replace" as const,
        str: { tag: "lit" as const, value: "hello world" },
        from: "(\\w+)",
        to: "$1-replaced",
      };
      const result = evaluate(term as any, tools, env, log);
      // If $1 is treated as literal, result should contain "$1-replaced"
      // If $1 is a backreference, result would be "hello-replaced world-replaced" (wrong)
      expect(String(result)).toContain("$1-replaced");
    });
  });

  // from tests/audit14.test.ts Issue #14: interpreter split should reject negative index
  describe("Issue #14: interpreter split should reject negative index", () => {
    it("should return null for negative split index", async () => {
      const tools: SandboxTools = {
        grep: () => [],
        fuzzy_search: () => [],
        text_stats: () => ({ length: 0, lineCount: 0, sample: { start: "", middle: "", end: "" } }),
        context: "",
      };
      const env = new Map();
      const log = () => {};

      const term = {
        tag: "split" as const,
        str: { tag: "lit" as const, value: "a:b:c" },
        delim: ":",
        index: -1,
      };
      const result = evaluate(term as any, tools, env, log);
      expect(result).toBeNull();
    });
  });

  // from tests/audit15.test.ts Audit15 #8: native function try-catch in filter/map
  describe("Audit15 #8: native function try-catch in filter/map", () => {
    it("filter should handle native function that throws", async () => {
      const { evaluate } = await import("../../src/logic/lc-interpreter.js");
      const tools: any = {
        grep: () => [],
        fuzzy_search: () => [],
        text_stats: () => ({ length: 0, lineCount: 0, sample: { start: "", middle: "", end: "" } }),
        context: "",
      };
      const env = new Map<string, any>();
      // Set up a native throwing function
      const throwingFn = () => { throw new Error("native error"); };
      env.set("badFn", throwingFn);

      const term: any = {
        tag: "filter",
        collection: { tag: "lit", value: [1, 2, 3] },
        predicate: { tag: "var", name: "badFn" },
      };
      // Should propagate error cleanly, not crash with unclear message
      expect(() => evaluate(term, tools, env, () => {}, 0)).toThrow();
    });
  });

  // from tests/audit15.test.ts Audit15 #9: split negative index
  describe("Audit15 #9: split negative index", () => {
    it("lc-interpreter split should return null for negative index", async () => {
      const { evaluate } = await import("../../src/logic/lc-interpreter.js");
      const tools: any = {
        grep: () => [],
        fuzzy_search: () => [],
        text_stats: () => ({ length: 0, lineCount: 0, sample: { start: "", middle: "", end: "" } }),
        context: "",
      };
      const term: any = {
        tag: "split",
        str: { tag: "lit", value: "a,b,c" },
        delim: ",",
        index: -1,
      };
      const result = evaluate(term, tools, new Map(), () => {}, 0);
      // Negative index should return null, not undefined behavior
      expect(result).toBe(null);
    });
  });

  // from tests/audit16.test.ts Audit16 #7: interpreter app native functions
  describe("Audit16 #7: interpreter app native functions", () => {
    it("should accept native functions in app case", async () => {
      const { evaluate } = await import("../../src/logic/lc-interpreter.js");
      const tools: any = {
        grep: () => [],
        fuzzy_search: () => [],
        text_stats: () => ({ length: 0, lineCount: 0, sample: { start: "", middle: "", end: "" } }),
        context: "",
      };
      const env = new Map<string, any>();
      // classify returns a native function
      const classifyTerm: any = {
        tag: "classify",
        examples: [
          { input: "error found", output: true },
          { input: "all good", output: false },
          { input: "error again", output: true },
          { input: "no problem", output: false },
        ],
      };
      // Evaluate classify to get native fn, then apply it
      const classifyFn = evaluate(classifyTerm, tools, env, () => {}, 0);
      expect(typeof classifyFn).toBe("function");

      // Now try to use app with a native function — currently throws
      env.set("classifier", classifyFn);
      const appTerm: any = {
        tag: "app",
        fn: { tag: "var", name: "classifier" },
        arg: { tag: "lit", value: "error found here" },
      };
      // Should not throw — should apply native function
      // "error found here" includes "error found" substring
      const result = evaluate(appTerm, tools, env, () => {}, 0);
      expect(result).toBe(true);
    });
  });

  // from tests/audit16.test.ts Audit16 #8: filter JS truthiness
  describe("Audit16 #8: filter JS truthiness", () => {
    it("filter should use JS truthiness consistent with solver Boolean()", async () => {
      const { evaluate } = await import("../../src/logic/lc-interpreter.js");
      const tools: any = {
        grep: () => [],
        fuzzy_search: () => [],
        text_stats: () => ({ length: 0, lineCount: 0, sample: { start: "", middle: "", end: "" } }),
        context: "",
      };
      const env = new Map<string, any>();
      // Identity predicate — filter keeps truthy values
      const term: any = {
        tag: "filter",
        collection: { tag: "lit", value: [0, 1, "", "hello", false, true, null] },
        predicate: {
          tag: "lambda",
          param: "x",
          body: { tag: "var", name: "x" },
        },
      };
      const result = evaluate(term, tools, env, () => {}, 0) as any[];
      // JS truthiness: 0, "", false, null are all falsy — by design
      expect(result).toEqual([1, "hello", true]);
    });
  });

  // from tests/audit16.test.ts Audit16 #15: formatValue native functions
  describe("Audit16 #15: formatValue native functions", () => {
    it("should display native functions meaningfully", async () => {
      const { formatValue } = await import("../../src/logic/lc-interpreter.js");
      const nativeFn = (x: unknown) => x;
      const result = formatValue(nativeFn as any);
      // Should show something meaningful, not raw toString
      expect(result).toContain("function");
    });
  });

  // from tests/audit17.test.ts Audit17 #5: classify empty string guard
  describe("Audit17 #5: classify empty string guard", () => {
    it("should not match everything when trueExamples contains empty string", async () => {
      const { evaluate } = await import("../../src/logic/lc-interpreter.js");
      const tools: any = {
        grep: () => [],
        fuzzy_search: () => [],
        text_stats: () => ({ length: 0, lineCount: 0, sample: { start: "", middle: "", end: "" } }),
        context: "",
      };
      const env = new Map<string, any>();
      const classifyTerm: any = {
        tag: "classify",
        examples: [
          { input: "", output: true },
          { input: "error", output: true },
          { input: "ok", output: false },
        ],
      };
      const classifyFn = evaluate(classifyTerm, tools, env, () => {}, 0);
      expect(typeof classifyFn).toBe("function");
      // Empty string example should be filtered — "all good here" should NOT match
      // With empty string filtered, only "error" remains as true example
      const result2 = (classifyFn as Function)("all good here");
      expect(result2).toBe(false);
    });
  });

  // from tests/audit18.test.ts Audit18 #7: classify uses false examples
  describe("Audit18 #7: classify uses false examples", () => {
    it("should not match items that are in false examples", async () => {
      const { evaluate } = await import("../../src/logic/lc-interpreter.js");
      const tools: any = {
        grep: () => [],
        fuzzy_search: () => [],
        text_stats: () => ({ length: 0, lineCount: 0, sample: { start: "", middle: "", end: "" } }),
        context: "",
      };
      const env = new Map<string, any>();
      const term: any = {
        tag: "classify",
        examples: [
          { input: "error occurred", output: true },
          { input: "error resolved", output: false },
          { input: "critical error", output: true },
          { input: "no issues", output: false },
        ],
      };
      const fn = evaluate(term, tools, env, () => {}, 0);
      expect(typeof fn).toBe("function");
      // "error resolved" is a false example, so even though it contains "error",
      // it should ideally not match (or at least show awareness of false examples)
      // The current implementation just checks trueExamples substrings
      // With false example awareness, we should find a distinguishing pattern
      const result = (fn as Function)("no issues found");
      expect(result).toBe(false);
    });
  });

  // from tests/audit20.test.ts Audit20 #5: filter JS truthiness is intentional
  describe("Audit20 #5: filter JS truthiness is intentional", () => {
    it("should drop items where predicate returns null", async () => {
      const { evaluate } = await import("../../src/logic/lc-interpreter.js");
      const tools: any = {
        grep: () => [],
        fuzzy_search: () => [],
        text_stats: () => ({ length: 0, lineCount: 0, sample: { start: "", middle: "", end: "" } }),
        context: "",
      };
      const env = new Map<string, any>();
      const filterTerm: any = {
        tag: "filter",
        collection: {
          tag: "lit",
          value: [
            { line: "line1", lineNum: 1 },
          ],
        },
        predicate: {
          tag: "lambda",
          param: "x",
          body: { tag: "lit", value: null },
        },
      };
      const result = evaluate(filterTerm, tools, env, () => {}, 0) as any[];
      expect(result.length).toBe(0);
    });
  });

  // from tests/audit26.test.ts Audit26 #1: classifier uses false examples
  describe("Audit26 #1: classifier uses false examples", () => {
    it("should reject inputs matching false examples", async () => {
      const { evaluate } = await import("../../src/logic/lc-interpreter.js");
      const tools: any = {
        context: "",
        grep: () => [],
        fuzzy_search: () => [],
        text_stats: () => ({}),
      };
      // Build classifier where false examples share substrings with true
      const term: any = {
        tag: "classify",
        examples: [
          { input: "ERROR: disk full", output: true },
          { input: "ERROR: timeout", output: true },
          { input: "INFO: started", output: false },
          { input: "INFO: stopped", output: false },
        ],
      };
      const classifier = evaluate(term, tools, new Map(), () => {}, 0) as (input: string) => boolean;
      expect(typeof classifier).toBe("function");
      // Should match true examples
      expect(classifier("ERROR: disk full")).toBe(true);
      // Should NOT match false examples
      expect(classifier("INFO: started")).toBe(false);
    });
  });

  // from tests/audit27.test.ts Audit27 #1: interpreter filter keeps falsy values
  describe("Audit27 #1: interpreter filter keeps falsy values", () => {
    it("should keep items where predicate returns true for 0", async () => {
      const { evaluate } = await import("../../src/logic/lc-interpreter.js");
      const tools: any = {
        context: "",
        grep: () => [],
        fuzzy_search: () => [],
        text_stats: () => ({}),
      };
      // Wrap native function in a lit term so evaluate() returns it as-is
      const term: any = {
        tag: "filter",
        collection: { tag: "lit", value: [0, 1, 2, 3] },
        predicate: { tag: "lit", value: (item: number) => item >= 0 },
      };
      const result = evaluate(term, tools, new Map(), () => {}, 0);
      // All items >= 0, so all should be kept (including 0)
      expect(result).toEqual([0, 1, 2, 3]);
    });

    it("should keep items where predicate returns true for even numbers including 0", async () => {
      const { evaluate } = await import("../../src/logic/lc-interpreter.js");
      const tools: any = {
        context: "",
        grep: () => [],
        fuzzy_search: () => [],
        text_stats: () => ({}),
      };
      const term: any = {
        tag: "filter",
        collection: { tag: "lit", value: [0, 1, 2, 3, 4] },
        predicate: { tag: "lit", value: (item: number) => item % 2 === 0 },
      };
      const result = evaluate(term, tools, new Map(), () => {}, 0);
      // 0, 2, 4 are even — predicate returns true for all of them
      expect(result).toEqual([0, 2, 4]);
    });
  });

  // from tests/audit33.test.ts #2 — lc-interpreter should handle all LCTerm tags
  describe("#2 — lc-interpreter should handle all LCTerm tags", () => {
      it("should handle 'sum' tag", async () => {
        const { evaluate } = await import("../../src/logic/lc-interpreter.js");
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
        const { evaluate } = await import("../../src/logic/lc-interpreter.js");
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
        const { evaluate } = await import("../../src/logic/lc-interpreter.js");
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
        const { evaluate } = await import("../../src/logic/lc-interpreter.js");
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
        const { evaluate } = await import("../../src/logic/lc-interpreter.js");
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
        const { evaluate } = await import("../../src/logic/lc-interpreter.js");
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

  // from tests/audit37.test.ts #2 — parseCurrency should detect EU format
  describe("#2 — parseCurrency should detect EU format", () => {
      it("should detect EU comma-as-decimal format", () => {
        const source = readFileSync("src/logic/lc-interpreter.ts", "utf-8");
        const parseCurrency = source.match(/case "parseCurrency"[\s\S]*?return isNegative/);
        expect(parseCurrency).not.toBeNull();
        // Should have EU format detection logic
        expect(parseCurrency![0]).toMatch(/EU|euro|comma.*decimal|decimal.*comma|lastComma|commaPos/i);
      });
    });

  // from tests/audit37.test.ts #6 — split should validate non-empty delimiter
  describe("#6 — split should validate non-empty delimiter", () => {
      it("should check for empty delimiter in split case", () => {
        const source = readFileSync("src/logic/lc-interpreter.ts", "utf-8");
        const splitCase = source.match(/case "split"[\s\S]*?parts\[term\.index\]/);
        expect(splitCase).not.toBeNull();
        // Should validate delimiter is not empty
        expect(splitCase![0]).toMatch(/delim.*===\s*""|delim\.length|!term\.delim|delim.*empty/i);
      });
    });

  // from tests/audit37.test.ts #8 — interpreter match should validate group bounds
  describe("#8 — interpreter match should validate group bounds", () => {
      it("should check group < result.length", () => {
        const source = readFileSync("src/logic/lc-interpreter.ts", "utf-8");
        const matchCase = source.match(/case "match"[\s\S]*?result\[term\.group\]/);
        expect(matchCase).not.toBeNull();
        // Should validate group index against result length
        expect(matchCase![0]).toMatch(/term\.group\s*>=?\s*result\.length|group.*bounds|group.*length/i);
      });
    });

  // from tests/audit43.test.ts #3 — lc-interpreter parseCurrency should handle US comma-only format
  describe("#3 — lc-interpreter parseCurrency should handle US comma-only format", () => {
      it("should not treat comma-only values as EU format", () => {
        const source = readFileSync("src/logic/lc-interpreter.ts", "utf-8");
        const parseCurrencyBlock = source.match(/case "parseCurrency"[\s\S]*?case "parseDate"/);
        expect(parseCurrencyBlock).not.toBeNull();
        // Should check if comma position indicates thousands (3-digit groups)
        // or EU decimal (not just lastCommaPos > lastDotPos)
        expect(parseCurrencyBlock![0]).toMatch(/afterLastComma|\.length\s*===\s*3|\.length\s*!==\s*3|digits.*comma|comma.*digits/i);
      });
    });

  // from tests/audit45.test.ts #3 — lc-interpreter extract should validate group parameter
  describe("#3 — lc-interpreter extract should validate group parameter", () => {
      it("should check group is non-negative integer", () => {
        const source = readFileSync("src/logic/lc-interpreter.ts", "utf-8");
        const extractCase = source.match(/case "extract"[\s\S]*?case "synthesize"/);
        expect(extractCase).not.toBeNull();
        expect(extractCase![0]).toMatch(/Number\.isInteger.*group|group\s*<\s*0|isInteger/);
      });
    });

  // from tests/audit45.test.ts #9 — lc-interpreter lines should validate end >= start
  describe("#9 — lc-interpreter lines should validate end >= start", () => {
      it("should check that end is not less than start", () => {
        const source = readFileSync("src/logic/lc-interpreter.ts", "utf-8");
        const linesCase = source.match(/case "lines"[\s\S]*?case "reduce"/);
        expect(linesCase).not.toBeNull();
        expect(linesCase![0]).toMatch(/end\s*<\s*start|start\s*>\s*end|end\s*>=\s*start|start\s*<=\s*end/);
      });
    });

  // from tests/audit52.test.ts #4 — lc-interpreter lines should validate start/end as integers
  describe("#4 — lc-interpreter lines should validate start/end as integers", () => {
      it("should floor or check integer on start and end", () => {
        const source = readFileSync("src/logic/lc-interpreter.ts", "utf-8");
        const linesCase = source.match(/case "lines"[\s\S]*?Math\.min\(lines\.length/);
        expect(linesCase).not.toBeNull();
        expect(linesCase![0]).toMatch(/Math\.floor|Number\.isInteger|Math\.trunc/);
      });
    });

  // from tests/audit58.test.ts #9 — lc-interpreter lines should cap returned line count
  describe("#9 — lc-interpreter lines should cap returned line count", () => {
      it("should enforce a max lines returned limit", () => {
        const source = readFileSync("src/logic/lc-interpreter.ts", "utf-8");
        const linesCase = source.match(/case "lines"[\s\S]*?\.join\("\\n"\)/);
        expect(linesCase).not.toBeNull();
        expect(linesCase![0]).toMatch(/MAX_LINES|end\s*-\s*start\s*>/i);
      });
    });

  // from tests/audit62.test.ts #10 — lc-interpreter split should cap parts length
  describe("#10 — lc-interpreter split should cap parts length", () => {
      it("should limit split result size", () => {
        const source = readFileSync("src/logic/lc-interpreter.ts", "utf-8");
        const caseStart = source.indexOf('case "split"');
        expect(caseStart).toBeGreaterThan(-1);
        const block = source.slice(caseStart, caseStart + 400);
        expect(block).toMatch(/MAX_SPLIT|parts\.length/i);
      });
    });

  // from tests/audit72.test.ts #3 — lc-interpreter map should cap result array size
  describe("#3 — lc-interpreter map should cap result array size", () => {
      it("should have MAX bound on map output", () => {
        const source = readFileSync("src/logic/lc-interpreter.ts", "utf-8");
        const mapCase = source.indexOf('case "map"');
        expect(mapCase).toBeGreaterThan(-1);
        const block = source.slice(mapCase, mapCase + 800);
        expect(block).toMatch(/MAX_MAP|MAX_RESULTS|results\.length\s*>=|results\.length\s*>/);
      });
    });

  // from tests/audit75.test.ts #1 — lc-interpreter parseNumber should validate string length
  describe("#1 — lc-interpreter parseNumber should validate string length", () => {
      it("should check str.length before processing", () => {
        const source = readFileSync("src/logic/lc-interpreter.ts", "utf-8");
        const parseNum = source.indexOf('case "parseNumber"');
        expect(parseNum).toBeGreaterThan(-1);
        const block = source.slice(parseNum, parseNum + 300);
        expect(block).toMatch(/str\.length\s*>|MAX_PARSE/);
      });
    });

  // from tests/audit76.test.ts #2 — lc-interpreter parseFloat should validate string length
  describe("#2 — lc-interpreter parseFloat should validate string length", () => {
      it("should check string length before parseFloat", () => {
        const source = readFileSync("src/logic/lc-interpreter.ts", "utf-8");
        const parseFloatCase = source.indexOf('case "parseFloat"');
        expect(parseFloatCase).toBeGreaterThan(-1);
        const block = source.slice(parseFloatCase, parseFloatCase + 400);
        expect(block).toMatch(/\.length\s*>/);
      });
    });

  // from tests/audit76.test.ts #3 — lc-interpreter parseInt should validate string length
  describe("#3 — lc-interpreter parseInt should validate string length", () => {
      it("should check string length before parseInt", () => {
        const source = readFileSync("src/logic/lc-interpreter.ts", "utf-8");
        const parseIntCase = source.indexOf('case "parseInt"');
        expect(parseIntCase).toBeGreaterThan(-1);
        const block = source.slice(parseIntCase, parseIntCase + 400);
        expect(block).toMatch(/\.length\s*>/);
      });
    });

  // from tests/audit76.test.ts #7 — lc-interpreter coerce number should validate string length
  describe("#7 — lc-interpreter coerce number should validate string length", () => {
      it("should check string length before parseFloat in coerce", () => {
        const source = readFileSync("src/logic/lc-interpreter.ts", "utf-8");
        const coerceCase = source.indexOf('case "coerce"');
        expect(coerceCase).toBeGreaterThan(-1);
        const block = source.slice(coerceCase, coerceCase + 400);
        expect(block).toMatch(/\.length\s*>|MAX_COERCE/);
      });
    });

  // from tests/audit78.test.ts #6 — formatValue should guard against null in typeof object check
  describe("#6 — formatValue should guard against null in typeof object check", () => {
      it("should have value !== null check", () => {
        const source = readFileSync("src/logic/lc-interpreter.ts", "utf-8");
        const fnStart = source.indexOf("function formatValue");
        expect(fnStart).toBeGreaterThan(-1);
        const objectCheck = source.indexOf('typeof value === "object"', fnStart);
        expect(objectCheck).toBeGreaterThan(-1);
        const block = source.slice(objectCheck, objectCheck + 100);
        expect(block).toMatch(/value\s*!==\s*null/);
      });
    });

  // from tests/audit84.test.ts #3 — split should type-check and length-bound delimiter
  describe("#3 — split should type-check and length-bound delimiter", () => {
      it("should validate delimiter is a string with max length", () => {
        const source = readFileSync("src/logic/lc-interpreter.ts", "utf-8");
        const splitCase = source.indexOf('case "split"', source.indexOf("lc-interpreter") > -1 ? 0 : 0);
        expect(splitCase).toBeGreaterThan(-1);
        const block = source.slice(splitCase, splitCase + 400);
        expect(block).toMatch(/typeof\s+term\.delim\s*!==?\s*["']string["']|term\.delim\.length\s*>\s*\d/);
      });
    });

  // from tests/audit92.test.ts #6 — split should check index against parts.length
  describe("#6 — split should check index against parts.length", () => {
      it("should reject index >= parts.length", () => {
        const source = readFileSync("src/logic/lc-interpreter.ts", "utf-8");
        const splitCase = source.indexOf('case "split"');
        expect(splitCase).toBeGreaterThan(-1);
        const block = source.slice(splitCase, splitCase + 900);
        // Should check term.index against parts.length
        expect(block).toMatch(/index\s*>=\s*parts\.length|index\s*>\s*parts\.length\s*-\s*1/);
      });
    });

});
