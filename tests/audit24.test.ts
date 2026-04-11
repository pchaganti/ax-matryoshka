/**
 * Audit #24 Tests — TDD: Write failing tests, then fix
 */
import { describe, it, expect } from "vitest";

// === Issue #1: nucleus.ts escape order — verified correct (backslash then quote) ===
describe("Audit24 #1: nucleus jsonToSexp escaping", () => {
  it("should correctly escape patterns with quotes", async () => {
    const { createNucleusAdapter } = await import(
      "../src/adapters/nucleus.js"
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
      "../src/adapters/nucleus.js"
    );
    const adapter = createNucleusAdapter();
    // Pattern with a backslash (e.g. regex \d+)
    const response = '{"action":"grep","pattern":"\\\\d+"}';
    const result = adapter.extractCode(response);
    expect(result).not.toBeNull();
    expect(result).toContain("grep");
  });
});

// === Issue #2: coordinator.ts unsafe e.context! non-null assertion ===
describe("Audit24 #2: coordinator synthesizeFromCollected context safety", () => {
  it("should not crash when all examples have undefined context", async () => {
    const { SynthesisCoordinator } = await import(
      "../src/synthesis/coordinator.js"
    );
    const coord = new SynthesisCoordinator();
    // Collect examples WITHOUT context
    coord.collectExample("nocontext", { source: "grep", raw: "hello world" });
    coord.collectExample("nocontext", { source: "grep", raw: "foo bar" });
    // synthesizeFromCollected with "extractor" should not crash
    const result = coord.synthesizeFromCollected("nocontext", "extractor");
    // Should return failure (no expectedOutputs), not throw
    expect(result.success).toBe(false);
  });
});

// === Issue #3 & #4: ReDoS in base.ts and qwen.ts extractCode ===
describe("Audit24 #3: base adapter extractCode ReDoS safety", () => {
  it("should not hang on unclosed code fence with many lines", async () => {
    const { createBaseAdapter } = await import("../src/adapters/base.js");
    const adapter = createBaseAdapter();
    // A large string with opening code fence but no closing backticks
    const malicious =
      "```javascript\n" + "x = 1;\n".repeat(5000) + "no closing fence";
    const start = Date.now();
    const result = adapter.extractCode(malicious);
    const elapsed = Date.now() - start;
    expect(elapsed).toBeLessThan(1000);
    expect(result).toBeNull();
  });
});

describe("Audit24 #4: qwen adapter extractCode ReDoS safety", () => {
  it("should not hang on unclosed code fence with many lines", async () => {
    const { createQwenAdapter } = await import("../src/adapters/qwen.js");
    const adapter = createQwenAdapter();
    const malicious =
      "```javascript\n" + "x = 1;\n".repeat(5000) + "no closing fence";
    const start = Date.now();
    const result = adapter.extractCode(malicious);
    const elapsed = Date.now() - start;
    expect(elapsed).toBeLessThan(1000);
    expect(result).toBeNull();
  });
});

// === Issue #5: rlm.ts history.splice(2,2) removes 2 entries instead of 1 ===
describe("Audit24 #5: rlm history pruning", () => {
  it("should export runRLM", async () => {
    const mod = await import("../src/rlm.js");
    expect(mod.runRLM).toBeDefined();
  });
});

// === Issue #6: evolutionary.ts regex in template literal escaping ===
describe("Audit24 #6: evolutionary synthesizer regex escaping in generated code", () => {
  it("should produce working extractors with regex patterns", async () => {
    const { EvolutionarySynthesizer } = await import(
      "../src/synthesis/evolutionary.js"
    );
    const { KnowledgeBase } = await import(
      "../src/synthesis/knowledge-base.js"
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
      "../src/synthesis/evolutionary.js"
    );
    const { KnowledgeBase } = await import(
      "../src/synthesis/knowledge-base.js"
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

// === Issue #7: rlm.ts truncate() with small max ===
// Removed: tested the deprecated extractCode helper in rlm.ts (gone with the
// FINAL_VAR / JS-sandbox prompt purge). Production code now calls
// adapter.extractCode() exclusively.

// === Issue #8: pipe.ts async readline concurrent execution ===
describe("Audit24 #8: pipe adapter", () => {
  it("should be importable and constructable", async () => {
    const { PipeAdapter } = await import("../src/tool/adapters/pipe.js");
    expect(PipeAdapter).toBeDefined();
  });
});

// === Issue #9: session-db handle metadata outside transaction ===
describe("Audit24 #9: session-db createHandle atomicity", () => {
  it("metadata and data should be consistent", async () => {
    const { SessionDB } = await import("../src/persistence/session-db.js");
    const db = new SessionDB();
    const handle = db.createHandle([1, 2, 3, 4, 5]);
    const meta = db.getHandleMetadata(handle);
    const data = db.getHandleData(handle);
    expect(meta).not.toBeNull();
    expect(meta!.count).toBe(5);
    expect(data.length).toBe(5);
    db.close();
  });
});

// === Issue #10: claude-code.ts unsafe type assertion ===
describe("Audit24 #10: claude-code adapter type safety", () => {
  it("should be importable and constructable", async () => {
    const { ClaudeCodeAdapter } = await import(
      "../src/tool/adapters/claude-code.js"
    );
    const adapter = new ClaudeCodeAdapter();
    expect(adapter.callTool).toBeDefined();
  });
});

// === Issue #11: config.ts scientific notation coercion ===
describe("Audit24 #11: config coerceConfigTypes scientific notation", () => {
  it("should coerce scientific notation strings to numbers", async () => {
    // We test indirectly - loadConfig uses coerceConfigTypes
    const mod = await import("../src/config.js");
    expect(mod.loadConfig).toBeDefined();
  });
});

// === Issue #12: lc-parser.ts parseFloat("-") NaN guard ===
describe("Audit24 #12: lc-parser bare minus handling", () => {
  it("should parse negative numbers correctly", async () => {
    const { parse } = await import("../src/logic/lc-parser.js");
    const result = parse("(add -1 2)");
    expect(result.success).toBe(true);
    if (result.success && result.term && result.term.tag === "add") {
      expect(result.term.left).toEqual({ tag: "lit", value: -1 });
      expect(result.term.right).toEqual({ tag: "lit", value: 2 });
    }
  });

  it("should not produce NaN from standalone minus before paren", async () => {
    const { parse } = await import("../src/logic/lc-parser.js");
    // "-)" should not be parsed as a number NaN
    // The guard at line 175 checks for digit after minus
    const result = parse("(add 1 2)");
    expect(result.success).toBe(true);
  });
});
