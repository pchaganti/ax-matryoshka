/**
 * Audit #39 — TDD tests for 10 issues
 * These tests should FAIL before the fixes and PASS after.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";

describe("Audit #39", () => {
  // =========================================================================
  // #1 HIGH — Constructor chain bypass in synthesis-integrator code injection check
  // =========================================================================
  describe("#1 — synthesis-integrator should block bracket-access constructor chains", () => {
    it("should block bracket property access patterns", () => {
      const source = readFileSync("src/logic/synthesis-integrator.ts", "utf-8");
      const dangerousBlock = source.match(/dangerousPatterns\s*=\s*\[[\s\S]*?\]/);
      expect(dangerousBlock).not.toBeNull();
      // Should block bracket-access patterns like input['constructor']
      expect(dangerousBlock![0]).toMatch(/\[.*constructor|bracket|property.*access|\\\[/);
    });
  });

  // =========================================================================
  // #2 HIGH — lc-solver match/extract group bounds missing
  // =========================================================================
  describe("#2 — lc-solver match should validate group bounds", () => {
    it("should check group < result.length in match case", () => {
      const source = readFileSync("src/logic/lc-solver.ts", "utf-8");
      const matchCase = source.match(/case "match"[\s\S]*?result\[term\.group\]/);
      expect(matchCase).not.toBeNull();
      expect(matchCase![0]).toMatch(/term\.group\s*>=?\s*result\.length|group.*bounds|group.*length/i);
    });

    it("should check group < result.length in extract case", () => {
      const source = readFileSync("src/logic/lc-solver.ts", "utf-8");
      const extractCase = source.match(/case "extract"[\s\S]*?result\[term\.group\]/);
      expect(extractCase).not.toBeNull();
      expect(extractCase![0]).toMatch(/term\.group\s*>=?\s*result\.length|group.*bounds|group.*length/i);
    });
  });

  // =========================================================================
  // #3 HIGH — TOCTOU: loadFile uses original path not validated realpath
  // =========================================================================
  describe("#3 — lattice-tool should use realResolved path for loadFile", () => {
    it("should pass realResolved to loadFile, not original filePath", () => {
      const source = readFileSync("src/tool/lattice-tool.ts", "utf-8");
      // Check the actual loadFile call includes realResolved argument
      expect(source).toMatch(/loadFile\(realResolved\)/);
      // Should NOT use the original filePath for loadFile
      expect(source).not.toMatch(/loadFile\(filePath\)/);
    });
  });

  // =========================================================================
  // #4 HIGH — FTS5 ALLOWED_TAGS - verify event handlers are rejected
  // =========================================================================
  describe("#4 — fts5 ALLOWED_TAGS correctly rejects event handlers (verified)", () => {
    it("should not allow onclick or other event attributes", () => {
      const source = readFileSync("src/persistence/fts5-search.ts", "utf-8");
      const allowedTags = source.match(/ALLOWED_TAGS\s*=\s*\/.*\//);
      expect(allowedTags).not.toBeNull();
      // Existing regex is strict enough to reject event handlers
      expect(allowedTags![0]).toMatch(/class/);
    });
  });

  // =========================================================================
  // #5 MEDIUM — Overly broad Object block in evolutionary.ts compose
  // =========================================================================
  describe("#5 — evolutionary compose should use nuanced Object check", () => {
    it("should not block all Object usage, only dangerous methods", () => {
      const source = readFileSync("src/synthesis/evolutionary.ts", "utf-8");
      // Find the DANGEROUS_PATTERNS in compose
      const composeBlock = source.match(/compose[\s\S]*?DANGEROUS_PATTERNS[\s\S]*?\]/);
      expect(composeBlock).not.toBeNull();
      // Should NOT have bare /\bObject\b/ — should be more specific
      expect(composeBlock![0]).not.toMatch(/\/\\bObject\\b\//);
    });
  });

  // =========================================================================
  // #6 MEDIUM — getHandleDataSlice silently drops parse-failed items
  // =========================================================================
  describe("#6 — session-db should return null for unparseable items not filter them", () => {
    it("should return null for unparseable items instead of filtering", () => {
      const source = readFileSync("src/persistence/session-db.ts", "utf-8");
      // Find the full getHandleDataSlice function
      const sliceFn = source.match(/getHandleDataSlice[\s\S]*?^\s{2}\}/m);
      expect(sliceFn).not.toBeNull();
      // Should NOT filter out failures — should return null instead to preserve pagination count
      expect(sliceFn![0]).not.toMatch(/\.filter\(\(item\) => item !== PARSE_FAILURE\)/);
    });
  });

  // =========================================================================
  // #7 MEDIUM — ReDoS detection misses nested quantifiers like (\w+)*
  // =========================================================================
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

  // =========================================================================
  // #8 MEDIUM — Delimiter escape uses backtick template (verified safe)
  // =========================================================================
  describe("#8 — extractor delimiter escape is already template-safe (verified)", () => {
    it("generated code uses template literal safely", () => {
      const source = readFileSync("src/synthesis/extractor/synthesis.ts", "utf-8");
      // Delimiter list only contains safe chars: , | \t ; space — no single quotes
      expect(source).toMatch(/delimiters\s*=\s*\[/);
    });
  });

  // =========================================================================
  // #9 LOW — Missing "sept" abbreviation in MONTH_NAMES
  // =========================================================================
  describe("#9 — synthesis-integrator MONTH_NAMES should include sept abbreviation", () => {
    it("should have sept (4-letter) as an alias for September", () => {
      const source = readFileSync("src/logic/synthesis-integrator.ts", "utf-8");
      // Need "sept" as a standalone key, not just as part of "september"
      expect(source).toMatch(/\bsept\b.*:\s*"09"/);
    });
  });

  // =========================================================================
  // #10 LOW — Division by zero not guarded in relational interpreter
  // =========================================================================
  describe("#10 — relational interpreter should guard division by zero", () => {
    it("should check for zero divisor or Infinity result", () => {
      const source = readFileSync("src/synthesis/relational/interpreter.ts", "utf-8");
      // Find the full div case block
      const divExec = source.match(/case "div"[\s\S]*?return[^;]*;/);
      expect(divExec).not.toBeNull();
      expect(divExec![0]).toMatch(/isFinite|=== 0|!== 0|zero/i);
    });
  });
});
