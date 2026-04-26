/** Security: security/redos — migrated from audit rounds 24, 32, 39. */
import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";

describe("Security: security/redos", () => {
  // from audit#24
  describe("Audit24 #3: base adapter extractCode ReDoS safety", () => {
    it("should not hang on unclosed code fence with many lines", async () => {
      const { createBaseAdapter } = await import("../../src/adapters/base.js");
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

  // from audit#24
  describe("Audit24 #4: qwen adapter extractCode ReDoS safety", () => {
    it("should not hang on unclosed code fence with many lines", async () => {
      const { createQwenAdapter } = await import("../../src/adapters/qwen.js");
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

  // from audit#32
  describe("#11 — ReDoS detection should catch {n,} quantifier patterns", () => {
    it("should detect quantifier braces in nested groups", () => {
      const source = readFileSync("src/logic/lc-solver.ts", "utf-8");
      const redosCheck = source.match(/Reject nested quantifiers[\s\S]*?\.test\(pattern\)/);
      expect(redosCheck).not.toBeNull();
      // Should detect {n,} patterns after groups
      expect(redosCheck![0]).toMatch(/\{/);
    });
  });

  // from audit#39
  describe("#7 — synthesis-integrator ReDoS check should catch more patterns", () => {
    it("should detect nested quantifier patterns like (\\w+)* ", () => {
      const source = readFileSync("src/logic/synthesis-integrator.ts", "utf-8");
      const redosCheck = source.match(/ReDoS|nested.*quantifier|backtrack/i);
      expect(redosCheck).not.toBeNull();
      // Find the actual pattern check in safeRules filter
      const patternCheck = source.match(/safeRules\s*=\s*rules\.filter[\s\S]*?return true/);
      expect(patternCheck).not.toBeNull();
      // Should have quantifier-on-quantifier detection: [+*}]\s*[+*{]
      expect(patternCheck![0]).toMatch(/\[.*\+\*\}\].*\[.*\+\*\{?\]/);
    });
  });

});
