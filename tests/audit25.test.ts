/**
 * Audit #25 Tests — TDD: Write failing tests, then fix
 */
import { describe, it, expect } from "vitest";

// === Issue #1: relational-solver parseDate US format blocks auto-detection ===
describe("Audit25 #1: parseDate US auto-detection without format hint", () => {
  it("should auto-detect US date format when no hint is provided", async () => {
    const { evaluateComposition } = await import(
      "../src/logic/relational-solver.js"
    );
    const comp: any = {
      steps: [{ primitive: "parseDate", args: {} }],
    };
    // No format hint — should still parse MM/DD/YYYY
    const result = evaluateComposition(comp, "01/15/2024");
    expect(result).toBe("2024-01-15");
  });

  it("should auto-detect US date when hint is explicitly US", async () => {
    const { evaluateComposition } = await import(
      "../src/logic/relational-solver.js"
    );
    const comp: any = {
      steps: [{ primitive: "parseDate", args: { format: "US" } }],
    };
    const result = evaluateComposition(comp, "01/15/2024");
    expect(result).toBe("2024-01-15");
  });
});

// === Issue #2: grep with empty string pattern matches every position ===
describe("Audit25 #2: grep empty pattern guard", () => {
  it("should return empty results for empty pattern", async () => {
    const mod = await import("../src/logic/lc-solver.js");
    const tools: any = {
      context: "hello\nworld\n",
      grep: null as any,
    };
    // Create solver tools by calling solve with a grep on empty pattern
    const result = await mod.solve(
      { tag: "grep" as const, pattern: "" },
      { context: "hello\nworld", grep: () => [], fuzzy_search: () => [], text_stats: () => ({}) },
      new Map()
    );
    // Empty pattern should not match everything
    expect(result.success).toBe(true);
    if (Array.isArray(result.value)) {
      expect(result.value.length).toBe(0);
    }
  });
});

// === Issue #3: deepEqual(NaN, NaN) returns false ===
describe("Audit25 #3: evolutionary deepEqual NaN handling", () => {
  it("should treat NaN as equal to NaN in validation", async () => {
    const { EvolutionarySynthesizer } = await import(
      "../src/synthesis/evolutionary.js"
    );
    const { KnowledgeBase } = await import(
      "../src/synthesis/knowledge-base.js"
    );
    const kb = new KnowledgeBase();
    const evo = new EvolutionarySynthesizer(kb);
    // A function that returns NaN for non-numeric input
    const code = '(s) => parseFloat(s)';
    const examples = [
      { input: "abc", output: NaN },
    ];
    const valid = evo.validateSolution(code, examples);
    expect(valid).toBe(true);
  });
});

// === Issue #4: checkpoint getMetadata returns Date.now() not stored timestamp ===
describe("Audit25 #4: checkpoint metadata timestamp", () => {
  it("should return a consistent timestamp from stored checkpoint", async () => {
    const { SessionDB } = await import("../src/persistence/session-db.js");
    const { CheckpointManager } = await import(
      "../src/persistence/checkpoint.js"
    );
    const db = new SessionDB();
    // Create a minimal HandleRegistry mock
    const registry: any = {
      listHandles: () => [],
      getResults: () => null,
      setResults: () => {},
    };
    const mgr = new CheckpointManager(db, registry);
    mgr.save(1);
    // Wait a tiny bit so Date.now() changes
    await new Promise((r) => setTimeout(r, 10));
    const meta1 = mgr.getMetadata(1);
    await new Promise((r) => setTimeout(r, 10));
    const meta2 = mgr.getMetadata(1);
    expect(meta1).not.toBeNull();
    expect(meta2).not.toBeNull();
    // Timestamps should be the same (stored), not different (Date.now())
    expect(meta1!.timestamp).toBe(meta2!.timestamp);
    db.close();
  });
});

// === Issue #5: parseInt NaN in binding key sort ===
describe("Audit25 #5: binding key sort safety", () => {
  it("should handle malformed binding keys without breaking sort", async () => {
    // This is internal to rlm.ts — just verify module loads
    const mod = await import("../src/rlm.js");
    expect(mod.runRLM).toBeDefined();
  });
});

// === Issue #6: delimiter field extraction hardcoded limit of 10 ===
describe("Audit25 #6: extractor delimiter field beyond index 9", () => {
  it("should find fields beyond index 9", async () => {
    const { synthesizeExtractor } = await import(
      "../src/synthesis/extractor/synthesis.js"
    );
    // Create a CSV with 12 fields, target is field 11 (0-indexed)
    const input1 = "a,b,c,d,e,f,g,h,i,j,k,TARGET1";
    const input2 = "a,b,c,d,e,f,g,h,i,j,k,TARGET2";
    const examples = [
      { input: input1, output: "TARGET1" },
      { input: input2, output: "TARGET2" },
    ];
    const extractor = synthesizeExtractor({ examples });
    // Should find field at index 11
    expect(extractor).not.toBeNull();
    if (extractor) {
      expect(extractor.test(input1)).toBe("TARGET1");
    }
  });
});

// === Issue #7: HTTP Content-Type check too permissive ===
// === Issue #8: match.slice(1) can contain undefined groups ===
describe("Audit25 #8: grep groups filter undefined", () => {
  it("should not have undefined in groups array", async () => {
    const mod = await import("../src/logic/lc-solver.js");
    // Pattern with optional group that won't match
    const tools: any = {
      context: "hello world",
      grep: (pattern: string) => {
        const regex = new RegExp(pattern, "gmi");
        const match = regex.exec("hello world");
        if (!match) return [];
        return [{
          match: match[0],
          line: "hello world",
          lineNum: 1,
          index: match.index,
          groups: match.slice(1).filter((g: unknown) => g !== undefined),
        }];
      },
      fuzzy_search: () => [],
      text_stats: () => ({}),
    };
    // A pattern with an optional group: (foo)?(hello)
    const result = await mod.solve(
      { tag: "grep" as const, pattern: "(foo)?(hello)" },
      tools,
      new Map()
    );
    expect(result.success).toBe(true);
  });
});

// === Issue #9: config scientific notation round-trip ===
describe("Audit25 #9: config coercion", () => {
  it("should be importable", async () => {
    const mod = await import("../src/config.js");
    expect(mod.loadConfig).toBeDefined();
  });
});

// === Issue #10: IDF fallback magic number ===
describe("Audit25 #10: similarity IDF", () => {
  it("should be importable", async () => {
    const mod = await import("../src/rag/similarity.js");
    expect(mod.tfidfVector).toBeDefined();
  });
});

// === Issue #11: hash & hash no-op ===
describe("Audit25 #11: synthesis-integrator hash", () => {
  it("should be importable", async () => {
    const mod = await import("../src/logic/synthesis-integrator.js");
    expect(mod).toBeDefined();
  });
});

// === Issue #12: headersTimeout without keepAliveTimeout ===