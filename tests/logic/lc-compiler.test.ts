import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";

// =====================================================================
// Source-pattern checks (from audits)
// =====================================================================
describe("Source-pattern checks (from audits)", () => {
  // from tests/audit41.test.ts #2 — lc-compiler should validate var names and lambda params
  describe("#2 — lc-compiler should validate var names and lambda params", () => {
      it("should validate var name is a safe identifier", () => {
        const source = readFileSync("src/logic/lc-compiler.ts", "utf-8");
        const varCase = source.match(/case "var"[\s\S]*?return term\.name/);
        expect(varCase).not.toBeNull();
        // Should have regex test to validate identifier safety
        expect(varCase![0]).toMatch(/\.test\(term\.name\)/);
      });

      it("should validate lambda param is a safe identifier", () => {
        const source = readFileSync("src/logic/lc-compiler.ts", "utf-8");
        // Check that the lambda case has identifier validation for term.param
        const lambdaBlock = source.match(/case "lambda"[\s\S]*?term\.param\)/);
        expect(lambdaBlock).not.toBeNull();
        expect(lambdaBlock![0]).toMatch(/test\(term\.param\)/);
      });
    });

  // from tests/audit41.test.ts #3 — lc-compiler replace should escape $ backreferences
  describe("#3 — lc-compiler replace should escape $ backreferences", () => {
      it("should escape $ in replacement string", () => {
        const source = readFileSync("src/logic/lc-compiler.ts", "utf-8");
        const replaceCase = source.match(/case "replace"[\s\S]*?\.replace\(/);
        expect(replaceCase).not.toBeNull();
        // Should escape $ in the replacement to prevent backreference injection
        expect(replaceCase![0]).toMatch(/\$\$|\\\$/);
      });
    });

  // from tests/audit41.test.ts #10 — lc-compiler match should reject negative group
  describe("#10 — lc-compiler match should reject negative group", () => {
      it("should guard against negative group index", () => {
        const source = readFileSync("src/logic/lc-compiler.ts", "utf-8");
        // The match case should check for negative group and return "null"
        const matchCase = source.match(/case "match"[\s\S]*?term\.group\s*<\s*0/);
        expect(matchCase).not.toBeNull();
      });
    });

  // from tests/audit42.test.ts #5 — lc-compiler escapeRegex should escape newlines
  describe("#5 — lc-compiler escapeRegex should escape newlines", () => {
      it("should escape newline characters in regex patterns", () => {
        const source = readFileSync("src/logic/lc-compiler.ts", "utf-8");
        const escapeRegexFn = source.match(/function escapeRegex[\s\S]*?\n\}/);
        expect(escapeRegexFn).not.toBeNull();
        // Should escape \n or \r in patterns
        expect(escapeRegexFn![0]).toMatch(/\\n|\\r|\\\\n|\\\\r/);
      });
    });

  // from tests/audit44.test.ts #2 — lc-compiler match should validate regex pattern
  describe("#2 — lc-compiler match should validate regex pattern", () => {
      it("should call validateRegex on the pattern", () => {
        const source = readFileSync("src/logic/lc-compiler.ts", "utf-8");
        const matchCase = source.match(/case "match"[\s\S]*?case "replace"/);
        expect(matchCase).not.toBeNull();
        expect(matchCase![0]).toMatch(/validateRegex/);
      });
    });

  // from tests/audit45.test.ts #1 — lc-compiler escapeString should escape backticks
  describe("#1 — lc-compiler escapeString should escape backticks", () => {
      it("should escape backtick characters in escapeString", () => {
        const source = readFileSync("src/logic/lc-compiler.ts", "utf-8");
        const escapeFn = source.match(/function escapeString[\s\S]*?\n\}/);
        expect(escapeFn).not.toBeNull();
        expect(escapeFn![0]).toMatch(/`/);
      });
    });

  // from tests/audit45.test.ts #2 — lc-compiler escapeString should escape template interpolation
  describe("#2 — lc-compiler escapeString should escape template interpolation", () => {
      it("should escape ${ sequences to prevent template injection", () => {
        const source = readFileSync("src/logic/lc-compiler.ts", "utf-8");
        const escapeFn = source.match(/function escapeString[\s\S]*?\n\}/);
        expect(escapeFn).not.toBeNull();
        // Should escape $ to prevent ${} injection in template literals
        expect(escapeFn![0]).toMatch(/\\\$|\\`|\$\{/);
      });
    });

  // from tests/audit45.test.ts #10 — lc-compiler replace should escape backticks in to value
  describe("#10 — lc-compiler replace should escape backticks in to value", () => {
      it("should use escapeString which handles backticks for the replacement", () => {
        // This is fixed by #1/#2 — escapeString now escapes backticks and ${
        // Verify escapeString is used AND it handles template chars
        const source = readFileSync("src/logic/lc-compiler.ts", "utf-8");
        const escapeFn = source.match(/function escapeString[\s\S]*?\n\}/);
        expect(escapeFn).not.toBeNull();
        // escapeString must handle backticks since it's used in template literal contexts
        expect(escapeFn![0]).toMatch(/\\`/);
      });
    });

  // from tests/audit46.test.ts #6 — lc-compiler replace should validate regex pattern
  describe("#6 — lc-compiler replace should validate regex pattern", () => {
      it("should call validateRegex on from pattern", () => {
        const source = readFileSync("src/logic/lc-compiler.ts", "utf-8");
        const replaceCase = source.match(/case "replace"[\s\S]*?case "split"/);
        expect(replaceCase).not.toBeNull();
        expect(replaceCase![0]).toMatch(/validateRegex/);
      });
    });

  // from tests/audit73.test.ts #1 — lc-compiler match should cap group number
  describe("#1 — lc-compiler match should cap group number", () => {
      it("should reject excessively large group numbers", () => {
        const source = readFileSync("src/logic/lc-compiler.ts", "utf-8");
        const matchCase = source.indexOf('case "match"');
        expect(matchCase).toBeGreaterThan(-1);
        const block = source.slice(matchCase, matchCase + 200);
        expect(block).toMatch(/group\s*>\s*99|group\s*>=\s*100/);
      });
    });

  // from tests/audit73.test.ts #4 — lc-compiler split should validate delimiter length
  describe("#4 — lc-compiler split should validate delimiter length", () => {
      it("should check delimiter is non-empty and bounded", () => {
        const source = readFileSync("src/logic/lc-compiler.ts", "utf-8");
        const splitCase = source.indexOf('case "split"');
        expect(splitCase).toBeGreaterThan(-1);
        const block = source.slice(splitCase, splitCase + 300);
        // Must have explicit delimiter validation (length check or empty check)
        expect(block).toMatch(/term\.delim\.length|!term\.delim\b|term\.delim\s*===\s*""/);
      });
    });

});
