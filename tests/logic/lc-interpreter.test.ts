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
});
