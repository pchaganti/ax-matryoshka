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
});
