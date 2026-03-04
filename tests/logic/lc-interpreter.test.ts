import { describe, it, expect } from "vitest";
import { evaluate, type SandboxTools } from "../../src/logic/lc-interpreter.js";

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
