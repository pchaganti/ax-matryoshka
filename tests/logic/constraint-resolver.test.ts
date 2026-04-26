/**
 * Tests for the Constraint Resolver
 */

import { describe, it, expect } from "vitest";
import { resolveConstraints, hasConstraints, extractConstraints } from "../../src/logic/constraint-resolver.js";
import { parse } from "../../src/logic/lc-parser.js";

describe("Constraint Resolver", () => {
  describe("resolveConstraints", () => {
    it("should pass through unconstrained terms", () => {
      const parsed = parse('(grep "test")');
      expect(parsed.success).toBe(true);
      if (!parsed.term) return;

      const resolved = resolveConstraints(parsed.term);
      expect(resolved.term.tag).toBe("grep");
      expect(resolved.transformations).toHaveLength(0);
    });

    it("should resolve [Σ⚡μ] constraint", () => {
      const parsed = parse('[Σ⚡μ] ⊗ (grep "test")');
      expect(parsed.success).toBe(true);
      if (!parsed.term) return;

      const resolved = resolveConstraints(parsed.term);
      expect(resolved.transformations).toContain("Applied [Σ⚡μ]");
      expect(resolved.simplified).toBe(true);
      // The resolved term should be the inner grep
      expect(resolved.term.tag).toBe("grep");
    });

    it("should resolve [∞/0] constraint", () => {
      const parsed = parse('[∞/0] ⊗ (match (input) "\\\\d+" 0)');
      expect(parsed.success).toBe(true);
      if (!parsed.term) return;

      const resolved = resolveConstraints(parsed.term);
      expect(resolved.transformations).toContain("Applied [∞/0]");
      expect(resolved.nullChecksInjected).toBe(true);
    });
  });

  describe("hasConstraints", () => {
    it("should return false for unconstrained terms", () => {
      const parsed = parse('(grep "test")');
      expect(parsed.success).toBe(true);
      if (!parsed.term) return;

      expect(hasConstraints(parsed.term)).toBe(false);
    });

    it("should return true for constrained terms", () => {
      const parsed = parse('[Σ⚡μ] ⊗ (grep "test")');
      expect(parsed.success).toBe(true);
      if (!parsed.term) return;

      expect(hasConstraints(parsed.term)).toBe(true);
    });
  });

  describe("extractConstraints", () => {
    it("should extract all constraints from term", () => {
      const parsed = parse('[Σ⚡μ] ⊗ (grep "test")');
      expect(parsed.success).toBe(true);
      if (!parsed.term) return;

      const constraints = extractConstraints(parsed.term);
      expect(constraints).toContain("Σ⚡μ");
    });

    it("should return empty array for unconstrained terms", () => {
      const parsed = parse('(grep "test")');
      expect(parsed.success).toBe(true);
      if (!parsed.term) return;

      const constraints = extractConstraints(parsed.term);
      expect(constraints).toHaveLength(0);
    });
  });

  describe("missing term type coverage in recursion", () => {
    it("should recurse into add term children for hasConstraints", () => {
      const term = {
        tag: "add" as const,
        left: {
          tag: "constrained" as const,
          constraint: "Σ⚡μ" as const,
          term: { tag: "lit" as const, value: 1 },
        },
        right: { tag: "lit" as const, value: 2 },
      };
      expect(hasConstraints(term as any)).toBe(true);
    });

    it("should recurse into extract term for hasConstraints", () => {
      const term = {
        tag: "extract" as const,
        str: {
          tag: "constrained" as const,
          constraint: "∞/0" as const,
          term: { tag: "input" as const },
        },
        pattern: "\\d+",
        group: 0,
      };
      expect(hasConstraints(term as any)).toBe(true);
    });

    it("should recurse into reduce term for extractConstraints", () => {
      const term = {
        tag: "reduce" as const,
        collection: {
          tag: "constrained" as const,
          constraint: "ε⚡φ" as const,
          term: { tag: "lit" as const, value: [] },
        },
        init: { tag: "lit" as const, value: 0 },
        fn: {
          tag: "lambda" as const,
          param: "acc",
          body: { tag: "var" as const, name: "acc" },
        },
      };
      const constraints = extractConstraints(term as any);
      expect(constraints).toContain("ε⚡φ");
    });

    it("should recurse into filter term for extractConstraints", () => {
      const term = {
        tag: "filter" as const,
        collection: {
          tag: "constrained" as const,
          constraint: "∞/0" as const,
          term: { tag: "lit" as const, value: [] },
        },
        predicate: {
          tag: "lambda" as const,
          param: "x",
          body: { tag: "lit" as const, value: true },
        },
      };
      const constraints = extractConstraints(term as any);
      expect(constraints).toContain("∞/0");
    });

    it("should recurse into map term for extractConstraints", () => {
      const term = {
        tag: "map" as const,
        collection: { tag: "lit" as const, value: [] },
        transform: {
          tag: "constrained" as const,
          constraint: "Σ⚡μ" as const,
          term: {
            tag: "lambda" as const,
            param: "x",
            body: { tag: "var" as const, name: "x" },
          },
        },
      };
      const constraints = extractConstraints(term as any);
      expect(constraints).toContain("Σ⚡μ");
    });

    it("should recurse into add for resolveConstraints", () => {
      const term = {
        tag: "add" as const,
        left: {
          tag: "constrained" as const,
          constraint: "Σ⚡μ" as const,
          term: { tag: "lit" as const, value: 1 },
        },
        right: { tag: "lit" as const, value: 2 },
      };
      const result = resolveConstraints(term as any);
      expect(result.transformations).toContain("Applied [Σ⚡μ]");
    });
  });
});

