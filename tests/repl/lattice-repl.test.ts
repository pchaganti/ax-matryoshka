import { describe, it, expect } from "vitest";

// Test the REPL by importing the engine it uses
// Full REPL interactive testing is complex, so we test the underlying engine
import { HandleSession } from "../../src/engine/handle-session.js";

describe("REPL underlying engine", () => {
  it("should process commands sequentially", async () => {
    const engine = new HandleSession();
    // Use unique pattern that won't match INFO, etc
    engine.loadContent("FATAL: test error\nINFO: test info\nFATAL: another error");

    // Simulate REPL session
    const r1 = await engine.execute('(grep "FATAL")');
    expect(r1.success).toBe(true);
    expect(r1.handle).toBeDefined();
    const expanded = engine.expand(r1.handle!);
    expect(expanded.success).toBe(true);
    expect(expanded.data?.length).toBe(2);

    const r2 = await engine.execute('(count RESULTS)');
    expect(r2.success).toBe(true);
    expect(r2.value).toBe(2);
  });

  it("should maintain state across commands", async () => {
    const engine = new HandleSession();
    engine.loadContent("line1\nline2\nline3");

    await engine.execute('(grep "line")');
    const bindings = engine.getBindings();

    expect(bindings.RESULTS).toBe("-> $grep_line");
    expect(bindings.$grep_line).toContain("Array(3)");
  });

  it("should reset state on command", async () => {
    const engine = new HandleSession();
    engine.loadContent("test");

    await engine.execute('(grep "test")');
    expect(Object.keys(engine.getBindings()).length).toBeGreaterThan(0);

    engine.reset();
    expect(Object.keys(engine.getBindings()).length).toBe(0);
  });

  it("should provide command reference", async () => {
    const ref = HandleSession.getCommandReference();

    expect(ref).toContain("grep");
    expect(ref).toContain("filter");
    expect(ref).toContain("count");
    expect(ref).toContain("sum");
    expect(ref).toContain("RESULTS");
  });

  it("should support symbol queries after loading Elixir code", async () => {
    const engine = new HandleSession();
    await engine.loadContentWithSymbols(`
defmodule Greeter do
  def hello(name) do
    "Hello, #{name}"
  end
end
`, "test.ex");

    const result = await engine.execute('(list_symbols)');
    expect(result.success).toBe(true);
    expect(result.handle).toBeDefined();
    const expanded = engine.expand(result.handle!);
    expect(expanded.success).toBe(true);
    expect(JSON.stringify(expanded.data)).toContain("Greeter");
  });
});

describe("REPL command patterns", () => {
  it("should handle typical grep -> count workflow", async () => {
    const engine = new HandleSession();
    engine.loadContent(`
[2024-01-15 10:30:00] FATAL: Connection timeout
[2024-01-15 10:30:01] INFO: Retrying...
[2024-01-15 10:30:02] FATAL: Connection refused
[2024-01-15 10:30:03] INFO: Fallback successful
[2024-01-15 10:30:04] FATAL: Data validation failed
    `.trim());

    // Step 1: Find all fatal errors
    const grep = await engine.execute('(grep "FATAL")');
    expect(grep.success).toBe(true);
    const expanded = engine.expand(grep.handle!);
    expect(expanded.success).toBe(true);
    expect(expanded.data?.length).toBe(3);

    // Step 2: Count
    const count = await engine.execute('(count RESULTS)');
    expect(count.success).toBe(true);
    expect(count.value).toBe(3);
  });

  it("should handle grep -> sum workflow for numeric data", async () => {
    const engine = new HandleSession();
    // Use $ prefix so sum can identify currency values
    engine.loadContent(`
Sales: $100,000
Sales: $150,000
Sales: $125,000
Sales: $175,000
    `.trim());

    // Find sales lines
    const grep = await engine.execute('(grep "Sales")');
    expect(grep.success).toBe(true);
    const expanded = engine.expand(grep.handle!);
    expect(expanded.success).toBe(true);
    expect(expanded.data?.length).toBe(4);

    // Sum them - sum extracts $ amounts from line content
    const sum = await engine.execute('(sum RESULTS)');
    expect(sum.success).toBe(true);
    expect(sum.value).toBe(550000);
  });
});
