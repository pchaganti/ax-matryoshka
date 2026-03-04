/**
 * Audit #32 — TDD tests for critical and high severity issues
 *
 * Round 1: Security (directory traversal, CORS, new Function)
 * Round 2: Sandbox (async timeout, declaration timeout, verifier)
 * Round 3: Core logic (parseAll, engine cache, auto-termination, FINAL_VAR)
 * Round 4: Data processing (ReDoS, reduce, currency, history, dates, regex, O(n^2))
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";

describe("Audit #32", () => {
  // =============================================================
  // ROUND 1: Security-critical issues
  // =============================================================

  describe("Round 1: Security", () => {
    // Issue: Directory traversal bypass — absolute paths bypass ".." check
    describe("#1 — directory traversal: absolute path rejection", () => {
      it("should reject absolute paths outside cwd", async () => {
        const { LatticeTool } = await import("../src/tool/lattice-tool.js");
        const tool = new LatticeTool();
        const result = await tool.executeAsync({ type: "load", filePath: "/etc/passwd" });
        expect(result.success).toBe(false);
        expect(result.error).toMatch(/path|traversal|outside|not allowed/i);
      });

      it("should still allow relative paths without ..", async () => {
        const { LatticeTool } = await import("../src/tool/lattice-tool.js");
        const tool = new LatticeTool();
        // This file exists - should succeed or fail for content reasons, not path rejection
        const result = await tool.executeAsync({ type: "load", filePath: "package.json" });
        // Should not be rejected as a path traversal
        if (!result.success) {
          expect(result.error).not.toMatch(/traversal|not allowed/i);
        }
      });
    });

    // Issue: CORS wildcard allows any origin
    describe("#2 — CORS should not use wildcard", () => {
      it("should not set Access-Control-Allow-Origin to *", () => {
        const source = readFileSync("src/tool/adapters/http.ts", "utf-8");
        // Find the CORS header setting
        const corsSection = source.match(/cors[\s\S]*?Access-Control-Allow-Origin[^"]*"([^"]*)"/);
        expect(corsSection).not.toBeNull();
        expect(corsSection![1]).not.toBe("*");
      });
    });

    // Issue: new Function() in coordinator.ts without sandboxing
    describe("#3 — coordinator new Function should validate code", () => {
      it("should not use bare new Function for synthesized code", () => {
        const source = readFileSync("src/synthesis/coordinator.ts", "utf-8");
        // Find the synthesizeExtractorResult method
        const method = source.match(/synthesizeExtractorResult[\s\S]*?tryRelationalSynthesis/);
        expect(method).not.toBeNull();
        // Should not have bare new Function("return " + code)
        // Should either use a safe evaluator or validate the code
        const hasBareNewFunction = /new Function\("return "\s*\+\s*code\)/.test(method![0]);
        expect(hasBareNewFunction).toBe(false);
      });

      it("should not use bare new Function in tryRelationalSynthesis", () => {
        const source = readFileSync("src/synthesis/coordinator.ts", "utf-8");
        const method = source.match(/tryRelationalSynthesis[\s\S]*?return null/);
        expect(method).not.toBeNull();
        const hasBareNewFunction = /new Function\("return "\s*\+\s*code\)/.test(method![0]);
        expect(hasBareNewFunction).toBe(false);
      });
    });

    // Issue: new Function() in synthesis-integrator.ts
    describe("#4 — synthesis-integrator new Function should validate code", () => {
      it("should not use bare new Function in synthesizeViaRelational", () => {
        const source = readFileSync("src/logic/synthesis-integrator.ts", "utf-8");
        const method = source.match(/synthesizeViaRelational[\s\S]*?return \{\s*success: false/);
        expect(method).not.toBeNull();
        // Should validate synthesized code before execution
        const hasBareNewFunction = /new Function\("input",\s*`return/.test(method![0]);
        expect(hasBareNewFunction).toBe(false);
      });
    });
  });

  // =============================================================
  // ROUND 2: Sandbox timeout issues
  // =============================================================

  describe("Round 2: Sandbox", () => {
    // Issue: Declaration scripts run without timeout
    describe("#5 — declaration scripts should have timeout", () => {
      it("should pass timeout to declScript.runInContext", () => {
        const source = readFileSync("src/sandbox.ts", "utf-8");
        const declSection = source.match(/declScript\.runInContext\(vmContext[^)]*\)/);
        expect(declSection).not.toBeNull();
        // Should have timeout option
        expect(declSection![0]).toMatch(/timeout/);
      });
    });

    // Issue: verifier.ts new Function deny-list is fragile
    describe("#6 — verifier should use allowlist, not deny-list for invariants", () => {
      it("should block string concatenation bypass of keyword deny-list", () => {
        // 'con' + 'structor' bypasses \bconstructor\b check
        // The isSafeInvariant function should reject this
        const source = readFileSync("src/constraints/verifier.ts", "utf-8");
        const safeCheck = source.match(/isSafeInvariant[\s\S]*?return true;\s*\}/);
        expect(safeCheck).not.toBeNull();
        // Should reject string concatenation with + (quotes + string building)
        // Either by blocking quotes entirely or by a different mechanism
        expect(safeCheck![0]).toMatch(/['"].*reject|disallow.*['"]|template|quote/i);
      });
    });
  });

  // =============================================================
  // ROUND 3: Core logic issues
  // =============================================================

  describe("Round 3: Core Logic", () => {
    // Issue: parseAll splits on newlines, breaking multi-line S-expressions
    describe("#7 — parseAll should handle multi-line S-expressions", () => {
      it("should parse a multi-line S-expression as one term", async () => {
        const { parseAll } = await import("../src/logic/lc-parser.js");
        const input = `(filter RESULTS
  (lambda x (match x "foo" 0)))`;
        const results = parseAll(input);
        // Should produce exactly one parse result, not two broken ones
        const successResults = results.filter(r => r.success);
        expect(successResults.length).toBe(1);
        expect(successResults[0].term?.tag).toBe("filter");
      });
    });

    // Issue: Engine cache returns wrong file when sessionId differs from filePath
    describe("#8 — engine cache should validate filePath matches", () => {
      it("should include filePath in cache validation logic", () => {
        const source = readFileSync("src/mcp-server.ts", "utf-8");
        const getEngine = source.match(/getEngine[\s\S]*?return engine;\s*\}\s*\n/);
        expect(getEngine).not.toBeNull();
        // When sessionId is used as key, must also check that filePath matches
        // Either by storing filePath alongside or by including it in the key
        expect(getEngine![0]).toMatch(/filePath/g);
        // Should have more than just the parameter reference — needs comparison
        const filePathRefs = getEngine![0].match(/filePath/g);
        expect(filePathRefs!.length).toBeGreaterThan(3);
      });
    });

    // Issue: Auto-termination on intermediate log output
    describe("#9 — auto-termination should not trigger on intermediate results", () => {
      it("should require explicit done signal before auto-terminating", () => {
        const source = readFileSync("src/rlm.ts", "utf-8");
        // Find the auto-termination logic
        const autoTerm = source.match(/computedMatch[\s\S]*?Auto-terminating/);
        expect(autoTerm).not.toBeNull();
        // Should require the LLM to have signaled completion, not just matched a keyword
        // Check for an additional condition beyond just the regex match
        expect(autoTerm![0]).toMatch(/turn\s*>\s*[12]|turn\s*>=\s*[23]|codeExecuted|doneCount|hasExplored/i);
      });
    });

    // Issue: FINAL_VAR returns empty sandbox memory instead of solver bindings
    describe("#10 — FINAL_VAR should check solver bindings", () => {
      it("should look up variable in solver bindings when FINAL_VAR is used", () => {
        const source = readFileSync("src/rlm.ts", "utf-8");
        // Find the FINAL_VAR handling section
        const finalVar = source.match(/finalAnswer\.type === "var"[\s\S]*?resultToReturn\s*=.*$/m);
        expect(finalVar).not.toBeNull();
        // Should reference solverBindings or solverResult, not just sandbox.getMemory()
        expect(finalVar![0]).toMatch(/solverBinding|solverResult|solver/i);
      });
    });
  });

  // =============================================================
  // ROUND 4: Data processing issues
  // =============================================================

  describe("Round 4: Data Processing", () => {
    // Issue: Incomplete ReDoS detection regex
    describe("#11 — ReDoS detection should catch {n,} quantifier patterns", () => {
      it("should detect quantifier braces in nested groups", () => {
        const source = readFileSync("src/logic/lc-solver.ts", "utf-8");
        const redosCheck = source.match(/Reject nested quantifiers[\s\S]*?\.test\(pattern\)/);
        expect(redosCheck).not.toBeNull();
        // Should detect {n,} patterns after groups
        expect(redosCheck![0]).toMatch(/\{/);
      });
    });

    // Issue: Currency parser doesn't detect trailing-minus accounting format
    describe("#12 — currency parser should handle trailing minus", () => {
      it("should detect trailing minus as negative", () => {
        const source = readFileSync("src/logic/lc-solver.ts", "utf-8");
        // Check the full isNegative block includes endsWith("-")
        const fullBlock = source.match(/const isNegative =[\s\S]*?;/);
        expect(fullBlock).not.toBeNull();
        expect(fullBlock![0]).toMatch(/endsWith\("-"\)/);
      });
    });

    // Issue: Conflicting example detection uses reference equality
    describe("#13 — synthesis-integrator conflict check should use deep comparison", () => {
      it("should use JSON.stringify or deep equality for conflict detection", () => {
        const source = readFileSync("src/logic/synthesis-integrator.ts", "utf-8");
        const conflictCheck = source.match(/conflicting examples[\s\S]*?inputMap\.set/);
        expect(conflictCheck).not.toBeNull();
        // Should use JSON.stringify or some deep equality, not !==
        expect(conflictCheck![0]).toMatch(/JSON\.stringify|deepEqual/);
      });
    });

    // Issue: Date parser hardcodes DD/MM/YYYY for slash-separated dates
    describe("#14 — date parser should try both DD/MM and MM/DD formats", () => {
      it("should attempt both date format interpretations", () => {
        const source = readFileSync("src/logic/synthesis-integrator.ts", "utf-8");
        // Find the slash-date parsing section with full year
        const dateSection = source.match(/Full year format[\s\S]*?fn = \(s: string\)/);
        expect(dateSection).not.toBeNull();
        // Should mention MM/DD or try both interpretations
        expect(dateSection![0]).toMatch(/MM\/DD|month.*day|day.*month|tryBoth|bothFormats/i);
      });
    });

    // Issue: O(n^2) array copies in relational-solver filter/map via spread-in-reduce
    describe("#15 — relational-solver filter/map should not use spread in reduce", () => {
      it("should use push instead of spread for filter", () => {
        const source = readFileSync("src/logic/relational-solver.ts", "utf-8");
        const filterDerived = source.match(/case "filter":[\s\S]*?case "map"/);
        expect(filterDerived).not.toBeNull();
        // Should NOT use [...acc, item] pattern
        expect(filterDerived![0]).not.toMatch(/\[\.\.\.acc,?\s*item\]/);
      });

      it("should use push instead of spread for map", () => {
        const source = readFileSync("src/logic/relational-solver.ts", "utf-8");
        const mapDerived = source.match(/case "map":[\s\S]*?case "sum"/);
        expect(mapDerived).not.toBeNull();
        // Should NOT use [...acc, transform(item)] pattern
        expect(mapDerived![0]).not.toMatch(/\[\.\.\.acc/);
      });
    });

    // Issue: History pruning can corrupt conversation at odd boundaries
    describe("#16 — history pruning should validate entry roles", () => {
      it("should ensure pruning maintains alternating roles", () => {
        const source = readFileSync("src/rlm.ts", "utf-8");
        const pruneSection = source.match(/pruneHistory[\s\S]*?\}\s*;/);
        expect(pruneSection).not.toBeNull();
        // Should check role before splicing, or splice in validated pairs
        expect(pruneSection![0]).toMatch(/role|assistant|pair/i);
      });
    });
  });
});
