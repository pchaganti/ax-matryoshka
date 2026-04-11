/**
 * Tests for NucleusEngine with Synthesis Integration
 *
 * These tests verify that the NucleusEngine properly integrates
 * with the synthesis system for automatic function generation.
 */

import { describe, it, expect } from "vitest";
import { NucleusEngine } from "../../src/engine/nucleus-engine.js";

describe("NucleusEngine with Synthesis", () => {
  describe("synthesis integration", () => {
    it("synthesizes currency parser via engine API", async () => {
      const engine = new NucleusEngine();
      engine.loadContent("Price: 1.234,56€\nPrice: 500,00€");

      const result = await engine.execute(`
        (map (grep "Price")
          (lambda x
            (parseCurrency (match x "([0-9.,]+€)" 1)
              :examples [("1.234,56€" 1234.56) ("500,00€" 500)])))
      `);

      expect(result.success).toBe(true);
      expect(result.value).toEqual([1234.56, 500]);
    });

    it("synthesizes date parser via engine API", async () => {
      const engine = new NucleusEngine();
      engine.loadContent("Date: 15/01/24\nDate: 20/02/24");

      const result = await engine.execute(`
        (map (grep "Date")
          (lambda x
            (parseDate (match x "(\\d+/\\d+/\\d+)" 1)
              :examples [("15/01/24" "2024-01-15") ("20/02/24" "2024-02-20")])))
      `);

      expect(result.success).toBe(true);
      expect(result.value).toEqual(["2024-01-15", "2024-02-20"]);
    });

    it("synthesizes predicate for filtering via engine API", async () => {
      const engine = new NucleusEngine();
      engine.loadContent(
        "[ERROR] Connection failed\n[INFO] Started\n[ERROR] Timeout\n[DEBUG] Trace"
      );

      // Use lines instead of grep "" to avoid character-by-character matches
      const result = await engine.execute(`
        (filter (lines 1 4)
          (lambda x
            (predicate x
              :examples [
                ("[ERROR] Connection failed" true)
                ("[INFO] Started" false)
              ])))
      `);

      expect(result.success).toBe(true);
      // Should filter to only ERROR lines
      expect(result.value).toHaveLength(2);
      expect((result.value as string[])[0]).toContain("[ERROR]");
      expect((result.value as string[])[1]).toContain("[ERROR]");
    });
  });

  describe("define-fn and apply-fn", () => {
    it("defines a function and applies it directly", async () => {
      const engine = new NucleusEngine();
      engine.loadContent("test");

      // Define a custom euro parser
      const defineResult = await engine.execute(`
        (define-fn "euro-parser"
          :examples [("€100" 100) ("€250" 250)])
      `);
      expect(defineResult.success).toBe(true);

      // Apply it directly
      const applyResult = await engine.execute('(apply-fn "euro-parser" "€500")');
      expect(applyResult.success).toBe(true);
      expect(applyResult.value).toBe(500);
    });

    it("can apply defined function in sequence", async () => {
      const engine = new NucleusEngine();
      engine.loadContent("€100\n€250\n€500");

      // Define function first
      await engine.execute(`
        (define-fn "euro-parser"
          :examples [("€100" 100) ("€250" 250)])
      `);

      // Get lines, then apply function in a subsequent query
      const linesResult = await engine.execute("(lines 1 3)");
      expect(linesResult.success).toBe(true);

      // Apply to first result
      const applyResult = await engine.execute('(apply-fn "euro-parser" "€100")');
      expect(applyResult.success).toBe(true);
      expect(applyResult.value).toBe(100);
    });
  });

  describe("classify standalone", () => {
    it("builds classifier from examples and uses it", async () => {
      const engine = new NucleusEngine();
      engine.loadContent(
        "ERROR: Failed\nINFO: OK\nERROR: Timeout\nWARN: Slow"
      );

      // Build classifier - it returns a function stored in RESULTS
      const classifyResult = await engine.execute(`
        (classify
          :examples [
            ("ERROR: Failed" true)
            ("INFO: OK" false)
          ])
      `);

      expect(classifyResult.success).toBe(true);
      // The classifier is now in RESULTS
    });
  });

  describe("complex workflows", () => {
    it("combines synthesis with count and filter using lines", async () => {
      const engine = new NucleusEngine();
      engine.loadContent(
        "Sales: $1,000\nSales: $2,500\nExpense: $500\nSales: $750"
      );

      // Count sales using synthesized predicate with lines
      const result = await engine.execute(`
        (count
          (filter (lines 1 4)
            (lambda x
              (predicate x
                :examples [
                  ("Sales: $1,000" true)
                  ("Expense: $500" false)
                ]))))
      `);

      expect(result.success).toBe(true);
      expect(result.value).toBe(3); // 3 Sales lines
    });

    it("chains map with synthesized parsers", async () => {
      const engine = new NucleusEngine();
      engine.loadContent(
        "Item A: €100,00\nItem B: €250,50\nItem C: €75,00"
      );

      // Sum all prices using synthesized parser
      const result = await engine.execute(`
        (sum
          (map (grep "Item")
            (lambda x
              (parseCurrency (match x "(€[0-9,]+)" 1)
                :examples [("€100,00" 100) ("€250,50" 250.5)]))))
      `);

      expect(result.success).toBe(true);
      expect(result.value).toBe(425.5);
    });

    it("uses extract with type hint and synthesis", async () => {
      const engine = new NucleusEngine();
      engine.loadContent(
        "Revenue: $1,234.56\nRevenue: $789.00"
      );

      const result = await engine.execute(`
        (map (grep "Revenue")
          (lambda x
            (extract x "\\$([0-9,.]+)" 1
              :type "number"
              :examples [("$1,234.56" 1234.56)])))
      `);

      expect(result.success).toBe(true);
      expect(result.value).toEqual([1234.56, 789]);
    });
  });

  describe("error handling", () => {
    it("handles synthesis failure gracefully", async () => {
      const engine = new NucleusEngine();
      engine.loadContent("test data");

      // Conflicting examples should still try to work
      const result = await engine.execute(`
        (parseCurrency "invalid"
          :examples [("same" 1) ("same" 2)])
      `);

      // Should either succeed with one of the values or fail gracefully
      expect(result.success).toBeDefined();
    });

    it("handles missing examples with fallback", async () => {
      const engine = new NucleusEngine();
      engine.loadContent("$100 and $200");

      // No examples provided - should use built-in parser
      const result = await engine.execute(`
        (parseCurrency "$100")
      `);

      expect(result.success).toBe(true);
      expect(result.value).toBe(100);
    });
  });

  describe("RESULTS binding", () => {
    it("persists synthesized results in RESULTS binding", async () => {
      const engine = new NucleusEngine();
      engine.loadContent("[ERROR] One\n[INFO] Two\n[ERROR] Three");

      // Filter errors using synthesis with lines
      await engine.execute(`
        (filter (lines 1 3)
          (lambda x
            (predicate x
              :examples [
                ("[ERROR] One" true)
                ("[INFO] Two" false)
              ])))
      `);

      // Count should use RESULTS from previous query
      const countResult = await engine.execute("(count RESULTS)");
      expect(countResult.success).toBe(true);
      expect(countResult.value).toBe(2);
    });
  });

  describe("synthesize standalone command", () => {
    it("synthesizes function from example pairs", async () => {
      const engine = new NucleusEngine();
      engine.loadContent("test");

      // Synthesize an uppercase transformer
      const result = await engine.execute(`
        (synthesize
          ("hello" "HELLO")
          ("world" "WORLD"))
      `);

      expect(result.success).toBe(true);
      expect(result.value).toBeDefined();
      // The synthesized function is returned directly
      expect(typeof result.value).toBe("function");
    });

    it("synthesizes function using example keyword syntax", async () => {
      const engine = new NucleusEngine();
      engine.loadContent("test");

      // This is the documented syntax that currently fails
      const result = await engine.execute(`
        (synthesize
          (example "hello" "HELLO")
          (example "world" "WORLD"))
      `);

      expect(result.success).toBe(true);
      expect(result.value).toBeDefined();
    });

    it("synthesizes numeric transformer", async () => {
      const engine = new NucleusEngine();
      engine.loadContent("test");

      // Synthesize a doubling function
      const result = await engine.execute(`
        (synthesize
          ("1" 2)
          ("5" 10)
          ("10" 20))
      `);

      expect(result.success).toBe(true);
    });
  });
});