// =====================================================================
// Source-pattern checks (from audits)
// =====================================================================
describe("Source-pattern checks (from audits)", () => {
  // from tests/audit33.test.ts #3 — constraint-resolver should recurse into all term types
  describe("#3 — constraint-resolver should recurse into all term types", () => {
      it("should recurse into 'sum' collection", async () => {
        const { hasConstraints } = await import("../../src/logic/constraint-resolver.js");
        const term = {
          tag: "sum" as const,
          collection: {
            tag: "constrained" as const,
            constraint: "∞/0" as const,
            term: { tag: "grep" as const, pattern: "test" },
          },
        };
        expect(hasConstraints(term as any)).toBe(true);
      });

      it("should recurse into 'count' collection", async () => {
        const { hasConstraints } = await import("../../src/logic/constraint-resolver.js");
        const term = {
          tag: "count" as const,
          collection: {
            tag: "constrained" as const,
            constraint: "∞/0" as const,
            term: { tag: "grep" as const, pattern: "test" },
          },
        };
        expect(hasConstraints(term as any)).toBe(true);
      });

      it("should recurse into 'coerce' term", async () => {
        const { hasConstraints } = await import("../../src/logic/constraint-resolver.js");
        const term = {
          tag: "coerce" as const,
          term: {
            tag: "constrained" as const,
            constraint: "Σ⚡μ" as const,
            term: { tag: "lit" as const, value: "42" },
          },
          targetType: "number" as const,
        };
        expect(hasConstraints(term as any)).toBe(true);
      });

      it("should recurse into 'predicate' str", async () => {
        const { hasConstraints } = await import("../../src/logic/constraint-resolver.js");
        const term = {
          tag: "predicate" as const,
          str: {
            tag: "constrained" as const,
            constraint: "∞/0" as const,
            term: { tag: "input" as const },
          },
        };
        expect(hasConstraints(term as any)).toBe(true);
      });

      it("resolve should handle 'sum' correctly", async () => {
        const { resolveConstraints } = await import("../../src/logic/constraint-resolver.js");
        const term = {
          tag: "sum" as const,
          collection: {
            tag: "constrained" as const,
            constraint: "∞/0" as const,
            term: { tag: "grep" as const, pattern: "test" },
          },
        };
        const result = resolveConstraints(term as any);
        // The constraint should have been resolved (removed)
        expect(result.transformations.length).toBeGreaterThan(0);
      });
    });

});
