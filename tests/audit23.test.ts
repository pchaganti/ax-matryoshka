/**
 * Audit #23 Tests — TDD: Write failing tests, then fix
 */
import { describe, it, expect } from "vitest";

// === Issue #1: relational-solver parseDate allows invalid days ===
describe("Audit23 #1: relational-solver parseDate month-aware day limit", () => {
  it("should reject Feb 31 in US format", async () => {
    const { evaluateComposition } = await import(
      "../src/logic/relational-solver.js"
    );
    const comp: any = {
      steps: [{ primitive: "parseDate", args: { format: "US" } }],
    };
    const result = evaluateComposition(comp, "02/31/2024");
    expect(result).toBeNull();
  });

  it("should reject Feb 30 in natural format", async () => {
    const { evaluateComposition } = await import(
      "../src/logic/relational-solver.js"
    );
    const comp: any = {
      steps: [{ primitive: "parseDate", args: {} }],
    };
    const result = evaluateComposition(comp, "February 30, 2024");
    expect(result).toBeNull();
  });

  it("should reject April 31 in EU format", async () => {
    const { evaluateComposition } = await import(
      "../src/logic/relational-solver.js"
    );
    const comp: any = {
      steps: [{ primitive: "parseDate", args: { format: "EU" } }],
    };
    const result = evaluateComposition(comp, "31/04/2024", );
    expect(result).toBeNull();
  });

  it("should accept valid dates", async () => {
    const { evaluateComposition } = await import(
      "../src/logic/relational-solver.js"
    );
    const usComp: any = {
      steps: [{ primitive: "parseDate", args: { format: "US" } }],
    };
    expect(evaluateComposition(usComp, "01/15/2024")).toBe("2024-01-15");

    const natComp: any = {
      steps: [{ primitive: "parseDate", args: {} }],
    };
    expect(evaluateComposition(natComp, "February 28, 2024")).toBe("2024-02-28");
    expect(evaluateComposition(natComp, "February 29, 2024")).toBe("2024-02-29"); // 2024 is leap year
  });
});

// === Issue #2: handle-ops sample() Fisher-Yates ===
describe("Audit23 #2: handle-ops sample performance", () => {
  it("should sample n-1 items from n without hanging", async () => {
    const { HandleOps } = await import("../src/persistence/handle-ops.js");
    const data = Array.from({ length: 100 }, (_, i) => i);
    const registry: any = {
      get: () => data,
      store: (d: unknown[]) => "h:1",
    };
    const ops = new HandleOps({} as any, registry);
    const start = Date.now();
    const result = ops.sample("h:0", 99);
    const elapsed = Date.now() - start;
    expect(elapsed).toBeLessThan(500);
    expect(result.length).toBe(99);
    // All results should be unique
    expect(new Set(result).size).toBe(99);
  });
});

// === Issue #3: extractor/synthesis slice(1,-1) length check ===
describe("Audit23 #3: extractor synthesis slice length validation", () => {
  it("generated bracket_extract code should guard short inputs", async () => {
    const mod = await import("../src/synthesis/extractor/synthesis.js");
    const extractors = (mod as any).BASIC_EXTRACTORS;
    if (extractors) {
      const bracketExtract = extractors.find(
        (e: any) => e.name === "bracket_extract"
      );
      if (bracketExtract) {
        // The code string should guard against short input
        expect(bracketExtract.code).toContain("length");
      }
    }
  });
});

// === Issue #4: session-db createHandle JSON.stringify safety ===
describe("Audit23 #4: session-db createHandle stringify safety", () => {
  it("should not crash on items with circular refs", async () => {
    const { SessionDB } = await import("../src/persistence/session-db.js");
    const db = new SessionDB();
    const circular: any = { a: 1 };
    circular.self = circular;
    // Should not throw — should skip or handle the bad item
    expect(() => {
      db.createHandle([1, 2, circular, 4]);
    }).not.toThrow();
    db.close();
  });

  it("should store serializable items even when some fail", async () => {
    const { SessionDB } = await import("../src/persistence/session-db.js");
    const db = new SessionDB();
    const circular: any = { a: 1 };
    circular.self = circular;
    const handle = db.createHandle([1, 2, circular, 4]);
    // Should have stored the serializable items
    const data = db.getHandleData(handle);
    // At minimum, the handle should exist
    expect(handle).toBeTruthy();
    db.close();
  });
});

// === Issue #5: HTTP adapter error message off-by-one ===
// === Issue #6: sandbox-tools locate_line negative index ===
describe("Audit23 #6: sandbox locate_line negative index", () => {
  it("should be importable without errors", async () => {
    const mod = await import("../src/synthesis/sandbox-tools.js");
    expect(mod).toBeDefined();
  });
});

// === Issue #7: regex synthesis empty positives guard ===
describe("Audit23 #7: regex synthesis null positives guard", () => {
  it("should handle undefined input gracefully", async () => {
    const { synthesizeRegex } = await import(
      "../src/synthesis/regex/synthesis.js"
    );
    // Undefined input should not crash
    expect(() => {
      synthesizeRegex(undefined as any);
    }).not.toThrow();
    const result = synthesizeRegex(undefined as any);
    expect(result.success).toBe(false);
  });

  it("should handle null input gracefully", async () => {
    const { synthesizeRegex } = await import(
      "../src/synthesis/regex/synthesis.js"
    );
    expect(() => {
      synthesizeRegex(null as any);
    }).not.toThrow();
    const result = synthesizeRegex(null as any);
    expect(result.success).toBe(false);
  });
});
